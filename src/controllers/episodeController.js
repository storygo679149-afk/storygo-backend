const { query, getClient } = require('../config/database');
const { deleteFile } = require('../config/cloudinary');
const geoip = require('geoip-lite');
const { clean } = require('../utils/sanitize');
const { generateStreamUrl } = require('../utils/streaming');

const episodeController = {
  // Get episode by ID
  getEpisodeById: async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const result = await query(
        `SELECT e.*, 
                s.title as series_title, 
                s.thumbnail_url as series_thumbnail,
                s.creator_id,
                lp.progress_seconds as user_progress,
                lp.playback_speed as user_playback_speed,
                lp.is_completed as user_completed,
                EXISTS(SELECT 1 FROM bookmarks WHERE episode_id = e.id AND user_id = $2 AND is_active = true) as is_bookmarked
         FROM episodes e
         JOIN series s ON e.series_id = s.id
         LEFT JOIN listening_progress lp ON e.id = lp.episode_id AND lp.user_id = $2
         WHERE e.id = $1 AND e.is_active = true`,
        [id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Episode not found' });
      }

      const episode = result.rows[0];
      let shouldIncrementPlay = true;

      if (userId) {
        const recentProgress = await query(
          `SELECT 1 FROM listening_progress
           WHERE user_id = $1 AND episode_id = $2
             AND updated_at > CURRENT_TIMESTAMP - INTERVAL '5 minutes'
           LIMIT 1`,
          [userId, id]
        );
        if (recentProgress.rows.length > 0) shouldIncrementPlay = false;
        if (req.user.id === episode.creator_id) shouldIncrementPlay = false;
      }

      if (shouldIncrementPlay) {
        await query('UPDATE episodes SET play_count = play_count + 1 WHERE id = $1', [id]);
        if (userId && req.user.id !== episode.creator_id) {
          await query(
            `INSERT INTO user_activity (user_id, activity_type, series_id, episode_id, metadata)
             VALUES ($1, 'listen', $2, $3, $4)`,
            [userId, episode.series_id, id, JSON.stringify({ action: 'play_episode' })]
          );
          await query(
            `INSERT INTO trending_log (series_id, episode_id, activity_type, weight)
             VALUES ($1, $2, 'listen', 1)`,
            [episode.series_id, id]
          );
        }
      }

      // Never send the raw, permanent Cloudinary URL to the client.
      // Replace it with a short-lived signed streaming link instead.
      episode.audio_url = generateStreamUrl(req, episode.id, userId);

      return res.json({ status: 'success', data: { episode } });
    } catch (error) {
      console.error('Get episode error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching episode' });
    }
  },

  // Update listening progress
  updateProgress: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { progress_seconds, playback_speed = 1.0 } = req.body;
      const userId = req.user.id;

      const episodeResult = await query(
        'SELECT id, duration_seconds, series_id FROM episodes WHERE id = $1 AND is_active = true',
        [id]
      );
      if (episodeResult.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Episode not found' });
      }

      const episode = episodeResult.rows[0];
      const isCompleted = progress_seconds >= (episode.duration_seconds - 10);

      const result = await query(
        `INSERT INTO listening_progress 
         (user_id, episode_id, progress_seconds, playback_speed, is_completed, 
          last_position_seconds, listened_duration_seconds)
         VALUES ($1, $2, $3, $4, $5, $3, 0)
         ON CONFLICT (user_id, episode_id) 
         DO UPDATE SET 
           progress_seconds = $3,
           playback_speed = $4,
           is_completed = $5,
           last_position_seconds = $3,
           listened_duration_seconds = listening_progress.listened_duration_seconds + GREATEST(0, $3 - listening_progress.last_position_seconds),
           session_count = listening_progress.session_count + 1,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [userId, id, progress_seconds, playback_speed, isCompleted]
      );

      await query(
        `INSERT INTO trending_log (series_id, episode_id, activity_type, weight)
         VALUES ($1, $2, 'listen', 1)`,
        [episode.series_id, id]
      );

      // ----- Log listener location -----
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                 req.socket.remoteAddress ||
                 req.ip;
      const geo = geoip.lookup(ip);
      const city = geo?.city || 'Unknown';
      const country = geo?.country || 'Unknown';

      await query(
        `INSERT INTO listener_locations (user_id, episode_id, ip_address, city, country)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, id, ip, city, country]
      ).catch(() => {});

      return res.json({ status: 'success', message: 'Progress updated', data: { progress: result.rows[0] } });
    } catch (error) {
      console.error('Update progress error:', error);
      return res.status(500).json({ status: 'error', message: 'Error updating progress' });
    }
  },

  // Toggle bookmark
  toggleBookmark: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { timestamp_seconds, note } = req.body;
      const userId = req.user.id;

      const episodeResult = await query(
        'SELECT id, series_id FROM episodes WHERE id = $1 AND is_active = true',
        [id]
      );
      if (episodeResult.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Episode not found' });
      }

      const bookmarkResult = await query(
        'SELECT id, is_active FROM bookmarks WHERE user_id = $1 AND episode_id = $2',
        [userId, id]
      );

      if (bookmarkResult.rows.length > 0 && bookmarkResult.rows[0].is_active) {
        await query('UPDATE bookmarks SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [bookmarkResult.rows[0].id]);
        return res.json({ status: 'success', message: 'Bookmark removed' });
      } else if (bookmarkResult.rows.length > 0) {
        await query(
          `UPDATE bookmarks SET is_active = true, timestamp_seconds = $1, note = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [timestamp_seconds, note, bookmarkResult.rows[0].id]
        );
        return res.json({ status: 'success', message: 'Bookmark added' });
      } else {
        await query(
          `INSERT INTO bookmarks (user_id, episode_id, series_id, timestamp_seconds, note)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, id, episodeResult.rows[0].series_id, timestamp_seconds, note]
        );
        await query(
          `INSERT INTO user_activity (user_id, activity_type, series_id, episode_id, metadata)
           VALUES ($1, 'bookmark', $2, $3, $4)`,
          [userId, episodeResult.rows[0].series_id, id, JSON.stringify({ timestamp_seconds })]
        );
        return res.status(201).json({ status: 'success', message: 'Bookmark added' });
      }
    } catch (error) {
      console.error('Toggle bookmark error:', error);
      return res.status(500).json({ status: 'error', message: 'Error toggling bookmark' });
    }
  },

  // Check bookmark status
  checkBookmark: async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const result = await query(
        `SELECT EXISTS(SELECT 1 FROM bookmarks WHERE user_id = $1 AND episode_id = $2 AND is_active = true) as is_bookmarked`,
        [userId, id]
      );
      return res.json({ status: 'success', data: { is_bookmarked: result.rows[0].is_bookmarked } });
    } catch (error) {
      console.error('Check bookmark error:', error);
      return res.status(500).json({ status: 'error', message: 'Error checking bookmark status' });
    }
  },

  // Create new episode
  createEpisode: async (req, res, next) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // ---------- SANITISE ----------
      const title = clean(req.body.title);
      const description = clean(req.body.description);

      const { series_id, episode_number, season_number = 1 } = req.body;
      const creator_id = req.user.id;

      const seriesResult = await client.query(
        'SELECT id, creator_id FROM series WHERE id = $1 AND creator_id = $2',
        [series_id, creator_id]
      );
      if (seriesResult.rows.length === 0) {
        return res.status(403).json({ status: 'error', message: 'You do not own this series' });
      }

      if (!req.files || !req.files.audio || !req.files.audio[0]) {
        return res.status(400).json({ status: 'error', message: 'Audio file is required' });
      }
      const audioFile = req.files.audio[0];
      const audio_url = audioFile.path;
      const audio_public_id = audioFile.filename;
      const file_size_bytes = audioFile.size;
      let duration_seconds = 0;
      if (audioFile.duration) duration_seconds = Math.round(audioFile.duration);

      let thumbnail_url = null;
      if (req.files.thumbnail && req.files.thumbnail[0]) {
        thumbnail_url = req.files.thumbnail[0].path;
      }

      const result = await client.query(
        `INSERT INTO episodes (series_id, title, description, audio_url, audio_public_id,
                              duration_seconds, file_size_bytes, episode_number, season_number, thumbnail_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [series_id, title, description, audio_url, audio_public_id,
         duration_seconds, file_size_bytes, episode_number, season_number, thumbnail_url]
      );

      await client.query(
        `UPDATE series SET total_episodes = total_episodes + 1, total_duration_seconds = total_duration_seconds + $1 WHERE id = $2`,
        [duration_seconds, series_id]
      );

      await client.query('COMMIT');
      return res.status(201).json({ status: 'success', message: 'Episode created successfully', data: { episode: result.rows[0] } });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create episode error:', error);
      return res.status(500).json({ status: 'error', message: 'Error creating episode' });
    } finally {
      client.release();
    }
  },

  // Update episode
  updateEpisode: async (req, res, next) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const { id } = req.params;
      const updateFields = [];
      const values = [];
      let paramCount = 1;

      // ---------- SANITISE ----------
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

      // Handle audio file update
      if (req.files && req.files.audio && req.files.audio[0]) {
        const audioFile = req.files.audio[0];
        const oldEpisode = await client.query('SELECT audio_public_id FROM episodes WHERE id = $1', [id]);
        if (oldEpisode.rows[0]?.audio_public_id) {
          await deleteFile(oldEpisode.rows[0].audio_public_id, 'video').catch(console.error);
        }
        updateFields.push(`audio_url = $${paramCount}`);
        values.push(audioFile.path);
        paramCount++;
        updateFields.push(`audio_public_id = $${paramCount}`);
        values.push(audioFile.filename);
        paramCount++;
        updateFields.push(`file_size_bytes = $${paramCount}`);
        values.push(audioFile.size);
        paramCount++;
        if (audioFile.duration) {
          updateFields.push(`duration_seconds = $${paramCount}`);
          values.push(Math.round(audioFile.duration));
          paramCount++;
        }
      }

      // Handle thumbnail file update
      if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
        updateFields.push(`thumbnail_url = $${paramCount}`);
        values.push(req.files.thumbnail[0].path);
        paramCount++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No fields to update' });
      }

      values.push(id);
      const result = await client.query(
        `UPDATE episodes SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );
      await client.query('COMMIT');
      return res.json({ status: 'success', message: 'Episode updated successfully', data: { episode: result.rows[0] } });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Update episode error:', error);
      return res.status(500).json({ status: 'error', message: 'Error updating episode' });
    } finally {
      client.release();
    }
  },

  // Delete episode
  deleteEpisode: async (req, res, next) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const { id } = req.params;
      const episodeResult = await client.query('SELECT * FROM episodes WHERE id = $1', [id]);
      if (episodeResult.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Episode not found' });
      }
      const episode = episodeResult.rows[0];

      if (episode.audio_public_id) {
        await deleteFile(episode.audio_public_id, 'video').catch(console.error);
      }
      if (episode.thumbnail_url) {
        const thumbPublicId = episode.thumbnail_url.split('/').pop().split('.')[0];
        if (thumbPublicId) {
          await deleteFile(`pocket-fm/thumbnails/${thumbPublicId}`, 'image').catch(console.error);
        }
      }

      await client.query('DELETE FROM episodes WHERE id = $1', [id]);
      await client.query(
        `UPDATE series SET total_episodes = GREATEST(total_episodes - 1, 0), total_duration_seconds = GREATEST(total_duration_seconds - $1, 0) WHERE id = $2`,
        [episode.duration_seconds, episode.series_id]
      );
      await client.query('COMMIT');
      return res.json({ status: 'success', message: 'Episode deleted successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Delete episode error:', error);
      return res.status(500).json({ status: 'error', message: 'Error deleting episode' });
    } finally {
      client.release();
    }
  },

  // Chapters
  getChapters: async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await query(
        'SELECT * FROM chapters WHERE episode_id = $1 ORDER BY start_time_seconds ASC',
        [id]
      );
      return res.json({ status: 'success', data: { chapters: result.rows } });
    } catch (error) {
      console.error('Get chapters error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching chapters' });
    }
  },

  saveChapters: async (req, res, next) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const episodeId = req.params.id;
      const { chapters } = req.body;

      const epResult = await client.query(
        `SELECT e.id FROM episodes e JOIN series s ON e.series_id = s.id WHERE e.id = $1 AND s.creator_id = $2`,
        [episodeId, req.user.id]
      );
      if (epResult.rows.length === 0) {
        return res.status(403).json({ status: 'error', message: 'Not authorised or episode not found' });
      }

      await client.query('DELETE FROM chapters WHERE episode_id = $1', [episodeId]);

      // Chapters may have title and start_time_seconds – sanitise title
      for (const ch of chapters) {
        const chapterTitle = clean(ch.title);
        await client.query(
          `INSERT INTO chapters (episode_id, title, start_time_seconds, end_time_seconds)
           VALUES ($1, $2, $3, $4)`,
          [episodeId, chapterTitle, ch.start_time_seconds, ch.end_time_seconds || null]
        );
      }

      await client.query('COMMIT');
      return res.json({ status: 'success', message: 'Chapters saved' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Save chapters error:', error);
      return res.status(500).json({ status: 'error', message: 'Error saving chapters' });
    } finally {
      client.release();
    }
  }
};

module.exports = episodeController;
