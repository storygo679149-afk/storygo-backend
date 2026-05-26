const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/adminAuth');
const adminController = require('../controllers/adminController');

// All routes require admin authentication
router.use(requireAdmin);

// Dashboard
router.get('/dashboard', adminController.getDashboardStats);
// Add this line inside the router (after authentication middleware)
router.get('/database/users', adminController.getAllUsersData);

// Users
router.get('/users', adminController.getAllUsers);
router.put('/users/:userId/status', adminController.toggleUserStatus);

// Series
router.get('/series', adminController.getAllSeries);
router.put('/series/:seriesId/status', adminController.updateSeriesStatus);

// Episodes
router.get('/episodes', adminController.getAllEpisodes);

// Payments
router.get('/payments', adminController.getPayments);

// Subscriptions
router.get('/subscriptions', adminController.getSubscriptions);

// Ratings
router.get('/ratings', adminController.getAllRatings);
router.delete('/ratings/:id', adminController.deleteRating);

// Plans
router.put('/plans/:id', adminController.updatePlan);
router.post('/plans', adminController.createPlan);

// Creator revenue share
router.put('/users/:id/revenue', adminController.updateCreatorRevenueShare);

// Storage stats
router.get('/storage', adminController.getStorageStats);

// Audit logs
router.get('/audit-logs', adminController.getAuditLogs);
// ... existing routes
router.get('/creators', adminController.getCreators);
router.get('/listeners/cities', adminController.getListenerCities);

module.exports = router;