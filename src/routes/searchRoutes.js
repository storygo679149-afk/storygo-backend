const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const { optionalAuth } = require('../middleware/authenticate');

// GET /api/search?q=...
router.get('/', optionalAuth, searchController.search);

// GET /api/search/suggestions?q=...
router.get('/suggestions', searchController.getSuggestions);

// GET /api/search/popular
router.get('/popular', searchController.getPopularSearches);

module.exports = router;
