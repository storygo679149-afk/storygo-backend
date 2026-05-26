const { query } = require('../config/database');

class TrendingService {
  // Calculate trending score for series
  static async calculateTrendingScore(seriesId) {
    const result = await query(
      `SELECT 
        SUM(
          weight * (1.0 / (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - time_window)) / 3600 + 1))
        ) as trending_score,
        COUNT(*) as activity_count
       FROM trending_log
       WHERE series_id = $1 
         AND time_window > CURRENT_TIMESTAMP - INTERVAL '7 days'`,
      [seriesId]
    );
    return result.rows[0];
  }

  // Log activity for trending calculation
  static async logActivity(seriesId, episodeId, activityType) {
    const weights = {
      'listen': 1,
      'like': 3,
      'bookmark': 2,
      'share': 5,
      'rate': 2,
      'comment': 2,
      'follow': 4
    };

    const weight = weights[activityType] || 1;

    await query(
      `INSERT INTO trending_log (series_id, episode_id, activity_type, weight)
       VALUES ($1, $2, $3, $4)`,
      [seriesId, episodeId, activityType, weight]
    );
  }

  // Get trending series
  static async getTrending({ page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT s.*, 
              u.username as creator_username,
              u.full_name as creator_name,
              COALESCE(t.trending_score, 0) as trending_score,
              COALESCE(t.activity_count, 0) as recent_activity
       FROM series s
       JOIN users u ON s.creator_id = u.id
       LEFT JOIN (
         SELECT series_id,
                SUM(weight * (1.0 / (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - time_window)) / 3600 + 1))) as trending_score,
                COUNT(*) as activity_count
         FROM trending_log
         WHERE time_window > CURRENT_TIMESTAMP - INTERVAL '7 days'
         GROUP BY series_id
       ) t ON s.id = t.series_id
       WHERE s.is_active = true
       ORDER BY trending_score DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows;
  }

  // Clean up old trending data
  static async cleanupOldData() {
    await query(
      'DELETE FROM trending_log WHERE time_window < CURRENT_TIMESTAMP - INTERVAL \'30 days\''
    );
  }
}

module.exports = TrendingService;