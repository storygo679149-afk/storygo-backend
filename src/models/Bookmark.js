const { query } = require('../config/database');

class BookmarkModel {
  static async findByUser(userId, { page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    const result = await query(
      `SELECT b.*, e.title as episode_title, e.episode_number,
              s.title as series_title, s.thumbnail_url
       FROM bookmarks b
       JOIN episodes e ON b.episode_id = e.id
       JOIN series s ON b.series_id = s.id
       WHERE b.user_id = $1 AND b.is_active = true
       ORDER BY b.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  static async findByUserAndEpisode(userId, episodeId) {
    const result = await query(
      'SELECT * FROM bookmarks WHERE user_id = $1 AND episode_id = $2',
      [userId, episodeId]
    );
    return result.rows[0];
  }

  static async create(bookmarkData) {
    const { user_id, episode_id, series_id, timestamp_seconds, note } = bookmarkData;
    const result = await query(
      `INSERT INTO bookmarks (user_id, episode_id, series_id, timestamp_seconds, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, episode_id, series_id, timestamp_seconds, note]
    );
    return result.rows[0];
  }

  static async toggleActive(id, isActive) {
    const result = await query(
      'UPDATE bookmarks SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [isActive, id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    await query('DELETE FROM bookmarks WHERE id = $1', [id]);
    return true;
  }
}

module.exports = BookmarkModel;