// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { generateOTP, sendVerificationEmail } = require('../services/emailService');
const { pool } = require('../config/database');

// Helper to generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * Register a new user and send OTP email.
 */
const register = async (req, res) => {
  try {
    const { username, email, password, full_name } = req.body;

    // 1. Validate input
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
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ success: false, message: 'Username can only contain letters, numbers, and underscores' });
    }

    // 2. Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase(), username]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'User with this email or username already exists' });
    }

    // 3. Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const newUser = await pool.query(
      `INSERT INTO users (id, username, email, password_hash, name, is_verified, otp_code, otp_expires_at, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING id, email, username, name, role, is_verified`,
      [uuidv4(), username, email.toLowerCase(), hashedPassword, full_name, false, otp, otpExpires, 'user']
    );

    // 4. Send OTP email
    await sendVerificationEmail(email, otp);

    return res.status(201).json({
      success: true,
      message: 'Registration successful! Please check your email for the verification code.',
      user: newUser.rows[0],
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ success: false, message: 'Server error, please try again later' });
  }
};

/**
 * Verify OTP and activate user account.
 */
const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    // Find user with valid OTP
    const userResult = await pool.query(
      `SELECT id, email, username, name, role, is_verified, otp_code, otp_expires_at
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Check if already verified
    if (user.is_verified) {
      const token = generateToken(user);
      return res.status(200).json({
        success: true,
        message: 'Account already verified. Logged in successfully.',
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
          role: user.role,
          isVerified: user.is_verified,
        },
      });
    }

    // Verify OTP
    if (user.otp_code !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }

    if (new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({ success: false, message: 'Verification code has expired. Please request a new one.' });
    }

    // Mark user as verified
    await pool.query(
      `UPDATE users SET is_verified = TRUE, otp_code = NULL, otp_expires_at = NULL WHERE id = $1`,
      [user.id]
    );

    // Generate JWT token
    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: 'Account verified successfully!',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role,
        isVerified: true,
      },
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    return res.status(500).json({ success: false, message: 'Server error, please try again later' });
  }
};

/**
 * Resend OTP to user's email.
 */
const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    // Find user
    const userResult = await pool.query(
      `SELECT id, email, is_verified FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userResult.rows[0];

    if (user.is_verified) {
      return res.status(400).json({ success: false, message: 'Account already verified' });
    }

    // Generate new OTP
    const newOtp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE id = $3`,
      [newOtp, otpExpires, user.id]
    );

    // Resend email
    await sendVerificationEmail(email, newOtp);

    return res.status(200).json({
      success: true,
      message: 'New verification code sent to your email',
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    return res.status(500).json({ success: false, message: 'Server error, please try again later' });
  }
};

/**
 * Login user with email and password (must be verified).
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    // Find user by email
    const userResult = await pool.query(
      `SELECT id, email, username, name, password_hash, role, profile_picture, subscription_type, is_verified
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = userResult.rows[0];

    // Check if account is verified
    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        message: 'Account not verified. Please verify your email first.',
        requiresVerification: true,
        email: user.email,
      });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = generateToken(user);

    // Update last_login timestamp
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role || 'user',
        profilePicture: user.profile_picture,
        subscriptionType: user.subscription_type || 'free',
        isVerified: user.is_verified,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error, please try again later' });
  }
};

/**
 * Logout user (client-side token removal).
 */
const logout = (req, res) => {
  return res.status(200).json({ success: true, message: 'Logged out successfully' });
};

module.exports = { register, verifyOTP, resendOTP, login, logout };
