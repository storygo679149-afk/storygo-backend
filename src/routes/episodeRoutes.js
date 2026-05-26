const express = require('express');
const router = express.Router();
const episodeController = require('../controllers/episodeController');
const commentController = require('../controllers/commentController');
const { authenticate, optionalAuth, authorizeCreator, authorizeOwner } = require('../middleware/authenticate');
const { checkPremiumAccess, adsMiddleware } = require('../middleware/premium.middleware');
const { validate } = require('../middleware/validate');
const { body, param } = require('express-validator');
const { uploadEpisode } = require('../middleware/upload');
const { query } = require('../config/database');

// ---------- PUBLIC ROUTES ----------

// Get episode details by ID (no auth required)
router.get('/:id', optionalAuth, episodeController.getEpisodeById);

// Play route with premium check
router.get('/play/:id', optionalAuth, async (req, res, next) => {
    try {
        const episode = await query('SELECT * FROM episodes WHERE id = $1', [req.params.id]);
        if (episode.rows.length === 0) return res.status(404).json({ error: 'Episode not found' });
        req.episode = episode.rows[0];
        next();
    } catch (err) { next(err); }
}, checkPremiumAccess, adsMiddleware, (req, res) => {
    // Return audio URL (or signed URL for security) and ad information
    const audioUrl = req.episode.audio_url;
    res.json({
        audioUrl,
        showAds: req.shouldShowAds,
        premiumOnly: req.episode.is_premium,
    });
});

// ---------- PROTECTED ROUTES (auth required) ----------

router.post('/:id/progress', authenticate,
    validate([
        param('id').isUUID(),
        body('progress_seconds').isInt({ min: 0 }),
        body('playback_speed').optional().isFloat({ min: 0.5, max: 3.0 })
    ]),
    episodeController.updateProgress
);

router.post('/:id/bookmark', authenticate,
    validate([param('id').isUUID(), body('timestamp_seconds').optional().isInt({ min: 0 }), body('note').optional().trim()]),
    episodeController.toggleBookmark
);

router.get('/:id/bookmark', authenticate,
    validate([param('id').isUUID()]),
    episodeController.checkBookmark
);

// ---------- COMMENTS ----------
router.get('/:id/comments', commentController.getComments);
router.post('/:id/comments', authenticate, commentController.createComment);
router.delete('/comments/:commentId', authenticate, commentController.deleteComment);

// ---------- CHAPTERS ----------
router.get('/:id/chapters', episodeController.getChapters);
router.post('/:id/chapters', authenticate, authorizeCreator, episodeController.saveChapters);

// ---------- CREATOR ROUTES ----------
router.post('/', authenticate, authorizeCreator, uploadEpisode,
    validate([
        body('series_id').isUUID(),
        body('title').trim().isLength({ min: 1, max: 255 }),
        body('episode_number').isInt({ min: 1 }),
        body('season_number').optional().isInt({ min: 1 }),
        body('description').optional().trim()
    ]),
    episodeController.createEpisode
);

router.put('/:id', authenticate, authorizeCreator, authorizeOwner('episode'), uploadEpisode,
    validate([
        param('id').isUUID(),
        body('title').optional().trim().isLength({ min: 1, max: 255 }),
        body('description').optional().trim()
    ]),
    episodeController.updateEpisode
);

router.delete('/:id', authenticate, authorizeCreator, authorizeOwner('episode'),
    validate([param('id').isUUID()]),
    episodeController.deleteEpisode
);

module.exports = router;