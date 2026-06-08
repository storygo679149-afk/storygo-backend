const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { generateOTP, sendVerificationEmail } = require('../services/emailService');
const { pool } = require('../config/database');

const generateToken = (user) => {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

const generateTempToken = (userId, email) => {
  return jwt.sign(
    { userId, email, purpose: 'login_otp' },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  );
};

const formatUser = (user) => ({
  id: user.id,
  email: user.email,
  username: user.username,
  full_name: user.full_name,
  role: user.role,
  is_verified: user.is_verified,
});

// ─────────────────────────────────────────────────────────────────
// REGISTER (unchanged, only email uniqueness)
// ─────────────────────────────────────────────────────────────────
exports.register = async (req, res) => {
  try {
    const { username, email, password, full_name } = req.body;
    if (!username || !email || !password || !full_name) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    const lowerEmail = email.toLowerCase();

    const newUser = await pool.query(
      `INSERT INTO users (id, username, email, password_hash, full_name, is_verified, otp_code, otp_expires_at, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING id, email, username, full_name, role, is_verified`,
      [uuidv4(), username, lowerEmail, hashedPassword, full_name, false, otp, otpExpires, 'user']
    );

    sendVerificationEmail(email, otp).catch(err => console.error('Email error:', err));

    return res.status(201).json({
      success: true,
      message: 'Registration successful! Please check your email for the verification code.',
      user: formatUser(newUser.rows[0]),
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────
// VERIFY OTP (for signup)
// ─────────────────────────────────────────────────────────────────
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    const userRes = await pool.query(
      `SELECT id, email, username, full_name, role, is_verified, otp_code, otp_expires_at
       FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = userRes.rows[0];

    if (user.is_verified) {
      const token = generateToken(user);
      return res.status(200).json({
        success: true,
        message: 'Account already verified. Logged in.',
        token,
        user: formatUser(user),
      });
    }

    if (user.otp_code !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }
    if (new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({ success: false, message: 'Code expired. Please request a new one.' });
    }

    await pool.query(
      `UPDATE users SET is_verified = TRUE, otp_code = NULL, otp_expires_at = NULL WHERE id = $1`,
      [user.id]
    );

    const token = generateToken(user);
    return res.status(200).json({
      success: true,
      message: 'Account verified successfully!',
      token,
      user: formatUser({ ...user, is_verified: true }),
    });
  } catch (error) {
    console.error('OTP verify error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────
// RESEND OTP (for signup)
// ─────────────────────────────────────────────────────────────────
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const userRes = await pool.query(
      'SELECT id, email, is_verified FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = userRes.rows[0];
    if (user.is_verified) {
      return res.status(400).json({ success: false, message: 'Account already verified' });
    }

    const newOtp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query(
      'UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE id = $3',
      [newOtp, otpExpires, user.id]
    );

    await sendVerificationEmail(email, newOtp);
    return res.status(200).json({ success: true, message: 'New verification code sent' });
  } catch (error) {
    console.error('Resend OTP error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────
// LOGIN – sends OTP if credentials are correct
// ─────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const userRes = await pool.query(
      `SELECT id, email, username, full_name, password_hash, role, is_verified
       FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    if (userRes.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const user = userRes.rows[0];

    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        message: 'Account not verified. Please verify your email first.',
        requiresVerification: true,
        email: user.email,
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate OTP for login and store in user record (overwrites any previous OTP)
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query(
      `UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE id = $3`,
      [otp, otpExpires, user.id]
    );

    // Send OTP email
    await sendVerificationEmail(email, otp);

    // Create a temporary token (valid 10 min) to link the OTP verification request
    const tempToken = generateTempToken(user.id, user.email);

    return res.status(200).json({
      success: true,
      message: 'OTP sent to your email. Please verify to complete login.',
      tempToken,
      email: user.email,
      requiresVerification: true,   // tell frontend to show OTP screen
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────
// VERIFY LOGIN OTP – final step after OTP
// ─────────────────────────────────────────────────────────────────
exports.verifyLoginOTP = async (req, res) => {
  try {
    const { email, otp, tempToken } = req.body;
    if (!email || !otp || !tempToken) {
      return res.status(400).json({ success: false, message: 'Email, OTP and temporary token required' });
    }

    // Verify temporary token
    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
      if (decoded.purpose !== 'login_otp') throw new Error();
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired temporary token. Please login again.' });
    }

    const userRes = await pool.query(
      `SELECT id, email, username, full_name, role, is_verified, otp_code, otp_expires_at
       FROM users WHERE LOWER(email) = LOWER($1) AND id = $2`,
      [email, decoded.userId]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = userRes.rows[0];

    if (user.otp_code !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }
    if (new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({ success: false, message: 'OTP expired. Please login again.' });
    }

    // Clear OTP after successful login
    await pool.query(`UPDATE users SET otp_code = NULL, otp_expires_at = NULL WHERE id = $1`, [user.id]);

    // Update last login timestamp
    await pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]);

    const finalToken = generateToken(user);
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token: finalToken,
      user: formatUser(user),
    });
  } catch (error) {
    console.error('Verify login OTP error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────────────────────────
exports.logout = (req, res) => {
  return res.status(200).json({ success: true, message: 'Logged out' });
};
