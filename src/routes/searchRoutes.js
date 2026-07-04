const { query } = require('../config/database');

const searchController = {
  // Search series and episodes with duration filter
  search: async (req, res, next) => {
    try {
      const { q, type = 'all', page = 1, limit = 20, category, language, sort, duration } = req.query;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;
      const userId = req.user?.id;

      if (!q || q.trim().length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Search query is required'
        });
      }

      const tsQuery = q.trim();
      const searchTerm = `%${q.trim()}%`;

      let results = { series: [], episodes: [] };
      let totalCount = 0;
      const filters = [];

      // --- SERIES SEARCH (duration doesn't apply to series, but we respect other filters) ---
      if (type === 'all' || type === 'series') {
        let whereSeries = `s.is_active = true
          AND to_tsvector('english', COALESCE(s.title,'') || ' ' || COALESCE(s.description,'') || ' ' || 
              COALESCE(s.author_name,'') || ' ' || COALESCE(s.narrator_name,''))
              @@ plainto_tsquery('english', $1)`;
        const seriesParams = [tsQuery];
        let paramIdx = 2;

        if (category) {
          whereSeries += ` AND s.category_id = $${paramIdx}`;
          seriesParams.push(category);
          paramIdx++;
        }
        if (language) {
          whereSeries += ` AND s.language = $${paramIdx}`;
          seriesParams.push(language);
          paramIdx++;
        }

        let orderSeries = 'rank DESC, s.play_count DESC';
        if (sort === 'latest') orderSeries = 's.created_at DESC';
        else if (sort === 'popular') orderSeries = 's.play_count DESC';
        else if (sort === 'rating') orderSeries = 's.average_rating DESC';

        // Count
        const countRes = await query(
          `SELECT COUNT(*) FROM series s WHERE ${whereSeries}`,
          seriesParams
        );
        totalCount += parseInt(countRes.rows[0].count);

        // Series data
        seriesParams.push(limitNum, offset);
        const seriesRes = await query(
          `SELECT s.*,
                  u.username as creator_username,
                  u.full_name as creator_name,
                  c.name as category_name,
                  ts_rank(to_tsvector('english', COALESCE(s.title,'') || ' ' || COALESCE(s.description,'') || ' ' ||
                         COALESCE(s.author_name,'') || ' ' || COALESCE(s.narrator_name,'')),
                         plainto_tsquery('english', $1)) as rank
           FROM series s
           JOIN users u ON s.creator_id = u.id
           LEFT JOIN categories c ON s.category_id = c.id
           WHERE ${whereSeries}
           ORDER BY ${orderSeries}
           LIMIT $${seriesParams.length - 1} OFFSET $${seriesParams.length}`,
          seriesParams
        );
        results.series = seriesRes.rows;
      }

      // --- EPISODE SEARCH (with duration filter) ---
      if (type === 'all' || type === 'episodes') {
        let whereEp = `e.is_active = true AND s.is_active = true
          AND to_tsvector('english', COALESCE(e.title,'') || ' ' || COALESCE(e.description,''))
              @@ plainto_tsquery('english', $1)`;
        const epParams = [tsQuery];
        let eIdx = 2;

        if (category) {
          whereEp += ` AND s.category_id = $${eIdx}`;
          epParams.push(category);
          eIdx++;
        }
        if (language) {
          whereEp += ` AND s.language = $${eIdx}`;
          epParams.push(language);
          eIdx++;
        }

        // Duration filter
        if (duration) {
          switch (duration) {
            case 'short':
              whereEp += ` AND e.duration_seconds < 900`;  // 15 min
              break;
            case 'medium':
              whereEp += ` AND e.duration_seconds BETWEEN 900 AND 1800`;
              break;
            case 'long':
              whereEp += ` AND e.duration_seconds BETWEEN 1800 AND 3600`;
              break;
            case 'verylong':
              whereEp += ` AND e.duration_seconds > 3600`;
              break;
          }
        }

        let orderEp = 'rank DESC, e.play_count DESC';
        if (sort === 'latest') orderEp = 'e.publish_date DESC';
        else if (sort === 'popular') orderEp = 'e.play_count DESC';
        else if (sort === 'rating') orderEp = 's.average_rating DESC';

        // Count
        const countRes = await query(
          `SELECT COUNT(*) FROM episodes e JOIN series s ON e.series_id = s.id WHERE ${whereEp}`,
          epParams
        );
        totalCount += parseInt(countRes.rows[0].count);

        // Episodes data
        epParams.push(limitNum, offset);
        const epRes = await query(
          `SELECT e.*, s.title as series_title, s.thumbnail_url as series_thumbnail,
                  ts_rank(to_tsvector('english', COALESCE(e.title,'') || ' ' || COALESCE(e.description,'')),
                         plainto_tsquery('english', $1)) as rank
           FROM episodes e
           JOIN series s ON e.series_id = s.id
           WHERE ${whereEp}
           ORDER BY ${orderEp}
           LIMIT $${epParams.length - 1} OFFSET $${epParams.length}`,
          epParams
        );
        results.episodes = epRes.rows;
      }

      // Save search history if authenticated
      if (userId) {
        await query(
          `INSERT INTO search_history (user_id, search_query, results_count)
           VALUES ($1, $2, $3)`,
          [userId, q.trim(), totalCount]
        );
      }

      return res.json({
        status: 'success',
        data: {
          query: q.trim(),
          results,
          total: totalCount,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: totalCount,
            pages: Math.ceil(totalCount / limitNum)
          }
        }
      });
    } catch (error) {
      console.error('Search error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error performing search'
      });
    }
  },

  // Get search suggestions
  getSuggestions: async (req, res, next) => {
    try {
      const { q, limit = 10 } = req.query;
      if (!q || q.trim().length < 2) {
        return res.json({ status: 'success', data: { suggestions: [] } });
      }
      const searchTerm = `%${q.trim()}%`;
      const result = await query(
        `SELECT DISTINCT title, 'series' as type, id, thumbnail_url
         FROM series
         WHERE is_active = true AND title ILIKE $1
         UNION
         SELECT DISTINCT e.title, 'episode' as type, e.id, s.thumbnail_url
         FROM episodes e
         JOIN series s ON e.series_id = s.id
         WHERE e.is_active = true AND e.title ILIKE $1
         LIMIT $2`,
        [searchTerm, limit]
      );
      return res.json({ status: 'success', data: { suggestions: result.rows } });
    } catch (error) {
      console.error('Get suggestions error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching suggestions' });
    }
  },

  // Get popular searches
  getPopularSearches: async (req, res, next) => {
    try {
      const result = await query(
        `SELECT search_query, COUNT(*) as search_count
         FROM search_history
         WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
         GROUP BY search_query
         ORDER BY search_count DESC
         LIMIT 10`
      );
      return res.json({ status: 'success', data: { popular: result.rows } });
    } catch (error) {
      console.error('Get popular searches error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching popular searches' });
    }
  }
};

module.exports = searchController;
