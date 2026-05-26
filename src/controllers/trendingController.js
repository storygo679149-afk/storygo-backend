const { query } = require('../config/database');

const trendingController = {

  // ---------- ALL TIME (30 days) ----------
  getTrending: async (req, res, next) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;
      const userId = req.user?.id || null;

      // Main query with activity + new episodes
      let result = await query(
        `SELECT s.*, 
                u.username as creator_username,
                u.full_name as creator_name,
                c.name as category_name,
                COALESCE(t.trending_score, 0) +
                  COALESCE(e.new_episodes_count, 0) * 10 AS trending_score,
                COALESCE(t.activity_count, 0) as recent_activity_count,
                COALESCE(e.new_episodes_count, 0) as new_episodes_count,
                lp.progress_seconds as user_progress
         FROM series s
         JOIN users u ON s.creator_id = u.id
         LEFT JOIN categories c ON s.category_id = c.id
         LEFT JOIN (
           SELECT series_id,
                  SUM(weight * (1.0 / (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - time_window)) / 3600 + 1))) AS trending_score,
                  COUNT(*) AS activity_count
           FROM trending_log
           WHERE time_window > CURRENT_TIMESTAMP - INTERVAL '30 days'
           GROUP BY series_id
         ) t ON s.id = t.series_id
         LEFT JOIN (
           SELECT series_id, COUNT(*) AS new_episodes_count
           FROM episodes
           WHERE is_active = true AND publish_date > CURRENT_TIMESTAMP - INTERVAL '30 days'
           GROUP BY series_id
         ) e ON s.id = e.series_id
         LEFT JOIN listening_progress lp ON s.id = (
           SELECT s2.id FROM series s2 
           JOIN episodes e2 ON s2.id = e2.series_id 
           WHERE e2.id = lp.episode_id
         ) AND lp.user_id = $3
         WHERE s.is_active = true
         ORDER BY trending_score DESC, s.play_count DESC, s.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset, userId]
      );

      // Fallback: if no trending rows, return all active series sorted by newest
      if (result.rows.length === 0) {
        result = await query(
          `SELECT s.*, 
                  u.username as creator_username,
                  u.full_name as creator_name,
                  c.name as category_name,
                  0 as trending_score,
                  0 as recent_activity_count,
                  0 as new_episodes_count,
                  NULL as user_progress
           FROM series s
           JOIN users u ON s.creator_id = u.id
           LEFT JOIN categories c ON s.category_id = c.id
           WHERE s.is_active = true
           ORDER BY s.created_at DESC
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );
      }

      const countResult = await query(`SELECT COUNT(*) FROM series s WHERE s.is_active = true`);

      return res.json({
        status: 'success',
        data: {
          trending: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(countResult.rows[0].count),
            pages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
          }
        }
      });
    } catch (error) {
      console.error('Get trending (all time) error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching trending series' });
    }
  },

  // ---------- TODAY (24 hours) ----------
  getDailyTrending: async (req, res, next) => {
    try {
      let result = await query(
        `SELECT s.*, 
                u.username as creator_username,
                u.full_name as creator_name,
                COUNT(DISTINCT t.id) AS today_activity,
                COALESCE(e.new_episodes_count, 0) AS new_episodes_today,
                COUNT(DISTINCT t.id) * 1 + COALESCE(e.new_episodes_count, 0) * 10 AS daily_score
         FROM series s
         JOIN users u ON s.creator_id = u.id
         LEFT JOIN trending_log t ON s.id = t.series_id 
              AND t.time_window > CURRENT_TIMESTAMP - INTERVAL '24 hours'
         LEFT JOIN (
           SELECT series_id, COUNT(*) AS new_episodes_count
           FROM episodes
           WHERE is_active = true AND publish_date > CURRENT_TIMESTAMP - INTERVAL '24 hours'
           GROUP BY series_id
         ) e ON s.id = e.series_id
         WHERE s.is_active = true
         GROUP BY s.id, u.username, u.full_name, e.new_episodes_count
         ORDER BY daily_score DESC, s.play_count DESC, s.created_at DESC
         LIMIT 10`
      );

      if (result.rows.length === 0) {
        result = await query(
          `SELECT s.*, u.username as creator_username, u.full_name as creator_name,
                  0 as today_activity, 0 as new_episodes_today, 0 as daily_score
           FROM series s
           JOIN users u ON s.creator_id = u.id
           WHERE s.is_active = true
           ORDER BY s.created_at DESC
           LIMIT 10`
        );
      }

      return res.json({ status: 'success', data: { daily_trending: result.rows } });
    } catch (error) {
      console.error('Get daily trending error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching daily trending' });
    }
  },

  // ---------- THIS WEEK (7 days) ----------
  getWeeklyTrending: async (req, res, next) => {
    try {
      let result = await query(
        `SELECT s.*, 
                u.username as creator_username,
                u.full_name as creator_name,
                COUNT(DISTINCT t.id) AS weekly_activity,
                COALESCE(SUM(t.weight), 0) AS weekly_activity_score,
                COALESCE(e.new_episodes_count, 0) AS new_episodes_this_week,
                COALESCE(SUM(t.weight), 0) + COALESCE(e.new_episodes_count, 0) * 10 AS weekly_score
         FROM series s
         JOIN users u ON s.creator_id = u.id
         LEFT JOIN trending_log t ON s.id = t.series_id 
              AND t.time_window > CURRENT_TIMESTAMP - INTERVAL '7 days'
         LEFT JOIN (
           SELECT series_id, COUNT(*) AS new_episodes_count
           FROM episodes
           WHERE is_active = true AND publish_date > CURRENT_TIMESTAMP - INTERVAL '7 days'
           GROUP BY series_id
         ) e ON s.id = e.series_id
         WHERE s.is_active = true
         GROUP BY s.id, u.username, u.full_name, e.new_episodes_count
         ORDER BY weekly_score DESC, s.play_count DESC, s.created_at DESC
         LIMIT 20`
      );

      if (result.rows.length === 0) {
        result = await query(
          `SELECT s.*, u.username as creator_username, u.full_name as creator_name,
                  0 as weekly_activity, 0 as weekly_activity_score, 0 as new_episodes_this_week, 0 as weekly_score
           FROM series s
           JOIN users u ON s.creator_id = u.id
           WHERE s.is_active = true
           ORDER BY s.created_at DESC
           LIMIT 20`
        );
      }

      return res.json({ status: 'success', data: { weekly_trending: result.rows } });
    } catch (error) {
      console.error('Get weekly trending error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching weekly trending' });
    }
  }
};

module.exports = trendingController;