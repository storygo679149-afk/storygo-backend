const express = require('express');
const router = express.Router();
const trendingController = require('../controllers/trendingController');
const { optionalAuth } = require('../middleware/authenticate');

// GET /api/trending
router.get('/', optionalAuth, trendingController.getTrending);

// GET /api/trending/daily
router.get('/daily', optionalAuth, trendingController.getDailyTrending);

// GET /api/trending/weekly
router.get('/weekly', optionalAuth, trendingController.getWeeklyTrending);

module.exports = router;