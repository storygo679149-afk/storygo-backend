// src/controllers/adminController.js
const { query } = require('../config/database');

// Helper: log admin action
const logAdminAction = async (adminId, action, targetType, targetId, details = {}, ip = null) => {
  await query(
    `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [adminId, action, targetType, targetId, details, ip]
  );
};

// ======================= USER MANAGEMENT =======================
exports.getUsers = async (req, res) => {
  const { page = 1, limit = 20, search = '' } = req.query;
  const offset = (page - 1) * limit;
  let whereClause = '';
  const params = [];
  if (search) {
    whereClause = 'WHERE (username ILIKE $1 OR email ILIKE $1)';
    params.push(`%${search}%`);
  }
  const countRes = await query(`SELECT COUNT(*) FROM users ${whereClause}`, params);
  const dataRes = await query(`
    SELECT id, username, email, full_name, role, is_creator, is_admin, is_active, created_at, last_login_at
    FROM users ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, limit, offset]);
  res.json({ status: 'success', data: dataRes.rows, total: parseInt(countRes.rows[0].count) });
};

exports.getUserDetails = async (req, res) => {
  const { id } = req.params;
  const user = await query('SELECT * FROM users WHERE id = $1', [id]);
  if (user.rows.length === 0) return res.status(404).json({ status: 'error', message: 'User not found' });
  const history = await query(`
    SELECT lh.*, e.title as episode_title, s.title as series_title
    FROM listening_history lh
    LEFT JOIN episodes e ON lh.episode_id = e.id
    LEFT JOIN series s ON e.series_id = s.id
    WHERE lh.user_id = $1
    ORDER BY lh.listened_at DESC LIMIT 50
  `, [id]);
  res.json({ status: 'success', user: user.rows[0], listeningHistory: history.rows });
};

exports.updateUserStatus = async (req, res) => {
  const { id } = req.params;
  const { action, reason } = req.body; // ban, suspend, warn
  const adminId = req.user.id;
  await logAdminAction(adminId, `user_${action}`, 'user', id, { reason }, req.ip);
  if (action === 'ban') {
    await query('UPDATE users SET is_active = false, status = $1 WHERE id = $2', ['banned', id]);
  } else if (action === 'suspend') {
    await query('UPDATE users SET is_active = false, status = $1 WHERE id = $2', ['suspended', id]);
  } else if (action === 'warn') {
    await query('UPDATE users SET warning_count = COALESCE(warning_count,0) + 1 WHERE id = $1', [id]);
  }
  res.json({ status: 'success', message: `User ${action}ned` });
};

// ======================= CREATOR ONBOARDING =======================
exports.getCreatorOnboarding = async (req, res) => {
  const { status = 'pending' } = req.query;
  const result = await query(`
    SELECT co.*, u.username, u.email, u.full_name
    FROM creator_onboarding co
    JOIN users u ON co.user_id = u.id
    WHERE co.status = $1
    ORDER BY co.submitted_at ASC
  `, [status]);
  res.json({ status: 'success', data: result.rows });
};

