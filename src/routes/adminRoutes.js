const express = require('express');
const router = express.Router();
const { authenticate, authorizeAdmin } = require('../middleware/authenticate');
const adminController = require('../controllers/adminController');

// All admin routes require authentication AND admin role
router.use(authenticate);
router.use(authorizeAdmin);

// Dashboard
router.get('/dashboard', adminController.getDashboardStats);
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

// Subscription Plans
router.put('/plans/:id', adminController.updatePlan);
router.post('/plans', adminController.createPlan);

// Creator revenue share
router.put('/users/:id/revenue', adminController.updateCreatorRevenueShare);

// Storage stats
router.get('/storage', adminController.getStorageStats);

// Audit logs
router.get('/audit-logs', adminController.getAuditLogs);

// Creators & listeners
router.get('/creators', adminController.getCreators);
router.get('/listeners/cities', adminController.getListenerCities);

module.exports = router;
