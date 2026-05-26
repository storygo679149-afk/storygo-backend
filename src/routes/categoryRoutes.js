const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { authenticate, authorizeCreator } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { body, param } = require('express-validator');

// Public routes
router.get('/', categoryController.getAllCategories);
router.get('/:slug', categoryController.getCategoryBySlug);
router.get('/:slug/series', categoryController.getCategorySeries);

// Admin routes (creator only for now)
router.post('/',
  authenticate,
  authorizeCreator,
  validate([
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required'),
    body('description').optional().trim(),
    body('slug').trim().isLength({ min: 1, max: 150 }).withMessage('Slug is required')
  ]),
  categoryController.createCategory
);

module.exports = router;