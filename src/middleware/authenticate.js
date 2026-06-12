// src/middleware/authenticate.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../config/database');

// ========== Configuration ==========
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const COOKIE_SECURE = process.env.NODE_ENV === 'production';
const COOKIE_SAME_SITE = 'strict';

// In‑memory CSRF token store (use Redis/DB in production)
const csrfTokenStore = new Map();

// ========== Helper: Generate & Verify JWT ==========
const signToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

const setJwtCookie = (res, token) => {
  res.cookie('jwt', token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
};

const clearJwtCookie = (res) => {
  res.clearCookie('jwt', {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE,
    path: '/',
  });
};

// ========== CSRF Helpers ==========
const generateCsrfToken = (userId) => {
  const token = crypto.randomBytes(32).toString('hex');
  csrfTokenStore.set(userId, {
    token,
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
  });
  return token;
};

const verifyCsrfToken = (userId, clientToken) => {
  const record = csrfTokenStore.get(userId);
  if (!record) return false;
  if (record.expires < Date.now()) {
    csrfTokenStore.delete(userId);
    return false;
  }
  return record.token === clientToken;
};

// ========== Core Authentication Middleware (Updated) ==========
// Reads JWT from HttpOnly cookie named 'jwt' (no longer from Authorization header or 'token' cookie)
const authenticate = async (req, res, next) => {
  try {
    let token;
    // Only read from the secure HttpOnly cookie
    if (req.cookies && req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required. Please login to access this resource.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const result = await query(
      `SELECT id, username, email, role, is_creator, is_admin, is_active
       FROM users WHERE id = $1 AND is_active = true`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        status: 'error',
        message: 'User account not found or has been deactivated.'
      });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ status: 'error', message: 'Invalid token. Please login again.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ status: 'error', message: 'Token expired. Please login again.' });
    }
    console.error('Authentication error:', error);
    return res.status(500).json({ status: 'error', message: 'Authentication failed due to server error.' });
  }
};

// Optional auth (still reads only from cookie)
const optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.cookies && req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const result = await query(
        `SELECT id, username, email, role, is_creator, is_admin, is_active
         FROM users WHERE id = $1 AND is_active = true`,
        [decoded.userId]
      );
      if (result.rows.length > 0) {
        req.user = result.rows[0];
      }
    }
    next();
  } catch (error) {
    next();
  }
};

// ========== Role‑Based Middleware (unchanged, but now rely on updated authenticate) ==========
const authorizeCreator = (req, res, next) => {
  if (!req.user) return res.status(401).json({ status: 'error', message: 'Authentication required.' });
  if (!req.user.is_creator) return res.status(403).json({ status: 'error', message: 'Access denied. Creator account required.' });
  next();
};

const authorizeAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ status: 'error', message: 'Authentication required.' });
  if (!req.user.is_admin && req.user.role !== 'admin') {
    return res.status(403).json({ status: 'error', message: 'Access denied. Admin account required.' });
  }
  next();
};

const authorizeOwner = (resourceType) => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id;
      let queryText;
      switch (resourceType) {
        case 'series':
          queryText = 'SELECT creator_id FROM series WHERE id = $1';
          break;
        case 'episode':
          queryText = `SELECT s.creator_id FROM episodes e JOIN series s ON e.series_id = s.id WHERE e.id = $1`;
          break;
        default:
          return res.status(400).json({ status: 'error', message: 'Invalid resource type for ownership check.' });
      }
      const result = await query(queryText, [resourceId]);
      if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Resource not found.' });
      if (result.rows[0].creator_id !== req.user.id) return res.status(403).json({ status: 'error', message: 'You do not have permission to modify this resource.' });
      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      return res.status(500).json({ status: 'error', message: 'Error checking resource ownership.' });
    }
  };
};

// ========== CSRF Protection Middleware ==========
// Use this on POST/PUT/DELETE routes AFTER `authenticate`
const csrfProtect = (req, res, next) => {
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutatingMethods.includes(req.method)) {
    return next();
  }

  const clientToken = req.headers['x-csrf-token'];
  if (!clientToken) {
    return res.status(403).json({
      status: 'error',
      message: 'CSRF token missing. Request rejected.'
    });
  }

  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Authentication required.' });
  }

  const isValid = verifyCsrfToken(req.user.id.toString(), clientToken);
  if (!isValid) {
    return res.status(403).json({
      status: 'error',
      message: 'Invalid or expired CSRF token. Please refresh the page and try again.'
    });
  }

  next();
};

// ========== New Route Handlers (Login, Logout, etc.) ==========
// These should be mounted in your main app (e.g., /api/login, /api/logout, /api/me)

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Email and password required.' });
    }

    // Fetch user with password (assuming `password` column exists)
    const userResult = await query(
      `SELECT id, username, email, role, is_creator, is_admin, is_active, password
       FROM users WHERE email = $1 AND is_active = true`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ status: 'error', message: 'Invalid email or password.' });
    }

    const user = userResult.rows[0];
    // Compare password – you likely use bcrypt. Adjust as needed.
    const bcrypt = require('bcryptjs');
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ status: 'error', message: 'Invalid email or password.' });
    }

    // Generate JWT and set HttpOnly cookie
    const token = signToken(user.id);
    setJwtCookie(res, token);

    // Generate CSRF token for this session
    const csrfToken = generateCsrfToken(user.id.toString());

    // Send response (no JWT in body!)
    res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          is_creator: user.is_creator,
          is_admin: user.is_admin,
        },
        csrfToken,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ status: 'error', message: 'Login failed due to server error.' });
  }
};

const logout = (req, res) => {
  clearJwtCookie(res);
  res.status(200).json({ status: 'success', message: 'Logged out successfully.' });
};

const getMe = async (req, res) => {
  try {
    // `authenticate` middleware already attached req.user
    if (!req.user) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated.' });
    }
    // Optionally refresh CSRF token
    const csrfToken = generateCsrfToken(req.user.id.toString());
    res.status(200).json({
      status: 'success',
      data: {
        user: req.user, // already contains id, username, email, role, is_creator, is_admin
        csrfToken,
      },
    });
  } catch (error) {
    console.error('getMe error:', error);
    res.status(500).json({ status: 'error', message: 'Could not fetch user data.' });
  }
};

const refreshCsrfToken = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Not authenticated.' });
  }
  const newCsrfToken = generateCsrfToken(req.user.id.toString());
  res.status(200).json({ csrfToken: newCsrfToken });
};

const refreshToken = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Not authenticated.' });
  }
  const newToken = signToken(req.user.id);
  setJwtCookie(res, newToken);
  const newCsrfToken = generateCsrfToken(req.user.id.toString());
  res.status(200).json({
    status: 'success',
    message: 'Token refreshed',
    csrfToken: newCsrfToken,
  });
};

// ========== Exports (Backward compatible + new functions) ==========
module.exports = {
  // Existing middleware (updated to use cookie 'jwt')
  authenticate,
  optionalAuth,
  authorizeCreator,
  authorizeAdmin,
  authorizeOwner,
  // New CSRF middleware
  csrfProtect,
  // New route handlers
  login,
  logout,
  getMe,
  refreshCsrfToken,
  refreshToken,
};
