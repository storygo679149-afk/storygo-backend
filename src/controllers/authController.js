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

// Register
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

    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase(), username]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    // Insert using full_name column
    const newUser = await pool.query(
      `INSERT INTO users (id, username, email, password_hash, full_name, is_verified, otp_code, otp_expires_at, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING id, email, username, full_name, role, is_verified`,
      [uuidv4(), username, email.toLowerCase(), hashedPassword, full_name, false, otp, otpExpires, 'user']
    );

    await sendVerificationEmail(email, otp);

    return res.status(201).json({
      success: true,
      message: 'Registration successful! Please check your email for the verification code.',
      user: newUser.rows[0],
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    const userRes = await pool.query(
      `SELECT id, email, username, full_name, role, is_verified, otp_code, otp_expires_at
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
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
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
          isVerified: true
        }
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
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        isVerified: true
      }
    });
  } catch (error) {
    console.error('OTP verify error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Resend OTP
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const userRes = await pool.query(
      'SELECT id, email, is_verified FROM users WHERE email = $1',
      [email.toLowerCase()]
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

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const userRes = await pool.query(
      `SELECT id, email, username, full_name, password_hash, role, is_verified
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
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
        email: user.email
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = generateToken(user);
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        isVerified: user.is_verified
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Logout
exports.logout = (req, res) => {
  return res.status(200).json({ success: true, message: 'Logged out' });
};
