const express = require('express');
const router = express.Router();
const { authenticate, authorizeAdmin } = require('../middleware/authenticate');
const admin = require('../controllers/adminController');
const { query } = require('../config/database');
const { lockdownAudioAsset } = require('../config/cloudinary');

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(authorizeAdmin);

// User Management
router.get('/users', admin.getUsers);
router.get('/users/:id', admin.getUserDetails);
router.put('/users/:id/status', admin.updateUserStatus);
router.get('/creator-onboarding', admin.getCreatorOnboarding);
router.post('/creator-onboarding/:id/approve', admin.approveCreator);

// Analytics
router.get('/analytics', admin.getAnalytics);

// Moderation
router.get('/flagged', admin.getFlaggedContent);
router.post('/flagged/:id/resolve', admin.resolveFlagged);

// Monetization
router.get('/subscriptions', admin.getSubscriptions);
router.post('/promo-codes', admin.createPromoCode);
router.get('/payouts', admin.getPayouts);
router.post('/payouts/:id/process', admin.processPayout);

// Notifications
router.post('/notifications/send', admin.sendNotification);

// System Settings
router.get('/settings', admin.getSettings);
router.put('/settings', admin.updateSetting);
router.get('/audit-logs', admin.getAuditLogs);

// ---------------------------------------------------------------
// ONE-TIME MIGRATION: lock down existing public audio files on
// Cloudinary so they require a signed URL. Admin-only, safe to
// re-run (already-locked files are just updated again harmlessly).
// Remove this route once you've run it successfully.
// ---------------------------------------------------------------
router.post('/lockdown-audio', async (req, res) => {
  try {
    const result = await query(
      'SELECT id, audio_public_id FROM episodes WHERE audio_public_id IS NOT NULL'
    );

    const results = [];
    for (const row of result.rows) {
      try {
        await lockdownAudioAsset(row.audio_public_id);
        results.push({ episodeId: row.id, publicId: row.audio_public_id, status: 'locked' });
      } catch (err) {
        results.push({ episodeId: row.id, publicId: row.audio_public_id, status: 'failed', error: err.message });
      }
    }

    const locked = results.filter(r => r.status === 'locked').length;
    const failed = results.filter(r => r.status === 'failed').length;

    return res.json({ status: 'success', summary: { total: result.rows.length, locked, failed }, results });
  } catch (error) {
    console.error('Lockdown migration error:', error);
    return res.status(500).json({ status: 'error', message: 'Migration failed', error: error.message });
  }
});

module.exports = router;
