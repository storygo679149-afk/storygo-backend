const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database'); // apna existing db pool
const { generateOTP, getOTPExpiry } = require('../utils/otpHelper');
const { sendOTPEmail } = require('../utils/emailService');

// ──────────────────────────────────────────────────────────────────────────────
// HELPER: mask email for safe display  e.g. us****@gmail.com
// ──────────────────────────────────────────────────────────────────────────────
const maskEmail = (email) => {
  const [user, domain] = email.split('@');
  const visible = user.slice(0, 2);
  return `${visible}****@${domain}`;
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// ──────────────────────────────────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { username, email, password, name } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'username, email aur password required hain',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password kam se kam 6 characters ka hona chahiye',
      });
    }

    const emailLower = email.toLowerCase().trim();

    // Duplicate check
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [emailLower, username.trim()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Yeh email ya username pehle se registered hai',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, name, is_active, created_at)
       VALUES ($1, $2, $3, $4, TRUE, NOW())
       RETURNING id, username, email, name`,
      [username.trim(), emailLower, passwordHash, name?.trim() || username.trim()]
    );

    const user = result.rows[0];

    return res.status(201).json({
      success: true,
      message: 'Account bana diya! Ab login karo.',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('[Register] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error. Dobara try karo.',
    });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login  →  credentials check → OTP send → tempToken return
// ──────────────────────────────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email aur password dono required hain',
      });
    }

    const emailLower = email.toLowerCase().trim();

    // User fetch
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND is_active = TRUE',
      [emailLower]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email ya password',
      });
    }

    const user = userResult.rows[0];

    // Password verify
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email ya password',
      });
    }

    // Purane unused OTPs clean karo
    await pool.query(
      'DELETE FROM email_otps WHERE user_id = $1',
      [user.id]
    );

    // Naya OTP generate + save
    const otp = generateOTP();
    const expiresAt = getOTPExpiry();

    await pool.query(
      'INSERT INTO email_otps (user_id, otp_code, expires_at) VALUES ($1, $2, $3)',
      [user.id, otp, expiresAt]
    );

    // OTP email bhejo
    await sendOTPEmail(user.email, otp, user.name || user.username);

    // Short-lived temp token — sirf OTP step ke liye
    const tempToken = jwt.sign(
      { userId: user.id, step: 'otp_pending' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    return res.status(200).json({
      success: true,
      message: `OTP bhej diya gaya: ${maskEmail(user.email)}`,
      tempToken,
      maskedEmail: maskEmail(user.email),
    });
  } catch (error) {
    console.error('[Login] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error. Dobara try karo.',
    });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/auth/verify-otp  →  OTP check → final JWT return
// Header: Authorization: Bearer <tempToken>
// Body: { otp: "123456" }
// ──────────────────────────────────────────────────────────────────────────────
const verifyOTP = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!otp || otp.toString().trim().length !== 6) {
      return res.status(400).json({
        success: false,
        message: '6-digit OTP required hai',
      });
    }

    // Temp token extract + verify
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token missing',
      });
    }

    const tempToken = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Session expire ho gayi. Dobara login karo.',
      });
    }

    if (decoded.step !== 'otp_pending') {
      return res.status(401).json({
        success: false,
        message: 'Invalid session type',
      });
    }

    // OTP database se verify karo
    const otpResult = await pool.query(
      `SELECT * FROM email_otps
       WHERE user_id = $1
         AND otp_code = $2
         AND is_used = FALSE
         AND expires_at > NOW()`,
      [decoded.userId, otp.toString().trim()]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'OTP galat hai ya expire ho gaya',
      });
    }

    // OTP mark used + delete rest
    await pool.query('DELETE FROM email_otps WHERE user_id = $1', [decoded.userId]);

    // User fetch
    const userResult = await pool.query(
      `SELECT id, email, username, name, role, profile_picture, subscription_type
       FROM users WHERE id = $1`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Last login update
    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Final access token
    const accessToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role || 'user',
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful! Welcome back 🎉',
      token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role || 'user',
        profilePicture: user.profile_picture || null,
        subscriptionType: user.subscription_type || 'free',
      },
    });
  } catch (error) {
    console.error('[VerifyOTP] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/auth/resend-otp
// Header: Authorization: Bearer <tempToken>
// ──────────────────────────────────────────────────────────────────────────────
const resendOTP = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token missing',
      });
    }

    const tempToken = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Session expire ho gayi. Dobara login karo.',
      });
    }

    // Rate limit: 60 seconds ke baad hi resend ho
    const lastOtp = await pool.query(
      'SELECT created_at FROM email_otps WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [decoded.userId]
    );

    if (lastOtp.rows.length > 0) {
      const lastSent = new Date(lastOtp.rows[0].created_at);
      const diffSeconds = Math.floor((Date.now() - lastSent.getTime()) / 1000);
      if (diffSeconds < 60) {
        return res.status(429).json({
          success: false,
          message: `${60 - diffSeconds} seconds baad resend karo`,
          retryAfter: 60 - diffSeconds,
        });
      }
    }

    // User fetch
    const userResult = await pool.query(
      'SELECT email, name, username FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Old OTPs delete + new generate
    await pool.query('DELETE FROM email_otps WHERE user_id = $1', [decoded.userId]);

    const otp = generateOTP();
    const expiresAt = getOTPExpiry();

    await pool.query(
      'INSERT INTO email_otps (user_id, otp_code, expires_at) VALUES ($1, $2, $3)',
      [decoded.userId, otp, expiresAt]
    );

    await sendOTPEmail(user.email, otp, user.name || user.username);

    return res.status(200).json({
      success: true,
      message: 'Naya OTP bhej diya gaya!',
    });
  } catch (error) {
    console.error('[ResendOTP] Error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ──────────────────────────────────────────────────────────────────────────────
const logout = async (req, res) => {
  try {
    // Agar user logged in hai, uske OTPs clean karo
    if (req.user?.userId) {
      await pool.query('DELETE FROM email_otps WHERE user_id = $1', [req.user.userId]);
    }
    return res.status(200).json({ success: true, message: 'Logout successful' });
  } catch (error) {
    console.error('[Logout] Error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { register, login, verifyOTP, resendOTP, logout };
