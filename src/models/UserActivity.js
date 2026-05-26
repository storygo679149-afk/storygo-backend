const { query } = require('../config/database');

class UserActivityModel {
  static async findByUser(userId, { page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    const result = await query(
      `SELECT ua.*, s.title as series_title, e.title as episode_title
       FROM user_activity ua
       LEFT JOIN series s ON ua.series_id = s.id
       LEFT JOIN episodes e ON ua.episode_id = e.id
       WHERE ua.user_id = $1
       ORDER BY ua.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  static async create(activityData) {
    const { user_id, activity_type, series_id, episode_id, metadata } = activityData;
    const result = await query(
      `INSERT INTO user_activity (user_id, activity_type, series_id, episode_id, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, activity_type, series_id, episode_id, metadata || '{}']
    );
    return result.rows[0];
  }

  static async getStats(userId) {
    const result = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE activity_type = 'listen') as total_listens,
        COUNT(*) FILTER (WHERE activity_type = 'like') as total_likes,
        COUNT(*) FILTER (WHERE activity_type = 'bookmark') as total_bookmarks,
        COUNT(DISTINCT series_id) as unique_series
       FROM user_activity
       WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0];
  }
}

module.exports = UserActivityModel;