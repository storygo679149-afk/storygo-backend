const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const {
  register, login, verifyOTP, resendOTP, logout, getCurrentUser,
} = require('../controllers/authController');

// Inline auth middleware — no external file needed
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Block temp tokens (OTP step) from accessing protected routes
    if (decoded.step === 'otp_pending') {
      return res.status(401).json({ success: false, message: 'OTP verification pending' });
    }
    req.user = decoded; // { userId, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

// ── Public Routes ─────────────────────────────────────────────
router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/logout', logout);

// ── Protected Routes ──────────────────────────────────────────
router.get('/me', authenticate, getCurrentUser);

module.exports = router;