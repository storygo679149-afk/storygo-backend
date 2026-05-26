const { query } = require('../config/database');

const userController = {
  // Get user profile
  getProfile: async (req, res, next) => {
    try {
      const result = await query(
        `SELECT u.id, u.username, u.email, u.full_name, u.profile_picture,
                u.is_creator, u.creator_bio, u.creator_social_links,
                u.preferred_language, u.created_at, u.last_login_at,
                COUNT(DISTINCT uf1.follower_id) as followers_count,
                COUNT(DISTINCT uf2.following_id) as following_count,
                COUNT(DISTINCT s.id) as series_count
         FROM users u
         LEFT JOIN user_following uf1 ON u.id = uf1.following_id
         LEFT JOIN user_following uf2 ON u.id = uf2.follower_id
         LEFT JOIN series s ON u.id = s.creator_id AND s.is_active = true
         WHERE u.id = $1
         GROUP BY u.id`,
        [req.user.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }
      return res.json({ status: 'success', data: { user: result.rows[0] } });
    } catch (error) {
      console.error('Get profile error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching profile' });
    }
  },

  // Upload avatar
  uploadAvatar: async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ status: 'error', message: 'No file uploaded' });
      }
      const avatarUrl = req.file.path;
      await query('UPDATE users SET profile_picture = $1 WHERE id = $2', [avatarUrl, req.user.id]);
      res.json({ status: 'success', avatarUrl });
    } catch (error) {
      console.error('Upload avatar error:', error);
      res.status(500).json({ status: 'error', message: 'Upload failed' });
    }
  },

  // Remove avatar
  removeAvatar: async (req, res) => {
    try {
      const result = await query('SELECT profile_picture FROM users WHERE id = $1', [req.user.id]);
      const oldAvatar = result.rows[0]?.profile_picture;
      if (oldAvatar) {
        const publicId = oldAvatar.split('/').slice(-2).join('/').split('.')[0];
        if (publicId) {
          const cloudinary = require('cloudinary').v2;
          await cloudinary.uploader.destroy(publicId);
        }
      }
      await query('UPDATE users SET profile_picture = NULL WHERE id = $1', [req.user.id]);
      res.json({ status: 'success', message: 'Avatar removed' });
    } catch (error) {
      console.error('Remove avatar error:', error);
      res.status(500).json({ status: 'error', message: 'Removal failed' });
    }
  },

  // Change password
  changePassword: async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ status: 'error', message: 'Current and new password required' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ status: 'error', message: 'Password must be at least 6 characters' });
      }
      const userRes = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      if (userRes.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }
      const bcrypt = require('bcrypt');
      const isValid = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);
      if (!isValid) {
        return res.status(401).json({ status: 'error', message: 'Current password is incorrect' });
      }
      const newHash = await bcrypt.hash(newPassword, 10);
      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);
      res.json({ status: 'success', message: 'Password changed successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ status: 'error', message: 'Password change failed' });
    }
  },

  // Update user profile
  updateProfile: async (req, res, next) => {
    try {
      const { full_name, preferred_language, creator_bio } = req.body;
      const userId = req.user.id;
      const updateFields = [];
      const values = [];
      let paramCount = 1;
      if (full_name !== undefined) {
        updateFields.push(`full_name = $${paramCount}`);
        values.push(full_name);
        paramCount++;
      }
      if (preferred_language !== undefined) {
        updateFields.push(`preferred_language = $${paramCount}`);
        values.push(preferred_language);
        paramCount++;
      }
      if (creator_bio !== undefined && req.user.is_creator) {
        updateFields.push(`creator_bio = $${paramCount}`);
        values.push(creator_bio);
        paramCount++;
      }
      if (updateFields.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No fields to update' });
      }
      values.push(userId);
      const result = await query(
        `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramCount}
         RETURNING id, username, email, full_name, profile_picture, is_creator, preferred_language`,
        values
      );
      return res.json({ status: 'success', message: 'Profile updated successfully', data: { user: result.rows[0] } });
    } catch (error) {
      console.error('Update profile error:', error);
      return res.status(500).json({ status: 'error', message: 'Error updating profile' });
    }
  },

