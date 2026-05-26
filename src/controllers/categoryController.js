const { query } = require('../config/database');

const categoryController = {
  // Get all categories
  getAllCategories: async (req, res, next) => {
    try {
      const result = await query(
        `SELECT c.*, COUNT(s.id) as series_count
         FROM categories c
         LEFT JOIN series s ON c.id = s.category_id AND s.is_active = true
         WHERE c.is_active = true
         GROUP BY c.id
         ORDER BY c.display_order ASC`
      );

      return res.json({
        status: 'success',
        data: {
          categories: result.rows
        }
      });
    } catch (error) {
      console.error('Get categories error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error fetching categories'
      });
    }
  },

  // Get category by slug
  getCategoryBySlug: async (req, res, next) => {
    try {
      const { slug } = req.params;

      const result = await query(
        `SELECT c.*, COUNT(s.id) as series_count
         FROM categories c
         LEFT JOIN series s ON c.id = s.category_id AND s.is_active = true
         WHERE c.slug = $1 AND c.is_active = true
         GROUP BY c.id`,
        [slug]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Category not found'
        });
      }

      return res.json({
        status: 'success',
        data: {
          category: result.rows[0]
        }
      });
    } catch (error) {
      console.error('Get category error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error fetching category'
      });
    }
  },

  // Get series in category
  getCategorySeries: async (req, res, next) => {
    try {
      const { slug } = req.params;
      const { page = 1, limit = 20, sort = 'latest' } = req.query;
      const offset = (page - 1) * limit;
      let orderClause = 'ORDER BY s.created_at DESC';

      switch (sort) {
        case 'popular':
          orderClause = 'ORDER BY s.play_count DESC';
          break;
        case 'rating':
          orderClause = 'ORDER BY s.average_rating DESC';
          break;
        case 'title':
          orderClause = 'ORDER BY s.title ASC';
          break;
      }

      const countResult = await query(
        `SELECT COUNT(*) 
         FROM series s
         JOIN categories c ON s.category_id = c.id
         WHERE c.slug = $1 AND s.is_active = true`,
        [slug]
      );

      const result = await query(
        `SELECT s.*, u.username as creator_username, u.full_name as creator_name
         FROM series s
         JOIN categories c ON s.category_id = c.id
         JOIN users u ON s.creator_id = u.id
         WHERE c.slug = $1 AND s.is_active = true
         ${orderClause}
         LIMIT $2 OFFSET $3`,
        [slug, limit, offset]
      );

      return res.json({
        status: 'success',
        data: {
          series: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(countResult.rows[0].count),
            pages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
          }
        }
      });
    } catch (error) {
      console.error('Get category series error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error fetching category series'
      });
    }
  },

  // Create new category
  createCategory: async (req, res, next) => {
    try {
      const { name, description, slug } = req.body;

      // Check if category exists
      const existingResult = await query(
        'SELECT id FROM categories WHERE slug = $1 OR name = $2',
        [slug, name]
      );

      if (existingResult.rows.length > 0) {
        return res.status(409).json({
          status: 'error',
          message: 'Category with this name or slug already exists'
        });
      }

      const result = await query(
        `INSERT INTO categories (name, description, slug)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [name, description, slug]
      );

      return res.status(201).json({
        status: 'success',
        message: 'Category created successfully',
        data: {
          category: result.rows[0]
        }
      });
    } catch (error) {
      console.error('Create category error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error creating category'
      });
    }
  }
};

module.exports = categoryController;