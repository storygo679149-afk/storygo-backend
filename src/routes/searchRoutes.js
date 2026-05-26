const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const { optionalAuth } = require('../middleware/authenticate');

// GET /api/search
router.get('/', optionalAuth, searchController.search);

// GET /api/search/suggestions
router.get('/suggestions', optionalAuth, searchController.getSuggestions);

// GET /api/search/popular
router.get('/popular', searchController.getPopularSearches);

module.exports = router;