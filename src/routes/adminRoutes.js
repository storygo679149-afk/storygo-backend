const express = require('express');
const router = express.Router();
const { authenticate, authorizeAdmin } = require('../middleware/authenticate');
const admin = require('../controllers/adminController');

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

module.exports = router;
