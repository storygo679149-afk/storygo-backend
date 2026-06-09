// src/middleware/security.js
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const xss = require('xss-clean');
const cors = require('cors');

/**
 * Applies all security middleware to the Express app.
 * @param {Express} app - The Express application instance
 * @param {Object} env - Environment configuration object
 */
const applySecurityMiddleware = (app, env) => {
  // 1. CORS – allow specific frontend origins
  const allowedOrigins = [
    'https://storygo-frontend.vercel.app',
    'https://storygo-frontend.vercel.app/',
    'http://localhost:3000',
    'http://localhost:3001',
    env.CLIENT_URL,
  ].filter(Boolean); // remove undefined/null values

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        console.warn(`CORS blocked: ${origin}`);
        return callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 200,
  }));

  // 2. Helmet – secure HTTP headers (relaxed CSP to avoid breaking external resources)
  app.use(helmet({
    contentSecurityPolicy: false, // disable CSP for simplicity (you can customize if needed)
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // 3. Rate limiting – high limits to avoid blocking legitimate traffic on Render
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 10000,                  // allow 10,000 requests per IP per window
    message: {
      status: 'error',
      message: 'Too many requests, please try again later.'
    },
    standardHeaders: true,       // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false,        // Disable the `X-RateLimit-*` headers
    // Optional: skip rate limiting for specific IPs (e.g., your backend's internal IP)
    // skip: (req) => req.ip === '127.0.0.1'
  });
  app.use('/api', limiter);      // Apply to all API routes

  // Optional: stricter limiter for auth endpoints (but still generous)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { status: 'error', message: 'Too many authentication attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/auth', authLimiter);

  // Optional: limit for uploads (higher per hour)
  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 500,
    message: { status: 'error', message: 'Too many uploads, please try again later.' },
  });
  app.use('/api/upload', uploadLimiter); // adjust path if your upload route is different

  // 4. Data sanitization (prevent injection)
  //    - mongoSanitize works for both MongoDB and PostgreSQL (removes $ operators)
  app.use(mongoSanitize());
  //    - XSS protection
  app.use(xss());
  //    - HTTP parameter pollution protection
  app.use(hpp({
    whitelist: ['sort', 'limit', 'page', 'fields'] // allow these query params to be repeated
  }));

  // 5. Limit request body size (already done in express.json, but double-check)
  // Already set in main index.js with `express.json({ limit: '100mb' })`
};

module.exports = { applySecurityMiddleware };
