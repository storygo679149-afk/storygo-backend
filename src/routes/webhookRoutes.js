const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Stripe requires the raw body for signature verification.
// This middleware is applied only to this route (see index.js).
router.post('/stripe', express.raw({ type: 'application/json' }), paymentController.handleWebhook);

module.exports = router;