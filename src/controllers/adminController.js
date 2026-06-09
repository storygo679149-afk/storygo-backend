// src/controllers/adminController.js
const { query } = require('../config/database');
const cloudinary = require('../config/cloudinary').cloudinary;

// ============================================
// ADMIN DASHBOARD
// ============================================
exports.getDashboardStats = async (req, res) => {
  try {
    const stats = await query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE is_active = true) AS total_users,
        (SELECT COUNT(*) FROM users WHERE is_premium = true) AS premium_users,
        (SELECT COUNT(*) FROM user_subscriptions WHERE status = 'active') AS active_subscriptions,
        (SELECT COUNT(*) FROM series WHERE is_active = true) AS total_series,
        (SELECT COUNT(*) FROM episodes WHERE is_active = true) AS total_episodes,
        COALESCE((SELECT SUM(amount) FROM purchases WHERE status = 'succeeded'), 0) AS total_revenue,
        (SELECT COUNT(*) FROM users WHERE created_at > CURRENT_DATE - INTERVAL '7 days') AS new_users_this_week
    `);
    res.json({ status: 'success', data: stats.rows[0] });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// Get all users data (excluding password hash) for database view
exports.getAllUsersData = async (req, res) => {
  try {
    const result = await query(`
      SELECT id, username, email, full_name, profile_picture,
             is_creator, is_admin, is_premium, is_active,
             created_at, last_login_at, preferred_language
      FROM users
      ORDER BY created_at DESC
    `);
    res.json({
      status: 'success',
      data: { users: result.rows }
    });
  } catch (error) {
    console.error('Get all users data error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch users data' });
  }
};

// ============================================
// USERS
// ============================================
exports.getAllUsers = async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const offset = (page - 1) * limit;
  let where = '';
  const params = [];
  if (search) {
    where = 'AND (username ILIKE $1 OR email ILIKE $1)';
    params.push(`%${search}%`);
  }
  const countQuery = `SELECT COUNT(*) FROM users WHERE is_active = true ${where}`;
  const countRes = await query(countQuery, search ? [`%${search}%`] : []);
  params.push(limit, offset);
  const dataQuery = `
    SELECT id, username, email, full_name, is_premium, is_creator, is_admin,
           created_at, last_login_at
    FROM users
    WHERE is_active = true ${where}
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const usersRes = await query(dataQuery, params);
  res.json({
    users: usersRes.rows,
    total: parseInt(countRes.rows[0].count),
  });
};

exports.toggleUserStatus = async (req, res) => {
  const { userId } = req.params;
  const { is_active } = req.body;
  try {
    await query('UPDATE users SET is_active = $1 WHERE id = $2', [is_active, userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update user status' });
  }
};

// ============================================
// SERIES
// ============================================
exports.getAllSeries = async (req, res) => {
  try {
    const result = await query(`
      SELECT s.*, u.full_name AS creator_name
      FROM series s 
      JOIN users u ON s.creator_id = u.id
      ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get all series error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch series' });
  }
};

exports.updateSeriesStatus = async (req, res) => {
  const { seriesId } = req.params;
  const { is_active } = req.body;
  try {
    await query('UPDATE series SET is_active = $1 WHERE id = $2', [is_active, seriesId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Update series status error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update series status' });
  }
};

// ============================================
// EPISODES
// ============================================
exports.getAllEpisodes = async (req, res) => {
  try {
    const result = await query(`
      SELECT e.*, s.title AS series_title, s.id AS series_id
      FROM episodes e 
      JOIN series s ON e.series_id = s.id
      ORDER BY e.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get all episodes error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch episodes' });
  }
};

// ============================================
// PAYMENTS
// ============================================
exports.getPayments = async (req, res) => {
  try {
    const result = await query(`
      SELECT p.*, u.username, u.email
      FROM purchases p 
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch payments' });
  }
};

// ============================================
// SUBSCRIPTIONS
// ============================================
exports.getSubscriptions = async (req, res) => {
  try {
    const result = await query(`
      SELECT us.*, u.username, u.email, p.name AS plan_name
      FROM user_subscriptions us
      JOIN users u ON us.user_id = u.id
      JOIN subscription_plans p ON us.plan_id = p.id
      ORDER BY us.created_at DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch subscriptions' });
  }
};

// ============================================
// RATINGS
// ============================================
exports.getAllRatings = async (req, res) => {
  try {
    const result = await query(`
      SELECT r.id, r.rating, r.review_text, r.created_at,
             u.username, s.title AS series_title
      FROM ratings r
      JOIN users u ON r.user_id = u.id
      JOIN series s ON r.series_id = s.id
      ORDER BY r.created_at DESC
    `);
    res.json({ status: 'success', data: { reviews: result.rows } });
  } catch (error) {
    console.error('Get all ratings error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to load ratings' });
  }
};

exports.deleteRating = async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM ratings WHERE id = $1', [id]);
    res.json({ status: 'success', message: 'Review deleted' });
  } catch (error) {
    console.error('Delete rating error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to delete rating' });
  }
};

