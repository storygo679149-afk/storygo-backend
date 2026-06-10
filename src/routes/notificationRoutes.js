// src/routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { query } = require('../config/database');

// GET /api/notifications – fetch user's notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    // Determine audience based on user role
    let audience = 'listeners';
    if (req.user.is_creator) audience = 'creators';
    if (req.user.is_admin) audience = 'admin'; // admins see admin notifications too

    const result = await query(`
      SELECT n.id, n.title, n.body, n.audience, n.sent_at,
             COALESCE(un.is_read, false) as is_read
      FROM admin_notifications n
      LEFT JOIN user_notifications un ON un.notification_id = n.id AND un.user_id = $1
      WHERE n.audience IN ('all', $2)
      ORDER BY n.sent_at DESC
      LIMIT 50
    `, [userId, audience]);

    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('Fetch notifications error:', err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

// POST /api/notifications/:id/read – mark a notification as read
router.post('/:id/read', authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    await query(`
      INSERT INTO user_notifications (user_id, notification_id, is_read)
      VALUES ($1, $2, true)
      ON CONFLICT (user_id, notification_id) DO UPDATE SET is_read = true
    `, [userId, id]);
    res.json({ status: 'success', message: 'Marked as read' });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

// GET /api/notifications/unread-count – get unread count
router.get('/unread-count', authenticate, async (req, res) => {
  const userId = req.user.id;
  let audience = 'listeners';
  if (req.user.is_creator) audience = 'creators';
  if (req.user.is_admin) audience = 'admin';
  try {
    const result = await query(`
      SELECT COUNT(*) FROM admin_notifications n
      LEFT JOIN user_notifications un ON un.notification_id = n.id AND un.user_id = $1
      WHERE n.audience IN ('all', $2) AND (un.is_read IS NULL OR un.is_read = false)
    `, [userId, audience]);
    res.json({ status: 'success', count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

module.exports = router;
