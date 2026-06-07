// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { register, verifyOTP, resendOTP, login, logout } = require('../controllers/authController');

router.post('/register', register);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/login', login);
router.post('/logout', logout);

module.exports = router;
