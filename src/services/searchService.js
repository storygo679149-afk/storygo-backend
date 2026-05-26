const { query } = require('../config/database');

class SearchService {
  // Perform full-text search
  static async search(query_text, { type = 'all', page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    const searchTerm = `%${query_text}%`;
    const tsQuery = query_text.split(' ').filter(w => w.length > 0).join(' & ');

    let results = {
      series: [],
      episodes: [],
      total: 0
    };

    // Search series
    if (type === 'all' || type === 'series') {
      const seriesResult = await query(
        `SELECT s.*, 
                u.username as creator_username,
                u.full_name as creator_name,
                ts_rank(to_tsvector('english', COALESCE(s.title, '') || ' ' || COALESCE(s.description, '')), 
                        to_tsquery('english', $1)) as relevance
         FROM series s
         JOIN users u ON s.creator_id = u.id
         WHERE s.is_active = true
           AND to_tsvector('english', COALESCE(s.title, '') || ' ' || 
               COALESCE(s.description, '') || ' ' || 
               COALESCE(s.author_name, '') || ' ' || 
               COALESCE(s.narrator_name, '')) @@ to_tsquery('english', $1)
         ORDER BY relevance DESC, s.play_count DESC
         LIMIT $2 OFFSET $3`,
        [tsQuery, limit, offset]
      );
      results.series = seriesResult.rows;
    }

    // Search episodes
    if (type === 'all' || type === 'episodes') {
      const episodesResult = await query(
        `SELECT e.*, s.title as series_title,
                ts_rank(to_tsvector('english', COALESCE(e.title, '') || ' ' || COALESCE(e.description, '')), 
                        to_tsquery('english', $1)) as relevance
         FROM episodes e
         JOIN series s ON e.series_id = s.id
         WHERE e.is_active = true AND s.is_active = true
           AND to_tsvector('english', COALESCE(e.title, '') || ' ' || COALESCE(e.description, '')) @@ to_tsquery('english', $1)
         ORDER BY relevance DESC, e.play_count DESC
         LIMIT $2 OFFSET $3`,
        [tsQuery, limit, offset]
      );
      results.episodes = episodesResult.rows;
    }

    results.total = results.series.length + results.episodes.length;

    return results;
  }

  // Get search suggestions
  static async getSuggestions(query_text, limit = 10) {
    const searchTerm = `%${query_text}%`;
    
    const result = await query(
      `SELECT DISTINCT title, 'series' as type, id, thumbnail_url, play_count
       FROM series
       WHERE is_active = true AND title ILIKE $1
       ORDER BY play_count DESC
       LIMIT $2`,
      [searchTerm, limit]
    );

    return result.rows;
  }

  // Log search query
  static async logSearch(userId, searchQuery, resultsCount) {
    if (userId) {
      await query(
        `INSERT INTO search_history (user_id, search_query, results_count)
         VALUES ($1, $2, $3)`,
        [userId, searchQuery, resultsCount]
      );
    }
  }
}

module.exports = SearchService;