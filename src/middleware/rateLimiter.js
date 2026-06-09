const rateLimit = require('express-rate-limit');

// General API rate limiter – very high limit to avoid blocking legitimate traffic
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 10000,                 // allow 10,000 requests per IP per window
  message: {
    status: 'error',
    message: 'Too many requests. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth routes – still keep a reasonable limit (e.g., 50 attempts per 15 min)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { status: 'error', message: 'Too many login attempts.' }
});

// Upload routes – higher limit (500 per hour)
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 500,
  message: { status: 'error', message: 'Too many uploads. Please try again later.' }
});

module.exports = rateLimiter;
module.exports.authLimiter = authLimiter;
module.exports.uploadLimiter = uploadLimiter;