becomeCreator: async (req, res, next) => {
  try {
    const userId = req.user.id;
    console.log('Become creator attempt for user:', userId);

    // Check if already a creator
    if (req.user.is_creator) {
      console.log('User is already a creator');
      return res.status(400).json({ status: 'error', message: 'You are already a creator' });
    }

    const result = await query(
      `UPDATE users SET is_creator = true WHERE id = $1 RETURNING id, username, email, is_creator`,
      [userId]
    );

    if (result.rows.length === 0) {
      console.log('User not found');
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    console.log('User updated successfully:', result.rows[0]);
    return res.json({ status: 'success', message: 'You are now a creator!', data: { user: result.rows[0] } });
  } catch (error) {
    console.error('Become creator error:', error);
    return res.status(500).json({ status: 'error', message: 'Error updating creator status: ' + error.message });
  }
},

  // Get listening history
  getListeningHistory: async (req, res, next) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;
      const userId = req.user.id;
      const result = await query(
        `SELECT lp.*, e.title as episode_title, e.episode_number, e.season_number,
                e.duration_seconds, e.audio_url, s.title as series_title, s.thumbnail_url
         FROM listening_progress lp
         JOIN episodes e ON lp.episode_id = e.id
         JOIN series s ON e.series_id = s.id
         WHERE lp.user_id = $1 ORDER BY lp.updated_at DESC LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
      const countResult = await query(`SELECT COUNT(*) FROM listening_progress WHERE user_id = $1`, [userId]);
      return res.json({
        status: 'success',
        data: {
          history: result.rows,
          pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(countResult.rows[0].count), pages: Math.ceil(parseInt(countResult.rows[0].count) / limit) }
        }
      });
    } catch (error) {
      console.error('Get listening history error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching listening history' });
    }
  },

  // Get bookmarks (episodes)
  getBookmarks: async (req, res, next) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;
      const userId = req.user.id;
      const result = await query(
        `SELECT b.*, e.title as episode_title, e.episode_number, e.duration_seconds,
                s.title as series_title, s.thumbnail_url
         FROM bookmarks b JOIN episodes e ON b.episode_id = e.id JOIN series s ON b.series_id = s.id
         WHERE b.user_id = $1 AND b.is_active = true ORDER BY b.created_at DESC LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
      const countResult = await query('SELECT COUNT(*) FROM bookmarks WHERE user_id = $1 AND is_active = true', [userId]);
      return res.json({
        status: 'success',
        data: {
          bookmarks: result.rows,
          pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(countResult.rows[0].count), pages: Math.ceil(parseInt(countResult.rows[0].count) / limit) }
        }
      });
    } catch (error) {
      console.error('Get bookmarks error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching bookmarks' });
    }
  },

  // Get following creators (exclude admins)
  getFollowing: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const result = await query(
        `SELECT u.id, u.username, u.full_name, u.profile_picture, u.creator_bio, COUNT(DISTINCT s.id) as series_count
         FROM user_following uf
         JOIN users u ON uf.following_id = u.id
         LEFT JOIN series s ON u.id = s.creator_id AND s.is_active = true
         WHERE uf.follower_id = $1 AND u.is_creator = true AND u.is_admin = false
         GROUP BY u.id
         ORDER BY u.username`,
        [userId]
      );
      return res.json({ status: 'success', data: { following: result.rows } });
    } catch (error) {
      console.error('Get following error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching following list' });
    }
  },

  // Follow a creator
  followCreator: async (req, res, next) => {
    try {
      const creatorId = req.params.id;
      const userId = req.user.id;
      if (creatorId === userId) return res.status(400).json({ status: 'error', message: 'You cannot follow yourself' });
      const creatorResult = await query('SELECT id, is_creator, is_admin FROM users WHERE id = $1 AND is_active = true', [creatorId]);
      if (creatorResult.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Creator not found' });
      if (!creatorResult.rows[0].is_creator) return res.status(400).json({ status: 'error', message: 'User is not a creator' });
      if (creatorResult.rows[0].is_admin) return res.status(403).json({ status: 'error', message: 'Cannot follow admin accounts' });
      const followResult = await query('SELECT id FROM user_following WHERE follower_id = $1 AND following_id = $2', [userId, creatorId]);
      if (followResult.rows.length > 0) return res.status(409).json({ status: 'error', message: 'You are already following this creator' });
      await query('INSERT INTO user_following (follower_id, following_id) VALUES ($1, $2)', [userId, creatorId]);
      await query(`INSERT INTO user_activity (user_id, activity_type, metadata) VALUES ($1, 'follow', $2)`, [userId, JSON.stringify({ following_id: creatorId })]);
      return res.status(201).json({ status: 'success', message: 'Successfully followed creator' });
    } catch (error) {
      console.error('Follow creator error:', error);
      return res.status(500).json({ status: 'error', message: 'Error following creator' });
    }
  },

  // Unfollow a creator
  unfollowCreator: async (req, res, next) => {
    try {
      const creatorId = req.params.id;
      const userId = req.user.id;
      const result = await query('DELETE FROM user_following WHERE follower_id = $1 AND following_id = $2 RETURNING id', [userId, creatorId]);
      if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'You are not following this creator' });
      return res.json({ status: 'success', message: 'Successfully unfollowed creator' });
    } catch (error) {
      console.error('Unfollow creator error:', error);
      return res.status(500).json({ status: 'error', message: 'Error unfollowing creator' });
    }
  },

  // Get personal user stats
  getUserStats: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const statsResult = await query(
        `SELECT (SELECT COUNT(*) FROM listening_progress WHERE user_id = $1) as total_listened,
                (SELECT COALESCE(SUM(listened_duration_seconds), 0) FROM listening_progress WHERE user_id = $1) as total_time_spent,
                (SELECT COUNT(*) FROM bookmarks WHERE user_id = $1 AND is_active = true) as total_bookmarks,
                (SELECT COUNT(*) FROM user_following WHERE follower_id = $1) as following_count,
                (SELECT COUNT(*) FROM user_following WHERE following_id = $1) as followers_count`,
        [userId]
      );
      return res.json({ status: 'success', data: { stats: statsResult.rows[0] } });
    } catch (error) {
      console.error('Get user stats error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching user stats' });
    }
  },

  // Global platform stats (no auth)
  getGlobalStats: async (req, res, next) => {
    try {
      const result = await query(
        `SELECT (SELECT COUNT(*) FROM series WHERE is_active = true) as series_count,
                (SELECT COUNT(*) FROM users WHERE is_creator = true AND is_active = true AND is_admin = false) as creators_count,
                (SELECT COUNT(*) FROM episodes WHERE is_active = true) as episodes_count`
      );
      return res.json({ status: 'success', data: { stats: result.rows[0] } });
    } catch (error) {
      console.error('Get global stats error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching stats' });
    }
  },

  // Get bookmarked series (via user_activity)
  getBookmarkedSeries: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const result = await query(
        `SELECT DISTINCT ON (s.id) s.*, ua.created_at as bookmarked_at
         FROM user_activity ua JOIN series s ON ua.series_id = s.id
         WHERE ua.user_id = $1 AND ua.activity_type = 'bookmark'
         ORDER BY s.id, ua.created_at DESC`,
        [userId]
      );
      return res.json({ status: 'success', data: { series: result.rows } });
    } catch (error) {
      console.error('Get bookmarked series error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching bookmarked series' });
    }
  },

  // Get creator-specific stats
  getCreatorStats: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const stats = await query(
        `SELECT
          (SELECT COUNT(*) FROM series WHERE creator_id = $1 AND is_active = true) as series_count,
          (SELECT COUNT(*) FROM episodes e JOIN series s ON e.series_id = s.id WHERE s.creator_id = $1 AND e.is_active = true) as episodes_count,
          (SELECT COALESCE(SUM(play_count), 0) FROM series WHERE creator_id = $1) as total_plays,
          (SELECT COUNT(*) FROM user_following WHERE following_id = $1) as followers_count`,
        [userId]
      );
      return res.json({ status: 'success', data: { stats: stats.rows[0] } });
    } catch (error) {
      console.error('Get creator stats error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching creator stats' });
    }
  },

  // Get followers (exclude admin accounts)
  getFollowers: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const result = await query(
        `SELECT u.id, u.username, u.full_name, u.profile_picture,
                (SELECT COUNT(*) FROM user_following WHERE following_id = u.id) as followers_count
         FROM user_following uf
         JOIN users u ON uf.follower_id = u.id
         WHERE uf.following_id = $1 AND u.is_admin = false
         ORDER BY u.username`,
        [userId]
      );
      return res.json({ status: 'success', data: { followers: result.rows } });
    } catch (error) {
      console.error('Get followers error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching followers' });
    }
  },

  // Get top creators (public, exclude admins)
  getTopCreators: async (req, res, next) => {
    try {
      const result = await query(
        `SELECT u.id, u.username, u.full_name, u.profile_picture,
                (SELECT COUNT(*) FROM user_following WHERE following_id = u.id) as followers_count,
                (SELECT COUNT(*) FROM series WHERE creator_id = u.id AND is_active = true) as series_count
         FROM users u
         WHERE u.is_creator = true AND u.is_active = true AND u.is_admin = false
         ORDER BY followers_count DESC, series_count DESC
         LIMIT 5`
      );
      return res.json({ status: 'success', data: { creators: result.rows } });
    } catch (error) {
      console.error('Get top creators error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching top creators' });
    }
  },

  // Get creator analytics (no change needed – only for logged-in creator)
  getCreatorAnalytics: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const seriesPlays = await query(
        `SELECT s.id, s.title, s.play_count
         FROM series s
         WHERE s.creator_id = $1 AND s.is_active = true
         ORDER BY s.play_count DESC`,
        [userId]
      );
      const weeklyPlays = await query(
        `WITH weeks AS (
           SELECT generate_series(
             date_trunc('week', CURRENT_DATE) - INTERVAL '3 weeks',
             date_trunc('week', CURRENT_DATE),
             '1 week'
           ) AS week_start
         )
         SELECT to_char(weeks.week_start, 'MM/DD') as week_label,
                COALESCE(COUNT(t.id), 0) as play_count
         FROM weeks
         LEFT JOIN trending_log t ON t.time_window >= weeks.week_start
            AND t.time_window < weeks.week_start + INTERVAL '7 days'
            AND t.activity_type = 'listen'
            AND t.series_id IN (SELECT id FROM series WHERE creator_id = $1)
         GROUP BY weeks.week_start
         ORDER BY weeks.week_start`,
        [userId]
      );
      const topEpisodes = await query(
        `SELECT e.id, e.title, e.play_count, s.title as series_title
         FROM episodes e
         JOIN series s ON e.series_id = s.id
         WHERE s.creator_id = $1 AND e.is_active = true
         ORDER BY e.play_count DESC
         LIMIT 5`,
        [userId]
      );
      const totalListeners = await query(
        `SELECT COUNT(DISTINCT lp.user_id) as total_listeners
         FROM listening_progress lp
         JOIN episodes e ON lp.episode_id = e.id
         JOIN series s ON e.series_id = s.id
         WHERE s.creator_id = $1`,
        [userId]
      );
      return res.json({
        status: 'success',
        data: {
          seriesPlays: seriesPlays.rows,
          weeklyPlays: weeklyPlays.rows,
          topEpisodes: topEpisodes.rows,
          totalListeners: parseInt(totalListeners.rows[0].total_listeners) || 0,
        }
      });
    } catch (error) {
      console.error('Get creator analytics error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching analytics' });
    }
  },
};

module.exports = userController;