const { query } = require('../config/database');

const activityController = {
  // Get recent user activity – exclude activities performed by admin users
  getRecentActivity: async (req, res, next) => {
    try {
      const { page = 1, limit = 20, activity_type } = req.query;
      const offset = (page - 1) * limit;
      const userId = req.user.id;

      // Only fetch activities from non-admin users
      let whereClause = 'WHERE ua.user_id = $1 AND u.is_admin = false';
      const params = [userId];
      let paramCount = 2;

      if (activity_type) {
        whereClause += ` AND ua.activity_type = $${paramCount}`;
        params.push(activity_type);
        paramCount++;
      }

      const countResult = await query(
        `SELECT COUNT(*) FROM user_activity ua JOIN users u ON ua.user_id = u.id ${whereClause}`,
        params
      );

      params.push(limit, offset);
      const result = await query(
        `SELECT ua.*, 
                s.title as series_title,
                e.title as episode_title
         FROM user_activity ua
         JOIN users u ON ua.user_id = u.id
         LEFT JOIN series s ON ua.series_id = s.id
         LEFT JOIN episodes e ON ua.episode_id = e.id
         ${whereClause}
         ORDER BY ua.created_at DESC
         LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
        params
      );

      return res.json({
        status: 'success',
        data: {
          activities: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(countResult.rows[0].count),
            pages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
          }
        }
      });
    } catch (error) {
      console.error('Get recent activity error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error fetching activity'
      });
    }
  },

  // Log user activity (with toggle for bookmark/like)
  logActivity: async (req, res, next) => {
    try {
      const { activity_type, series_id, episode_id = null, metadata = {} } = req.body;
      const userId = req.user.id;

      // Toggle logic for bookmark and like
      if (activity_type === 'bookmark' || activity_type === 'like') {
        const existing = await query(
          `SELECT id FROM user_activity 
           WHERE user_id = $1 AND activity_type = $2 AND series_id = $3
           LIMIT 1`,
          [userId, activity_type, series_id]
        );

        if (existing.rows.length > 0) {
          // Remove it (toggle off)
          await query('DELETE FROM user_activity WHERE id = $1', [existing.rows[0].id]);
          return res.json({
            status: 'success',
            message: `${activity_type === 'bookmark' ? 'Bookmark' : 'Like'} removed`
          });
        }
      }

      // Insert new activity
      const result = await query(
        `INSERT INTO user_activity (user_id, activity_type, series_id, episode_id, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, activity_type, series_id, episode_id, JSON.stringify(metadata)]
      );

      // Log to trending
      if (series_id) {
        await query(
          `INSERT INTO trending_log (series_id, episode_id, activity_type, weight)
           VALUES ($1, $2, $3, 
             CASE $4
               WHEN 'like' THEN 3
               WHEN 'share' THEN 5
               WHEN 'listen' THEN 1
               WHEN 'bookmark' THEN 2
               ELSE 1
             END
           )`,
          [series_id, episode_id, activity_type, activity_type]
        );
      }

      return res.status(201).json({
        status: 'success',
        message: 'Activity logged',
        data: { activity: result.rows[0] }
      });
    } catch (error) {
      console.error('Log activity error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error logging activity',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Get activity stats (user-specific – no change needed)
  getActivityStats: async (req, res, next) => {
    try {
      const userId = req.user.id;

      const result = await query(
        `SELECT 
          COUNT(*) FILTER (WHERE activity_type = 'listen') as total_listens,
          COUNT(*) FILTER (WHERE activity_type = 'like') as total_likes,
          COUNT(*) FILTER (WHERE activity_type = 'bookmark') as total_bookmarks,
          COUNT(*) FILTER (WHERE activity_type = 'share') as total_shares,
          COUNT(DISTINCT series_id) as unique_series,
          COUNT(DISTINCT episode_id) as unique_episodes
         FROM user_activity
         WHERE user_id = $1`,
        [userId]
      );

      return res.json({
        status: 'success',
        data: { stats: result.rows[0] }
      });
    } catch (error) {
      console.error('Get activity stats error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error fetching activity stats'
      });
    }
  }
};

module.exports = activityController;