const express = require('express');
const router = express.Router();
const {
  register,
  login,
  verifyOTP,
  resendOTP,
  logout,
} = require('../controllers/authController');

// ── Public Routes ────────────────────────────────────────────
router.post('/register', register);
router.post('/login', login);          // Step 1: email+pass → OTP bhejo
router.post('/verify-otp', verifyOTP); // Step 2: OTP → final JWT
router.post('/resend-otp', resendOTP); // OTP resend (60s cooldown)
router.post('/logout', logout);

module.exports = router;
