const stripe = require('../config/stripe');
const { query } = require('../config/database');
const environment = require('../config/environment');

// Create a Stripe Checkout session (subscription)
exports.createCheckoutSession = async (req, res) => {
  try {
    const { planId } = req.body;
    const user = req.user;

    const plan = await query('SELECT * FROM subscription_plans WHERE id = $1', [planId]);
    if (!plan.rows.length) return res.status(404).json({ error: 'Plan not found' });

    // Get or create Stripe customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id }
      });
      customerId = customer.id;
      await query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, user.id]);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'inr',
          product_data: { name: plan.rows[0].name },
          unit_amount: plan.rows[0].price_amount,
          recurring: { interval: plan.rows[0].interval }
        },
        quantity: 1
      }],
      mode: 'subscription',
      success_url: `${environment.CLIENT_URL}/subscription?success=true`,
      cancel_url: `${environment.CLIENT_URL}/subscription`,
      metadata: { userId: user.id, planId: plan.rows[0].id }
    });

    return res.json({ sessionUrl: session.url });
  } catch (error) {
    console.error('Checkout session error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Handle Stripe webhook
exports.handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, environment.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata.userId;
        // Activate premium for user
        await query('UPDATE users SET is_premium = true, subscription_plan = $1 WHERE id = $2',
          [session.metadata.planId, userId]);
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        const customer = await stripe.customers.retrieve(invoice.customer);
        const userId = customer.metadata.userId;
        if (userId && invoice.subscription) {
          // Extend expiration based on billing period
          const sub = await stripe.subscriptions.retrieve(invoice.subscription);
          await query(
            `UPDATE users SET is_premium = true, subscription_expires_at = to_timestamp($1) WHERE id = $2`,
            [sub.current_period_end, userId]
          );
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customer = await stripe.customers.retrieve(subscription.customer);
        const userId = customer.metadata.userId;
        if (userId) {
          await query('UPDATE users SET is_premium = false, subscription_plan = NULL WHERE id = $1', [userId]);
        }
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }

  res.json({ received: true });
};

// Get subscription status
exports.getSubscriptionStatus = async (req, res) => {
  const user = await query('SELECT is_premium, subscription_plan, subscription_expires_at FROM users WHERE id = $1', [req.user.id]);
  if (!user.rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(user.rows[0]);
};

// Cancel subscription
exports.cancelSubscription = async (req, res) => {
  const user = req.user;
  if (!user.stripe_customer_id) return res.status(400).json({ error: 'No Stripe customer' });
  
  const subscriptions = await stripe.subscriptions.list({ customer: user.stripe_customer_id, status: 'active', limit: 1 });
  if (subscriptions.data.length === 0) return res.status(404).json({ error: 'No active subscription' });
  
  await stripe.subscriptions.cancel(subscriptions.data[0].id);  // will trigger webhook to set is_premium=false
  
  res.json({ message: 'Subscription cancelled' });
};