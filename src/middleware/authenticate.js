// src/middleware/authenticate.js
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

const authenticate = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required. Please login to access this resource.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Added `is_admin` to the SELECT query
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

const optionalAuth = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

const authorizeCreator = (req, res, next) => {
  if (!req.user) return res.status(401).json({ status: 'error', message: 'Authentication required.' });
  if (!req.user.is_creator) return res.status(403).json({ status: 'error', message: 'Access denied. Creator account required.' });
  next();
};

// ✅ New: Admin middleware
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

module.exports = { authenticate, optionalAuth, authorizeCreator, authorizeAdmin, authorizeOwner };