exports.approveCreator = async (req, res) => {
  const { id } = req.params;
  const { revenue_share } = req.body;
  const adminId = req.user.id;
  const onboarding = await query('SELECT user_id FROM creator_onboarding WHERE id = $1', [id]);
  if (onboarding.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Request not found' });
  await query(`
    UPDATE creator_onboarding
    SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), revenue_share = COALESCE($2, revenue_share)
    WHERE id = $3
  `, [adminId, revenue_share, id]);
  await query('UPDATE users SET is_creator = true, role = $1 WHERE id = $2', ['creator', onboarding.rows[0].user_id]);
  await logAdminAction(adminId, 'approve_creator', 'creator_onboarding', id, { revenue_share }, req.ip);
  res.json({ status: 'success', message: 'Creator approved' });
};

// ======================= ANALYTICS =======================
exports.getAnalytics = async (req, res) => {
  const { range = 'week' } = req.query;
  let intervalDays = 7;
  if (range === 'month') intervalDays = 30;
  else if (range === 'year') intervalDays = 365;
  // daily play counts
  const plays = await query(`
    SELECT DATE(listened_at) as date, COUNT(*) as count
    FROM listening_history
    WHERE listened_at > NOW() - INTERVAL '${intervalDays} days'
    GROUP BY DATE(listened_at)
    ORDER BY date
  `);
  // drop-off heatmap (simplified: top 10 episodes with earliest exit)
  const dropoff = await query(`
    SELECT e.title, AVG(progress_seconds) as avg_progress, COUNT(*) as listens
    FROM listening_history lh
    JOIN episodes e ON lh.episode_id = e.id
    WHERE lh.completed = false AND lh.progress_seconds > 0
    GROUP BY e.id, e.title
    ORDER BY avg_progress ASC
    LIMIT 10
  `);
  // genre distribution
  const genres = await query(`
    SELECT c.name, COUNT(*) as count
    FROM series s
    JOIN categories c ON s.category_id = c.id
    GROUP BY c.name
    ORDER BY count DESC
  `);
  // devices (mock, assuming you have a column)
  const devices = await query(`
    SELECT COALESCE(device_type, 'Unknown') as device, COUNT(*) as count
    FROM listening_history
    GROUP BY device_type
  `);
  res.json({ status: 'success', data: { plays: plays.rows, dropoff: dropoff.rows, genres: genres.rows, devices: devices.rows } });
};

// ======================= MODERATION =======================
exports.getFlaggedContent = async (req, res) => {
  const result = await query(`
    SELECT fc.*, u.username as reporter_name
    FROM flagged_content fc
    LEFT JOIN users u ON fc.reporter_id = u.id
    ORDER BY fc.created_at DESC
  `);
  res.json({ status: 'success', data: result.rows });
};

exports.resolveFlagged = async (req, res) => {
  const { id } = req.params;
  const { action, notes } = req.body; // remove, warn, escalate
  const adminId = req.user.id;
  await query(`
    UPDATE flagged_content
    SET status = 'resolved', resolved_at = NOW(), resolved_by = $1, admin_notes = $2
    WHERE id = $3
  `, [adminId, notes, id]);
  await logAdminAction(adminId, `flagged_${action}`, 'flagged_content', id, { action, notes }, req.ip);
  if (action === 'remove') {
    // Get content details and delete it
    const fc = await query('SELECT content_type, content_id FROM flagged_content WHERE id = $1', [id]);
    if (fc.rows.length > 0) {
      const { content_type, content_id } = fc.rows[0];
      if (content_type === 'episode') await query('DELETE FROM episodes WHERE id = $1', [content_id]);
      else if (content_type === 'series') await query('DELETE FROM series WHERE id = $1', [content_id]);
      else if (content_type === 'comment') await query('DELETE FROM comments WHERE id = $1', [content_id]);
    }
  }
  res.json({ status: 'success', message: 'Flagged content resolved' });
};

// ======================= MONETIZATION =======================
exports.getSubscriptions = async (req, res) => {
  const subs = await query(`
    SELECT us.*, u.username, u.email, p.name as plan_name
    FROM user_subscriptions us
    JOIN users u ON us.user_id = u.id
    LEFT JOIN subscription_plans p ON us.plan_id = p.id
    ORDER BY us.created_at DESC
  `);
  res.json({ status: 'success', data: subs.rows });
};

exports.createPromoCode = async (req, res) => {
  const { code, discount_type, discount_value, valid_until, usage_limit } = req.body;
  const adminId = req.user.id;
  await query(`
    INSERT INTO promo_codes (code, discount_type, discount_value, valid_until, usage_limit)
    VALUES ($1, $2, $3, $4, $5)
  `, [code, discount_type, discount_value, valid_until, usage_limit]);
  await logAdminAction(adminId, 'create_promo', 'promo_codes', null, { code }, req.ip);
  res.json({ status: 'success', message: 'Promo code created' });
};

exports.getPayouts = async (req, res) => {
  const payouts = await query(`
    SELECT p.*, u.username, u.full_name
    FROM payouts p
    JOIN users u ON p.creator_id = u.id
    ORDER BY p.created_at DESC
  `);
  res.json({ status: 'success', data: payouts.rows });
};

exports.processPayout = async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.id;
  await query('UPDATE payouts SET status = $1, processed_at = NOW() WHERE id = $2', ['completed', id]);
  await logAdminAction(adminId, 'process_payout', 'payouts', id, {}, req.ip);
  res.json({ status: 'success', message: 'Payout marked as completed' });
};

// ======================= NOTIFICATIONS =======================
exports.sendNotification = async (req, res) => {
  const { title, body, audience, data } = req.body;
  const adminId = req.user.id;
  await query(`
    INSERT INTO admin_notifications (title, body, audience, data, sent_by)
    VALUES ($1, $2, $3, $4, $5)
  `, [title, body, audience, data, adminId]);
  // TODO: integrate with Firebase Cloud Messaging or WebSocket
  await logAdminAction(adminId, 'send_notification', 'notification', null, { title, audience }, req.ip);
  res.json({ status: 'success', message: 'Notification queued' });
};

// ======================= SYSTEM SETTINGS =======================
exports.getSettings = async (req, res) => {
  const settings = await query('SELECT * FROM platform_settings');
  const obj = {};
  settings.rows.forEach(s => obj[s.key] = s.value);
  res.json({ status: 'success', data: obj });
};

exports.updateSetting = async (req, res) => {
  const { key, value } = req.body;
  const adminId = req.user.id;
  await query(`
    UPDATE platform_settings
    SET value = $1, updated_at = NOW(), updated_by = $2
    WHERE key = $3
  `, [JSON.stringify(value), adminId, key]);
  await logAdminAction(adminId, 'update_setting', 'platform_settings', null, { key, value }, req.ip);
  res.json({ status: 'success', message: 'Setting updated' });
};

exports.getAuditLogs = async (req, res) => {
  const { page = 1, limit = 50, action, admin } = req.query;
  const offset = (page - 1) * limit;
  let whereClause = '';
  const params = [];
  let paramCount = 1;
  if (action) {
    whereClause += ` AND action ILIKE $${paramCount}`;
    params.push(`%${action}%`);
    paramCount++;
  }
  if (admin) {
    whereClause += ` AND (u.username ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
    params.push(`%${admin}%`);
    paramCount++;
  }
  const countRes = await query(`SELECT COUNT(*) FROM admin_audit_logs al LEFT JOIN users u ON al.admin_id = u.id WHERE 1=1 ${whereClause}`, params);
  const dataRes = await query(`
    SELECT al.*, u.username as admin_name
    FROM admin_audit_logs al
    LEFT JOIN users u ON al.admin_id = u.id
    WHERE 1=1 ${whereClause}
    ORDER BY al.created_at DESC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `, [...params, limit, offset]);
  res.json({
    status: 'success',
    data: dataRes.rows,
    total: parseInt(countRes.rows[0].count),
    page: parseInt(page),
    limit: parseInt(limit)
  });
};
