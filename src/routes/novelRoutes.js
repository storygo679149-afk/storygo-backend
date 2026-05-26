const express = require('express');
const router = express.Router();
const novelController = require('../controllers/novelController');
const { authenticate, optionalAuth, authorizeCreator } = require('../middleware/authenticate');
const { coverUpload } = require('../middleware/upload');   // ← import coverUpload

// Public routes
router.get('/', optionalAuth, novelController.getAllNovels);
router.get('/:id', optionalAuth, novelController.getNovelById);
router.get('/:novelId/chapters/:chapterId', optionalAuth, novelController.getChapter);

// Authenticated routes
router.post('/:id/like', authenticate, novelController.toggleLike);
router.post('/reading-progress', authenticate, novelController.saveReadingProgress);

// Creator routes
router.post('/', authenticate, authorizeCreator, coverUpload, novelController.createNovel);
router.put('/:id', authenticate, authorizeCreator, coverUpload, novelController.updateNovel);
router.delete('/:id', authenticate, authorizeCreator, novelController.deleteNovel);
router.post('/:novelId/chapters', authenticate, authorizeCreator, novelController.addChapter);

module.exports = router;