const { query, getClient } = require('../config/database');
const { deleteFile } = require('../config/cloudinary');
const { clean } = require('../utils/sanitize');
const { generateHlsStreamUrl } = require('../utils/streaming');

const seriesController = {
  // Get all series with pagination and optional my_series filter
  getAllSeries: async (req, res, next) => {
    try {
      const { page = 1, limit = 20, category, language, status, sort = 'latest', my_series } = req.query;
      const offset = (page - 1) * limit;
      const params = [];
      let paramCount = 1;
      let whereClause = 'WHERE s.is_active = true';
      let orderClause = 'ORDER BY s.created_at DESC';

      // 🔥 IMPORTANT: If my_series is requested, require authentication and filter by creator_id
      if (my_series === 'true') {
        if (!req.user) {
          return res.status(401).json({
            status: 'error',
            message: 'Authentication required to view your series'
          });
        }
        whereClause += ` AND s.creator_id = $${paramCount}`;
        params.push(req.user.id);
        paramCount++;
      }

      // Optional filters
      if (category) {
        whereClause += ` AND s.category_id = $${paramCount}`;
        params.push(category);
        paramCount++;
      }
      if (language) {
        whereClause += ` AND s.language = $${paramCount}`;
        params.push(language);
        paramCount++;
      }
      if (status) {
        whereClause += ` AND s.status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }

      // Sorting
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
        default:
          orderClause = 'ORDER BY s.created_at DESC';
      }

      // Count total
      const countResult = await query(
        `SELECT COUNT(*) FROM series s ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].count);

      // Add limit and offset
      params.push(limit, offset);
      const result = await query(
        `SELECT s.*,
                u.username as creator_username,
                u.full_name as creator_name,
                c.name as category_name,
                c.slug as category_slug
         FROM series s
         JOIN users u ON s.creator_id = u.id
         LEFT JOIN categories c ON s.category_id = c.id
         ${whereClause}
         ${orderClause}
         LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
        params
      );

      return res.json({
        status: 'success',
        data: {
          series: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Get all series error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error fetching series'
      });
    }
  },

  // Get series by ID
  getSeriesById: async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const result = await query(
        `SELECT s.*,
                u.username as creator_username,
                u.full_name as creator_name,
                u.profile_picture as creator_avatar,
                c.name as category_name,
                c.slug as category_slug,
                (SELECT COUNT(*) FROM user_following WHERE following_id = u.id) as creator_followers,
                EXISTS(SELECT 1 FROM user_activity WHERE user_id = $2 AND activity_type = 'like' AND series_id = s.id) as is_liked,
                EXISTS(SELECT 1 FROM user_activity WHERE user_id = $2 AND activity_type = 'bookmark' AND series_id = s.id) as is_bookmarked,
                (SELECT COUNT(*) FROM user_activity WHERE series_id = s.id AND activity_type = 'like') as like_count,
                (SELECT rating FROM ratings WHERE user_id = $2 AND series_id = s.id LIMIT 1) as user_rating
         FROM series s
         JOIN users u ON s.creator_id = u.id
         LEFT JOIN categories c ON s.category_id = c.id
         WHERE s.id = $1 AND s.is_active = true`,
        [id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Series not found' });
      }

      const series = result.rows[0];
      let shouldIncrementPlay = true;

      if (userId) {
        if (req.user.id === series.creator_id) {
          shouldIncrementPlay = false;
        } else {
          const recentActivity = await query(
            `SELECT 1 FROM user_activity
             WHERE user_id = $1 AND series_id = $2 AND activity_type = 'listen'
               AND created_at > CURRENT_TIMESTAMP - INTERVAL '5 minutes'
             LIMIT 1`,
            [userId, id]
          );
          if (recentActivity.rows.length > 0) shouldIncrementPlay = false;
        }
      }

      if (shouldIncrementPlay) {
        await query('UPDATE series SET play_count = play_count + 1 WHERE id = $1', [id]);
        if (userId) {
          await query(
            `INSERT INTO user_activity (user_id, activity_type, series_id, metadata)
             VALUES ($1, 'listen', $2, $3)`,
            [userId, id, JSON.stringify({ action: 'view_series' })]
          );
        }
      }

      return res.json({ status: 'success', data: { series } });
    } catch (error) {
      console.error('Get series error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching series details' });
    }
  },

  // Get series episodes
  getSeriesEpisodes: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;
      const userId = req.user?.id || null;

      const countResult = await query(
        `SELECT COUNT(*) FROM episodes WHERE series_id = $1 AND is_active = true`,
        [id]
      );

      const result = await query(
        `SELECT e.*,
                lp.progress_seconds as user_progress,
                lp.is_completed as user_completed
         FROM episodes e
         LEFT JOIN listening_progress lp ON e.id = lp.episode_id AND lp.user_id = $2
         WHERE e.series_id = $1 AND e.is_active = true
         ORDER BY e.season_number ASC, e.episode_number ASC
         LIMIT $3 OFFSET $4`,
        [id, userId, limit, offset]
      );

      // Never send raw, permanent Cloudinary URLs to the client -- swap
      // each episode's audio_url for a short-lived signed stream link.
      const episodes = result.rows.map(ep => ({
        ...ep,
        audio_url: ep.audio_url ? generateHlsStreamUrl(req, ep.id, userId) : ep.audio_url
      }));

      return res.json({
        status: 'success',
        data: {
          episodes,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(countResult.rows[0].count),
            pages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
          }
        }
      });
    } catch (error) {
      console.error('Get series episodes error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching episodes' });
    }
  },

  // Create new series
  createSeries: async (req, res, next) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const title = clean(req.body.title);
      const description = clean(req.body.description);
      const author_name = clean(req.body.author_name);
      const narrator_name = clean(req.body.narrator_name);

      const { category_id, language, tags } = req.body;
      const creator_id = req.user.id;
      let thumbnail_url = null;

      if (req.file) {
        thumbnail_url = req.file.path;
      }

      const result = await client.query(
        `INSERT INTO series (title, description, category_id, creator_id,
                            author_name, narrator_name, language, thumbnail_url, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [title, description, category_id, creator_id,
         author_name, narrator_name, language || 'en',
         thumbnail_url, tags || []]
      );

      await client.query('COMMIT');

      return res.status(201).json({
        status: 'success',
        message: 'Series created successfully',
        data: { series: result.rows[0] }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create series error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error creating series'
      });
    } finally {
      client.release();
    }
  },

  // Update series
  updateSeries: async (req, res, next) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const updateFields = [];
      const values = [];
      let paramCount = 1;

      if (req.body.title) {
        updateFields.push(`title = $${paramCount}`);
        values.push(clean(req.body.title));
        paramCount++;
      }
      if (req.body.description !== undefined) {
        updateFields.push(`description = $${paramCount}`);
        values.push(clean(req.body.description));
        paramCount++;
      }
      if (req.body.author_name) {
        updateFields.push(`author_name = $${paramCount}`);
        values.push(clean(req.body.author_name));
        paramCount++;
      }
      if (req.body.narrator_name) {
        updateFields.push(`narrator_name = $${paramCount}`);
        values.push(clean(req.body.narrator_name));
        paramCount++;
      }
      if (req.body.status) {
        updateFields.push(`status = $${paramCount}`);
        values.push(req.body.status);
        paramCount++;
      }
      if (req.body.tags) {
        updateFields.push(`tags = $${paramCount}`);
        values.push(req.body.tags);
        paramCount++;
      }
      if (req.file) {
        updateFields.push(`thumbnail_url = $${paramCount}`);
        values.push(req.file.path);
        paramCount++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No fields to update' });
      }

      values.push(id);
      const result = await client.query(
        `UPDATE series SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      await client.query('COMMIT');

      return res.json({
        status: 'success',
        message: 'Series updated successfully',
        data: { series: result.rows[0] }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Update series error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error updating series'
      });
    } finally {
      client.release();
    }
  },

  // Rate a series
  rateSeries: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { rating } = req.body;
      const userId = req.user.id;

      const ratingValue = parseInt(rating);
      if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5) {
        return res.status(422).json({ status: 'error', message: 'Rating must be between 1 and 5' });
      }

      const seriesCheck = await query('SELECT id FROM series WHERE id = $1 AND is_active = true', [id]);
      if (seriesCheck.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Series not found' });
      }

      await query(
        `INSERT INTO ratings (user_id, series_id, rating)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, series_id)
         DO UPDATE SET rating = $3, updated_at = CURRENT_TIMESTAMP`,
        [userId, id, ratingValue]
      );

      const avgResult = await query(
        'SELECT COALESCE(AVG(rating),0) as avg_rating, COUNT(*) as count FROM ratings WHERE series_id = $1',
        [id]
      );
      const { avg_rating, count } = avgResult.rows[0];

      await query(
        'UPDATE series SET average_rating = $1, rating_count = $2 WHERE id = $3',
        [parseFloat(avg_rating), parseInt(count), id]
      );

      await query(
        `INSERT INTO user_activity (user_id, activity_type, series_id, metadata)
         VALUES ($1, 'rate', $2, $3)`,
        [userId, id, JSON.stringify({ rating: ratingValue })]
      );

      return res.json({
        status: 'success',
        message: 'Rating submitted',
        data: { average_rating: parseFloat(avg_rating), rating_count: parseInt(count) }
      });
    } catch (error) {
      console.error('Rate series error:', error);
      return res.status(500).json({ status: 'error', message: 'Error rating series' });
    }
  },

  // Delete series (soft delete – set is_active = false)
  deleteSeries: async (req, res, next) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const { id } = req.params;

      // Soft delete series
      await client.query('UPDATE series SET is_active = false WHERE id = $1', [id]);

      await client.query('COMMIT');

      return res.json({
        status: 'success',
        message: 'Series deleted successfully'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Delete series error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error deleting series'
      });
    } finally {
      client.release();
    }
  }
};

module.exports = seriesController;
