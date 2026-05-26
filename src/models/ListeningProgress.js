const { query } = require('../config/database');

class ListeningProgressModel {
  static async findByUserAndEpisode(userId, episodeId) {
    const result = await query(
      'SELECT * FROM listening_progress WHERE user_id = $1 AND episode_id = $2',
      [userId, episodeId]
    );
    return result.rows[0];
  }

  static async findByUser(userId, { page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    const result = await query(
      `SELECT lp.*, e.title as episode_title, e.episode_number, e.duration_seconds,
              s.title as series_title, s.thumbnail_url
       FROM listening_progress lp
       JOIN episodes e ON lp.episode_id = e.id
       JOIN series s ON e.series_id = s.id
       WHERE lp.user_id = $1
       ORDER BY lp.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  static async upsert(userId, episodeId, data) {
    const { progress_seconds, playback_speed, is_completed } = data;
    
    const result = await query(
      `INSERT INTO listening_progress 
       (user_id, episode_id, progress_seconds, playback_speed, is_completed, 
        last_position_seconds, listened_duration_seconds)
       VALUES ($1, $2, $3, $4, $5, $3, $3)
       ON CONFLICT (user_id, episode_id) 
       DO UPDATE SET 
         progress_seconds = $3,
         playback_speed = $4,
         is_completed = $5,
         last_position_seconds = $3,
         listened_duration_seconds = listening_progress.listened_duration_seconds + $3 - listening_progress.last_position_seconds,
         session_count = listening_progress.session_count + 1,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, episodeId, progress_seconds, playback_speed || 1.0, is_completed || false]
    );
    return result.rows[0];
  }
}

module.exports = ListeningProgressModel;