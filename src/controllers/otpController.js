const { query } = require('../config/database');
const { sendOTP } = require('../services/emailService');
const crypto = require('crypto');

const generateOTP = () => crypto.randomInt(100000, 999999).toString();

exports.sendOTP = async (req, res) => {
  try {
    const { email, purpose } = req.body; // 'signup' or 'login'
    if (!email || !purpose) return res.status(400).json({ error: 'Email and purpose required' });

    // Rate limit: 1 OTP per minute per email
    const recent = await query(
      `SELECT 1 FROM otps WHERE email = $1 AND purpose = $2 AND created_at > NOW() - INTERVAL '1 minute'`,
      [email, purpose]
    );
    if (recent.rows.length > 0) {
      return res.status(429).json({ error: 'Please wait 60 seconds before requesting another OTP' });
    }

    // For signup, check if email already exists
    if (purpose === 'signup') {
      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Email already registered. Please login.' });
      }
    }

    // For login, check if email exists
    if (purpose === 'login') {
      const existing = await query('SELECT id FROM users WHERE email = $1 AND is_active = true', [email]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'No account found with this email.' });
      }
    }

    // Delete previous unused OTPs
    await query(`DELETE FROM otps WHERE email = $1 AND purpose = $2 AND is_used = false`, [email, purpose]);

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await query(
      `INSERT INTO otps (email, otp_code, purpose, expires_at) VALUES ($1, $2, $3, $4)`,
      [email, otp, purpose, expiresAt]
    );

    // Send email (fire and forget)
    sendOTP(email, otp, purpose).catch(console.error);

    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp, purpose } = req.body;
    if (!email || !otp || !purpose) {
      return res.status(400).json({ error: 'Email, OTP, and purpose required' });
    }

    const record = await query(
      `SELECT * FROM otps WHERE email = $1 AND otp_code = $2 AND purpose = $3 AND is_used = false AND expires_at > NOW()`,
      [email, otp, purpose]
    );

    if (record.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    await query(`UPDATE otps SET is_used = true WHERE id = $1`, [record.rows[0].id]);

    if (purpose === 'signup') {
      return res.json({ success: true, message: 'OTP verified. You may now complete signup.' });
    }

    if (purpose === 'login') {
      const userResult = await query(
        `SELECT id, username, email, full_name, profile_picture, is_creator, is_admin, is_premium
         FROM users WHERE email = $1 AND is_active = true`,
        [email]
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      const user = userResult.rows[0];
      const jwt = require('jsonwebtoken');
      const environment = require('../config/environment');
      const token = jwt.sign({ userId: user.id, email: user.email }, environment.JWT_SECRET, { expiresIn: environment.JWT_EXPIRE });

      res.cookie('token', token, {
        httpOnly: true,
        secure: environment.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.json({ success: true, message: 'Login successful', user, token });
    }
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
};