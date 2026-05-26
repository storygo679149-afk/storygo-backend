const jwt = require('jsonwebtoken');
const environment = require('../config/environment');
const { query } = require('../config/database');

// Protect admin routes – verify JWT + check is_admin
const requireAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Admin login required' });

    const decoded = jwt.verify(token, environment.JWT_SECRET);
    const user = await query('SELECT id, email, is_admin FROM users WHERE id = $1', [decoded.userId]);
    if (!user.rows.length || !user.rows[0].is_admin) {
      return res.status(403).json({ error: 'Admin access denied' });
    }
    req.user = user.rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Check for a specific role (e.g., 'super_admin') – you can extend this later
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

module.exports = { requireAdmin, requireRole };