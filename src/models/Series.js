const { query } = require('../config/database');

class SeriesModel {
  static async findAll({ page = 1, limit = 20, filters = {} }) {
    const offset = (page - 1) * limit;
    const conditions = ['s.is_active = true'];
    const params = [];
    let paramCount = 1;

    if (filters.category) {
      conditions.push(`s.category_id = $${paramCount}`);
      params.push(filters.category);
      paramCount++;
    }

    if (filters.language) {
      conditions.push(`s.language = $${paramCount}`);
      params.push(filters.language);
      paramCount++;
    }

    if (filters.status) {
      conditions.push(`s.status = $${paramCount}`);
      params.push(filters.status);
      paramCount++;
    }

    if (filters.creator_id) {
      conditions.push(`s.creator_id = $${paramCount}`);
      params.push(filters.creator_id);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    params.push(limit, offset);

    const result = await query(
      `SELECT s.*, u.username as creator_username, u.full_name as creator_name
       FROM series s
       JOIN users u ON s.creator_id = u.id
       ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      params
    );

    return result.rows;
  }

  static async findById(id) {
    const result = await query(
      `SELECT s.*, u.username as creator_username, u.full_name as creator_name
       FROM series s
       JOIN users u ON s.creator_id = u.id
       WHERE s.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async create(seriesData) {
    const { title, description, category_id, creator_id, author_name, narrator_name, language, thumbnail_url } = seriesData;
    const result = await query(
      `INSERT INTO series (title, description, category_id, creator_id, author_name, narrator_name, language, thumbnail_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [title, description, category_id, creator_id, author_name, narrator_name, language, thumbnail_url]
    );
    return result.rows[0];
  }

  static async update(id, updateData) {
    const fields = Object.keys(updateData);
    const values = Object.values(updateData);
    
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    values.push(id);

    const result = await query(
      `UPDATE series SET ${setClause} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async delete(id) {
    await query('DELETE FROM series WHERE id = $1', [id]);
    return true;
  }

  static async incrementPlayCount(id) {
    await query(
      'UPDATE series SET play_count = play_count + 1 WHERE id = $1',
      [id]
    );
  }
}

module.exports = SeriesModel;