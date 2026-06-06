const express = require('express');
const router = express.Router();
const { login, logout } = require('../controllers/authController');

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/logout (optional, mostly client-side)
router.post('/logout', logout);

// The following endpoints are REMOVED:
// router.post('/verify-otp', verifyOTP);
// router.post('/resend-otp', resendOTP);

module.exports = router;
