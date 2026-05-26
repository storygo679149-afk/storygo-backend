require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const stripeKey = process.env.STRIPE_SECRET_KEY;

if (!stripeKey) {
  console.error('❌ STRIPE_SECRET_KEY is missing. Stripe is disabled.');
  module.exports = null;
} else {
  module.exports = require('stripe')(stripeKey);
}