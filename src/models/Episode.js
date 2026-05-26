const { query } = require('../config/database');

class EpisodeModel {
  static async findBySeries(seriesId, { page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;
    const result = await query(
      `SELECT * FROM episodes 
       WHERE series_id = $1 AND is_active = true
       ORDER BY season_number ASC, episode_number ASC
       LIMIT $2 OFFSET $3`,
      [seriesId, limit, offset]
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await query(
      `SELECT e.*, s.title as series_title, s.creator_id
       FROM episodes e
       JOIN series s ON e.series_id = s.id
       WHERE e.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async create(episodeData) {
    const { series_id, title, description, audio_url, audio_public_id, 
            duration_seconds, file_size_bytes, episode_number, season_number } = episodeData;
    
    const result = await query(
      `INSERT INTO episodes (series_id, title, description, audio_url, audio_public_id,
                            duration_seconds, file_size_bytes, episode_number, season_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [series_id, title, description, audio_url, audio_public_id,
       duration_seconds, file_size_bytes, episode_number, season_number || 1]
    );
    return result.rows[0];
  }

  static async update(id, updateData) {
    const fields = Object.keys(updateData);
    const values = Object.values(updateData);
    
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    values.push(id);

    const result = await query(
      `UPDATE episodes SET ${setClause} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async delete(id) {
    await query('DELETE FROM episodes WHERE id = $1', [id]);
    return true;
  }

  static async incrementPlayCount(id) {
    await query(
      'UPDATE episodes SET play_count = play_count + 1 WHERE id = $1',
      [id]
    );
  }
}

module.exports = EpisodeModel;