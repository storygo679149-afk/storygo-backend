const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { body, param } = require('express-validator');

// All routes require authentication
router.use(authenticate);

// GET /api/activity/recent
router.get('/recent', activityController.getRecentActivity);

// POST /api/activity/log
router.post('/log',
  validate([
    body('activity_type')
      .isIn(['listen', 'like', 'share', 'rate', 'bookmark'])    // ← 'bookmark' added
      .withMessage('Invalid activity type'),
    body('series_id').isUUID().withMessage('Series ID is required'),
    body('episode_id').optional().isUUID()
  ]),
  activityController.logActivity
);

// GET /api/activity/stats
router.get('/stats', activityController.getActivityStats);

module.exports = router;