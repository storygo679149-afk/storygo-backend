const { query } = require('../config/database');

class CategoryModel {
  static async findAll() {
    const result = await query(
      `SELECT c.*, COUNT(s.id) as series_count
       FROM categories c
       LEFT JOIN series s ON c.id = s.category_id AND s.is_active = true
       WHERE c.is_active = true
       GROUP BY c.id
       ORDER BY c.display_order ASC`
    );
    return result.rows;
  }

  static async findBySlug(slug) {
    const result = await query(
      `SELECT * FROM categories WHERE slug = $1`,
      [slug]
    );
    return result.rows[0];
  }

  static async create(categoryData) {
    const { name, description, slug } = categoryData;
    const result = await query(
      `INSERT INTO categories (name, description, slug)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, description, slug]
    );
    return result.rows[0];
  }
}

module.exports = CategoryModel;