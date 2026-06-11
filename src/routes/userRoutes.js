const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { body, param } = require('express-validator');
const { avatarUpload } = require('../middleware/upload');

// Public routes (no auth)
router.get('/stats/global', userController.getGlobalStats);
router.get('/top-creators', userController.getTopCreators);
router.get('/creator/:username', optionalAuth, userController.getCreatorProfile); 

// All routes below require authentication
router.use(authenticate);

router.get('/profile', userController.getProfile);
router.put('/profile', validate([
  body('full_name').optional().trim().isLength({ min: 2, max: 100 }),
  body('preferred_language').optional().isLength({ min: 2, max: 10 }),
  body('creator_bio').optional().trim().isLength({ max: 1000 })
]), userController.updateProfile);

router.put('/become-creator', userController.becomeCreator);   // ✅ Only once, after authenticate

router.get('/listening-history', userController.getListeningHistory);
router.get('/bookmarks', userController.getBookmarks);
router.get('/bookmarked-series', userController.getBookmarkedSeries);
router.get('/following', userController.getFollowing);
router.post('/follow/:id', validate([param('id').isUUID()]), userController.followCreator);
router.delete('/unfollow/:id', validate([param('id').isUUID()]), userController.unfollowCreator);
router.get('/stats', userController.getUserStats);
router.get('/followers', userController.getFollowers);
router.get('/creator-analytics', userController.getCreatorAnalytics);
router.get('/creator-stats', userController.getCreatorStats);

// Avatar & password routes
router.post('/avatar', avatarUpload, userController.uploadAvatar);
router.delete('/avatar', userController.removeAvatar);
router.post('/change-password', userController.changePassword);

module.exports = router;