// ============================================
// PLANS
// ============================================
exports.updatePlan = async (req, res) => {
  const { id } = req.params;
  const { name, price, interval, trial_days } = req.body;
  try {
    const result = await query(
      `UPDATE subscription_plans
       SET name = $1, price_amount = $2, interval = $3, trial_days = $4
       WHERE id = $5 RETURNING *`,
      [name, price, interval, trial_days || 0, id]
    );
    res.json({ status: 'success', data: { plan: result.rows[0] } });
  } catch (error) {
    console.error('Update plan error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update plan' });
  }
};

exports.createPlan = async (req, res) => {
  const { name, price, interval, trial_days } = req.body;
  try {
    const result = await query(
      `INSERT INTO subscription_plans (name, price_amount, interval, trial_days)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, price, interval, trial_days || 0]
    );
    res.status(201).json({ status: 'success', data: { plan: result.rows[0] } });
  } catch (error) {
    console.error('Create plan error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to create plan' });
  }
};

// ============================================
// CREATOR REVENUE SHARE
// ============================================
exports.updateCreatorRevenueShare = async (req, res) => {
  const { id } = req.params;
  const { revenue_share } = req.body;
  try {
    await query('UPDATE users SET revenue_share = $1 WHERE id = $2', [revenue_share, id]);
    res.json({ status: 'success', message: 'Revenue share updated' });
  } catch (error) {
    console.error('Update revenue share error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update revenue share' });
  }
};

// ============================================
// STORAGE STATS
// ============================================
exports.getStorageStats = async (req, res) => {
  try {
    const usage = await cloudinary.api.usage();
    const dbStats = await query(`
      SELECT COUNT(*) AS total_episodes,
             COALESCE(SUM(file_size_bytes), 0) AS total_size_bytes
      FROM episodes WHERE is_active = true
    `);
    res.json({
      status: 'success',
      data: {
        stats: {
          cloudinary: {
            storage_bytes: usage.storage?.usage || 0,
            bandwidth_bytes: usage.bandwidth?.usage || 0,
            requests: usage.requests?.usage || 0,
            resources_count: usage.resources?.usage || 0,
          },
          database: {
            total_episodes: parseInt(dbStats.rows[0].total_episodes),
            total_size_bytes: parseInt(dbStats.rows[0].total_size_bytes),
          },
          orphaned_files: [],
          orphaned_note: 'Orphan detection coming soon',
        },
      },
    });
  } catch (error) {
    console.error('Storage stats error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch storage stats' });
  }
};

// ============================================
// CREATORS
// ============================================
exports.getCreators = async (req, res) => {
  try {
    const result = await query(`
      SELECT u.id, u.username, u.email, u.full_name,
             COALESCE(s.cnt, 0) AS series_count,
             COALESCE(f.cnt, 0) AS followers_count
      FROM users u
      LEFT JOIN (
        SELECT creator_id, COUNT(*) AS cnt
        FROM series
        WHERE is_active = true
        GROUP BY creator_id
      ) s ON u.id = s.creator_id
      LEFT JOIN (
        SELECT following_id, COUNT(*) AS cnt
        FROM user_following
        GROUP BY following_id
      ) f ON u.id = f.following_id
      WHERE u.is_creator = true AND u.is_active = true
      ORDER BY u.username
    `);
    res.json({ status: 'success', data: { creators: result.rows } });
  } catch (error) {
    console.error('Get creators error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to load creators' });
  }
};

// ============================================
// LISTENER CITIES
// ============================================
exports.getListenerCities = async (req, res) => {
  try {
    const result = await query(`
      SELECT city, COUNT(*) AS listeners
      FROM listener_locations
      GROUP BY city
      ORDER BY listeners DESC
      LIMIT 50
    `);
    res.json({ status: 'success', data: { cities: result.rows } });
  } catch (error) {
    console.error('Listener cities error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to load data' });
  }
};

// ============================================
// AUDIT LOGS
// ============================================
exports.getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, action, admin } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (action) {
      whereClause += ` AND al.action ILIKE $${paramCount}`;
      params.push(`%${action}%`);
      paramCount++;
    }
    if (admin) {
      whereClause += ` AND (u.username ILIKE $${paramCount} OR u.full_name ILIKE $${paramCount})`;
      params.push(`%${admin}%`);
      paramCount++;
    }

    const countQuery = `
      SELECT COUNT(*) FROM admin_audit_logs al
      JOIN users u ON al.admin_id = u.id
      ${whereClause}
    `;
    const countRes = await query(countQuery, params);

    params.push(limit, offset);
    const dataQuery = `
      SELECT al.id, al.action, al.ip_address, al.created_at,
             u.username AS admin_username, u.full_name AS admin_full_name
      FROM admin_audit_logs al
      JOIN users u ON al.admin_id = u.id
      ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    const dataRes = await query(dataQuery, params);

    res.json({
      status: 'success',
      data: {
        logs: dataRes.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countRes.rows[0].count),
          pages: Math.ceil(parseInt(countRes.rows[0].count) / limit),
        },
      },
    });
  } catch (error) {
    console.error('Audit logs error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch audit logs' });
  }
};
