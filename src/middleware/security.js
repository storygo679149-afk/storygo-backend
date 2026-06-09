// src/middleware/security.js
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const xss = require('xss-clean');
const cors = require('cors');

const applySecurityMiddleware = (app, env) => {
  // 1. Helmet – sets secure HTTP headers (safe)
  app.use(helmet({
    contentSecurityPolicy: false, // allow external scripts (adjust as needed)
  }));

  // 2. CORS – allow your frontend domains
  app.use(cors({
    origin: [
      'https://storygo-frontend.vercel.app',
      'http://localhost:3000'
    ],
    credentials: true,
    optionsSuccessStatus: 200,
  }));

  // 3. Rate limiting – increased limit to avoid blocking legitimate requests
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500,                  // allow 500 requests per IP per window (was likely 100)
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for your frontend IP (if known)
    // skip: (req) => req.ip === 'your-frontend-ip'
  });
  app.use('/api', limiter); // apply to all API routes

  // 4. Data sanitization (safe)
  app.use(mongoSanitize());               // prevents NoSQL injection
  app.use(xss());                         // prevents XSS attacks
  app.use(hpp());                         // prevents HTTP parameter pollution
};

module.exports = { applySecurityMiddleware };
