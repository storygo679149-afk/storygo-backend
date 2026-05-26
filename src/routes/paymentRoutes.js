const express = require('express');
const router = express.Router();
const stripe = require('../config/stripe');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/authenticate');
const paymentController = require('../controllers/paymentController');

if (!stripe) {
  router.all('*', (req, res) => res.status(503).json({ error: 'Stripe not configured' }));
  return module.exports = router;
}

// Public: list plans
router.get('/plans', async (req, res) => {
  const result = await query('SELECT * FROM subscription_plans WHERE is_active = true');
  res.json({ plans: result.rows });
});

// All below require authentication
router.use(authenticate);

router.post('/create-checkout-session', paymentController.createCheckoutSession);
router.get('/subscription/status', paymentController.getSubscriptionStatus);
router.post('/subscription/cancel', paymentController.cancelSubscription);

module.exports = router;