const rateLimit = require('express-rate-limit');

const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,                        // reduced from 1000
  message: {
    status: 'error',
    message: 'Too many requests. Please try again later.'
  }
});

module.exports = rateLimiter;

module.exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    status: 'error',
    message: 'Too many login attempts.'
  }
});

module.exports.uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: {
    status: 'error',
    message: 'Too many uploads. Please try again later.'
  }
});