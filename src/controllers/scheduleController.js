const { query } = require('../config/database');

// GET all scheduled releases with episode details
exports.getAllSchedules = async (req, res) => {
  try {
    const result = await query(`
      SELECT es.*, e.title AS episode_title, e.episode_number,
             s.title AS series_title
      FROM episode_schedules es
      JOIN episodes e ON es.episode_id = e.id
      JOIN series s ON e.series_id = s.id
      ORDER BY es.scheduled_at ASC
    `);
    res.json({ status: 'success', data: { schedules: result.rows } });
  } catch (err) {
    console.error('Get schedules error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to load schedules' });
  }
};

// POST create new schedule
exports.createSchedule = async (req, res) => {
  const { episode_id, scheduled_at } = req.body;
  if (!episode_id || !scheduled_at) {
    return res.status(422).json({ status: 'error', message: 'Episode ID and scheduled time are required' });
  }

  try {
    const result = await query(
      `INSERT INTO episode_schedules (episode_id, scheduled_at)
       VALUES ($1, $2) RETURNING *`,
      [episode_id, scheduled_at]
    );
    res.status(201).json({ status: 'success', data: { schedule: result.rows[0] } });
  } catch (err) {
    console.error('Create schedule error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to create schedule' });
  }
};

// DELETE a schedule
exports.deleteSchedule = async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM episode_schedules WHERE id = $1', [id]);
    res.json({ status: 'success', message: 'Schedule deleted' });
  } catch (err) {
    console.error('Delete schedule error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to delete schedule' });
  }
};

// (Internal) Publish episodes that are due
exports.publishDueEpisodes = async () => {
  try {
    const now = new Date().toISOString();
    const dueResult = await query(`
      UPDATE episode_schedules
      SET is_published = true
      WHERE is_published = false AND scheduled_at <= $1
      RETURNING episode_id, id
    `, [now]);

    if (dueResult.rows.length > 0) {
      for (const row of dueResult.rows) {
        await query(
          `UPDATE episodes SET is_active = true, publish_date = NOW() WHERE id = $1`,
          [row.episode_id]
        );
        console.log(`Published episode ${row.episode_id} via schedule`);
      }
    }
  } catch (err) {
    console.error('Scheduler error:', err);
  }
};