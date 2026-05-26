const { query, getClient } = require('../config/database');
const { clean } = require('../utils/sanitize');

const novelController = {
  // Get all novels (public)
  getAllNovels: async (req, res) => {
    try {
      const { page = 1, limit = 20, category, language, status, sort = 'latest', my_novels } = req.query;
      const offset = (page - 1) * limit;
      const params = [];
      let paramCount = 1;
      let whereClause = 'WHERE n.is_active = true';
      let orderClause = 'ORDER BY n.created_at DESC';

      if (my_novels === 'true') {
        if (!req.user) return res.status(401).json({ error: 'Authentication required' });
        whereClause += ` AND n.creator_id = $${paramCount}`;
        params.push(req.user.id);
        paramCount++;
      }

      if (category) {
        whereClause += ` AND n.category_id = $${paramCount}`;
        params.push(category);
        paramCount++;
      }
      if (language) {
        whereClause += ` AND n.language = $${paramCount}`;
        params.push(language);
        paramCount++;
      }
      if (status) {
        whereClause += ` AND n.status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }

      switch (sort) {
        case 'popular': orderClause = 'ORDER BY n.read_count DESC'; break;
        case 'rating': orderClause = 'ORDER BY n.average_rating DESC'; break;
        case 'title': orderClause = 'ORDER BY n.title ASC'; break;
      }

      const countResult = await query(`SELECT COUNT(*) FROM novels n ${whereClause}`, params);
      params.push(limit, offset);
      const result = await query(
        `SELECT n.*, u.username as creator_username, u.full_name as creator_name,
                c.name as category_name
         FROM novels n
         JOIN users u ON n.creator_id = u.id
         LEFT JOIN categories c ON n.category_id = c.id
         ${whereClause}
         ${orderClause}
         LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
        params
      );

      res.json({
        status: 'success',
        data: {
          novels: result.rows,
          pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(countResult.rows[0].count), pages: Math.ceil(parseInt(countResult.rows[0].count) / limit) }
        }
      });
    } catch (error) {
      console.error('Get novels error:', error);
      res.status(500).json({ status: 'error', message: 'Error fetching novels' });
    }
  },

  // Get single novel by ID with chapters and progress
  getNovelById: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const novelResult = await query(
        `SELECT n.*, u.username as creator_username, u.full_name as creator_name,
                c.name as category_name,
                EXISTS(SELECT 1 FROM user_activity WHERE user_id = $2 AND activity_type = 'like' AND novel_id = n.id) as is_liked
         FROM novels n
         JOIN users u ON n.creator_id = u.id
         LEFT JOIN categories c ON n.category_id = c.id
         WHERE n.id = $1 AND n.is_active = true`,
        [id, userId]
      );

      if (novelResult.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Novel not found' });
      }

      const novel = novelResult.rows[0];

      // Increment read count
      await query('UPDATE novels SET read_count = read_count + 1 WHERE id = $1', [id]);

      // Get chapters - ensure rows is always an array
      const chaptersResult = await query(
        `SELECT id, chapter_number, title, word_count, is_premium, created_at
         FROM novel_chapters
         WHERE novel_id = $1 AND is_active = true
         ORDER BY chapter_number ASC`,
        [id]
      );
      const chapters = chaptersResult.rows || [];

      // Get reading progress
      let progress = null;
      if (userId) {
        const progressResult = await query(
          `SELECT chapter_id, scroll_position FROM novel_reading_progress
           WHERE user_id = $1 AND novel_id = $2
           ORDER BY last_read_at DESC LIMIT 1`,
          [userId, id]
        );
        if (progressResult.rows.length) progress = progressResult.rows[0];
      }

      res.json({ status: 'success', data: { novel, chapters, progress } });
    } catch (error) {
      console.error('Get novel error:', error);
      res.status(500).json({ status: 'error', message: 'Error fetching novel' });
    }
  },

  // Get single chapter content
  getChapter: async (req, res) => {
    try {
      const { novelId, chapterId } = req.params;
      const userId = req.user?.id;

      const chapterResult = await query(
        `SELECT c.*, n.title as novel_title, n.creator_id,
                (SELECT scroll_position FROM novel_reading_progress WHERE user_id = $2 AND chapter_id = c.id) as saved_position
         FROM novel_chapters c
         JOIN novels n ON c.novel_id = n.id
         WHERE c.id = $1 AND c.is_active = true AND n.is_active = true`,
        [chapterId, userId]
      );

      if (chapterResult.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Chapter not found' });
      }

      const chapter = chapterResult.rows[0];

      // Increment read count
      await query('UPDATE novel_chapters SET read_count = read_count + 1 WHERE id = $1', [chapterId]);

      // Save reading progress
      if (userId) {
        await query(
          `INSERT INTO novel_reading_progress (user_id, novel_id, chapter_id, last_read_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT (user_id, novel_id, chapter_id)
           DO UPDATE SET last_read_at = CURRENT_TIMESTAMP`,
          [userId, novelId, chapterId]
        );
      }

      res.json({ status: 'success', data: { chapter } });
    } catch (error) {
      console.error('Get chapter error:', error);
      res.status(500).json({ status: 'error', message: 'Error fetching chapter' });
    }
  },

  // Save reading progress (scroll position)
  saveReadingProgress: async (req, res) => {
    try {
      const { chapterId, scrollPosition } = req.body;
      const userId = req.user.id;

      await query(
        `INSERT INTO novel_reading_progress (user_id, novel_id, chapter_id, scroll_position, last_read_at)
         VALUES ($1, (SELECT novel_id FROM novel_chapters WHERE id = $2), $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, novel_id, chapter_id)
         DO UPDATE SET scroll_position = $3, last_read_at = CURRENT_TIMESTAMP`,
        [userId, chapterId, scrollPosition]
      );

      res.json({ status: 'success', message: 'Progress saved' });
    } catch (error) {
      console.error('Save progress error:', error);
      res.status(500).json({ status: 'error', message: 'Error saving progress' });
    }
  },

  // Create new novel (creator only)
  createNovel: async (req, res) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      
      const { title, description, category_id, language, tags, author_name } = req.body;
      const creator_id = req.user.id;
      let cover_image_url = req.file?.path || null;

      // Convert tags from array to PostgreSQL array literal: ['tag1','tag2'] → '{tag1,tag2}'
      let tagsArray = null;
      if (tags) {
        if (Array.isArray(tags)) {
          tagsArray = `{${tags.map(t => t.replace(/[{}"\\]/g, '')).join(',')}}`;
        } else if (typeof tags === 'string') {
          const cleaned = tags.split(',').map(t => t.trim().replace(/[{}"\\]/g, ''));
          tagsArray = `{${cleaned.join(',')}}`;
        }
      }

      const result = await client.query(
        `INSERT INTO novels (title, description, cover_image_url, category_id, creator_id, language, tags, author_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [clean(title), clean(description), cover_image_url, category_id, creator_id, language || 'en', tagsArray, clean(author_name)]
      );

      await client.query('COMMIT');
      res.status(201).json({ status: 'success', data: { novel: result.rows[0] } });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create novel error:', error);
      res.status(500).json({ status: 'error', message: 'Error creating novel' });
    } finally {
      client.release();
    }
  },

  // Update novel (creator only)
  updateNovel: async (req, res) => {
    const client = await getClient();
    try {
      const { id } = req.params;
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (req.body.title) { updates.push(`title = $${paramCount}`); values.push(clean(req.body.title)); paramCount++; }
      if (req.body.description !== undefined) { updates.push(`description = $${paramCount}`); values.push(clean(req.body.description)); paramCount++; }
      if (req.body.status) { updates.push(`status = $${paramCount}`); values.push(req.body.status); paramCount++; }
      
      // Handle tags update similarly
      if (req.body.tags) {
        let tagsArray = null;
        if (Array.isArray(req.body.tags)) {
          tagsArray = `{${req.body.tags.map(t => t.replace(/[{}"\\]/g, '')).join(',')}}`;
        } else if (typeof req.body.tags === 'string') {
          const cleaned = req.body.tags.split(',').map(t => t.trim().replace(/[{}"\\]/g, ''));
          tagsArray = `{${cleaned.join(',')}}`;
        }
        updates.push(`tags = $${paramCount}`); values.push(tagsArray); paramCount++;
      }
      
      if (req.file) { updates.push(`cover_image_url = $${paramCount}`); values.push(req.file.path); paramCount++; }

      if (updates.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No fields to update' });
      }

      values.push(id);
      const result = await client.query(
        `UPDATE novels SET ${updates.join(', ')} WHERE id = $${paramCount} AND creator_id = $${paramCount + 1} RETURNING *`,
        [...values, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Novel not found or not authorized' });
      }

      await client.query('COMMIT');
      res.json({ status: 'success', data: { novel: result.rows[0] } });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Update novel error:', error);
      res.status(500).json({ status: 'error', message: 'Error updating novel' });
    } finally {
      client.release();
    }
  },

  // Delete novel (soft delete)
  deleteNovel: async (req, res) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const { id } = req.params;
      await client.query('UPDATE novels SET is_active = false WHERE id = $1 AND creator_id = $2', [id, req.user.id]);
      await client.query('COMMIT');
      res.json({ status: 'success', message: 'Novel deleted' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Delete novel error:', error);
      res.status(500).json({ status: 'error', message: 'Error deleting novel' });
    } finally {
      client.release();
    }
  },

  // Add chapter to novel
  addChapter: async (req, res) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const { novelId } = req.params;
      const { chapter_number, title, content, is_premium } = req.body;

      // Verify ownership
      const novelCheck = await client.query(
        'SELECT id, total_chapters FROM novels WHERE id = $1 AND creator_id = $2',
        [novelId, req.user.id]
      );
      if (novelCheck.rows.length === 0) {
        return res.status(403).json({ status: 'error', message: 'Not authorized' });
      }

      const wordCount = content.trim().split(/\s+/).length;

      const result = await client.query(
        `INSERT INTO novel_chapters (novel_id, chapter_number, title, content, word_count, is_premium)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [novelId, chapter_number, clean(title), content, wordCount, is_premium || false]
      );

      await client.query(
        'UPDATE novels SET total_chapters = total_chapters + 1, total_words = total_words + $1 WHERE id = $2',
        [wordCount, novelId]
      );

      await client.query('COMMIT');
      res.status(201).json({ status: 'success', data: { chapter: result.rows[0] } });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Add chapter error:', error);
      res.status(500).json({ status: 'error', message: 'Error adding chapter' });
    } finally {
      client.release();
    }
  },

  // Toggle like on novel
  toggleLike: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const existing = await query(
        'SELECT id FROM user_activity WHERE user_id = $1 AND activity_type = $2 AND novel_id = $3',
        [userId, 'like', id]
      );

      if (existing.rows.length > 0) {
        await query('DELETE FROM user_activity WHERE id = $1', [existing.rows[0].id]);
        await query('UPDATE novels SET like_count = like_count - 1 WHERE id = $1', [id]);
        return res.json({ status: 'success', message: 'Like removed' });
      } else {
        await query(
          'INSERT INTO user_activity (user_id, activity_type, novel_id, metadata) VALUES ($1, $2, $3, $4)',
          [userId, 'like', id, JSON.stringify({})]
        );
        await query('UPDATE novels SET like_count = like_count + 1 WHERE id = $1', [id]);
        return res.json({ status: 'success', message: 'Liked' });
      }
    } catch (error) {
      console.error('Toggle like error:', error);
      res.status(500).json({ status: 'error', message: 'Error toggling like' });
    }
  }
};

module.exports = novelController;