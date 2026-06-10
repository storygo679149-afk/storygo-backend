const { query } = require('../config/database');

exports.getActiveContests = async (req, res) => {
  try {
    const now = new Date();
    const result = await query(`
      SELECT * FROM contests
      WHERE status = 'active' AND start_date <= NOW() AND end_date >= NOW()
      ORDER BY end_date ASC
    `);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.getPastContests = async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM contests
      WHERE status IN ('ended', 'active') AND end_date < NOW()
      ORDER BY end_date DESC
    `);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.getContestDetails = async (req, res) => {
  const { id } = req.params;
  try {
    const contest = await query('SELECT * FROM contests WHERE id = $1', [id]);
    if (contest.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Contest not found' });
    // Check if user already submitted
    let hasSubmitted = false;
    if (req.user) {
      const submission = await query('SELECT id FROM contest_submissions WHERE contest_id = $1 AND creator_id = $2', [id, req.user.id]);
      hasSubmitted = submission.rows.length > 0;
    }
    res.json({ status: 'success', data: { ...contest.rows[0], hasSubmitted } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.submitStory = async (req, res) => {
  const { id } = req.params;
  const { title, story, cover_image_url } = req.body;
  const userId = req.user.id;
  try {
    // Check if contest is still open
    const contest = await query('SELECT end_date FROM contests WHERE id = $1', [id]);
    if (contest.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Contest not found' });
    if (new Date(contest.rows[0].end_date) < new Date()) {
      return res.status(400).json({ status: 'error', message: 'Contest has ended' });
    }
    await query(`
      INSERT INTO contest_submissions (contest_id, creator_id, title, story, cover_image_url)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (contest_id, creator_id) DO UPDATE
      SET title = EXCLUDED.title, story = EXCLUDED.story, cover_image_url = EXCLUDED.cover_image_url, updated_at = NOW()
    `, [id, userId, title, story, cover_image_url]);
    res.json({ status: 'success', message: 'Story submitted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.getMySubmission = async (req, res) => {
  const { id } = req.params;
  try {
    const submission = await query(`
      SELECT * FROM contest_submissions
      WHERE contest_id = $1 AND creator_id = $2
    `, [id, req.user.id]);
    res.json({ status: 'success', data: submission.rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.getResults = async (req, res) => {
  const { id } = req.params;
  try {
    const contest = await query('SELECT * FROM contests WHERE id = $1', [id]);
    if (contest.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Contest not found' });
    const winners = await query(`
      SELECT cs.*, u.username, u.full_name
      FROM contest_submissions cs
      JOIN users u ON cs.creator_id = u.id
      WHERE cs.contest_id = $1 AND cs.admin_rating IS NOT NULL
      ORDER BY cs.admin_rating DESC
      LIMIT 3
    `, [id]);
    res.json({ status: 'success', data: { contest: contest.rows[0], winners: winners.rows } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
