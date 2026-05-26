const express = require('express');
const router = express.Router();
const seriesController = require('../controllers/seriesController');
const { authenticate, optionalAuth, authorizeCreator, authorizeOwner } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { body, param } = require('express-validator');
const { uploadImage } = require('../middleware/upload');
const { query } = require('../config/database');

// ---------- Featured & Staff Picks (implemented) ----------
router.get('/featured', async (req, res) => {
    try {
        const result = await query(
            `SELECT s.*, u.username as creator_username, u.full_name as creator_name, c.name as category_name
             FROM series s
             JOIN users u ON s.creator_id = u.id
             LEFT JOIN categories c ON s.category_id = c.id
             WHERE s.is_active = true
             ORDER BY s.average_rating DESC, s.play_count DESC
             LIMIT 1`
        );
        return res.json({ status: 'success', data: { series: result.rows } });
    } catch (error) {
        console.error('Featured series error:', error);
        return res.status(500).json({ status: 'error', message: 'Error fetching featured series' });
    }
});


// Public routes
router.get('/', optionalAuth, seriesController.getAllSeries);
router.get('/:id', optionalAuth, seriesController.getSeriesById);
router.get('/:id/episodes', optionalAuth, seriesController.getSeriesEpisodes);

router.post('/:id/rate',
    authenticate,
    validate([
        param('id').isUUID(),
        body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1–5')
    ]),
    seriesController.rateSeries
);

// Creator routes
router.post('/',
    authenticate,
    authorizeCreator,
    uploadImage,
    validate([
        body('title').trim().isLength({ min: 1, max: 255 }),
        body('description').optional().trim().isLength({ max: 5000 }),
        body('category_id').isUUID(),
        body('author_name').optional().trim(),
        body('narrator_name').optional().trim(),
        body('language').optional().isLength({ min: 2, max: 10 })
    ]),
    seriesController.createSeries
);

router.put('/:id',
    authenticate,
    authorizeCreator,
    authorizeOwner('series'),
    uploadImage,
    validate([
        param('id').isUUID(),
        body('title').optional().trim().isLength({ min: 1, max: 255 }),
        body('description').optional().trim().isLength({ max: 5000 }),
        body('status').optional().isIn(['ongoing', 'completed', 'hiatus'])
    ]),
    seriesController.updateSeries
);

router.delete('/:id',
    authenticate,
    authorizeCreator,
    authorizeOwner('series'),
    validate([param('id').isUUID()]),
    seriesController.deleteSeries
);

module.exports = router;