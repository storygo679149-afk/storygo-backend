const { query } = require('../config/database');
const { logAdminAction } = require('./adminController'); // reuse helper

exports.createContest = async (req, res) => {
  const { title, description, theme, start_date, end_date, background_image_url } = req.body;
  try {
    const result = await query(`
      INSERT INTO contests (title, description, theme, start_date, end_date, background_image_url, created_by, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
      RETURNING *
    `, [title, description, theme, start_date, end_date, background_image_url, req.user.id]);
    await logAdminAction(req.user.id, 'create_contest', 'contest', result.rows[0].id, { title }, req.ip);
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('Create contest error:', err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.getContests = async (req, res) => {
  try {
    const result = await query('SELECT * FROM contests ORDER BY created_at DESC');
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.getContest = async (req, res) => {
  const { id } = req.params;
  try {
    const contest = await query('SELECT * FROM contests WHERE id = $1', [id]);
    if (contest.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Contest not found' });
    res.json({ status: 'success', data: contest.rows[0] });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.updateContest = async (req, res) => {
  const { id } = req.params;
  const { title, description, theme, start_date, end_date, background_image_url, status } = req.body;
  try {
    await query(`
      UPDATE contests SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        theme = COALESCE($3, theme),
        start_date = COALESCE($4, start_date),
        end_date = COALESCE($5, end_date),
        background_image_url = COALESCE($6, background_image_url),
        status = COALESCE($7, status),
        updated_at = NOW()
      WHERE id = $8
    `, [title, description, theme, start_date, end_date, background_image_url, status, id]);
    await logAdminAction(req.user.id, 'update_contest', 'contest', id, { title }, req.ip);
    res.json({ status: 'success', message: 'Contest updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.deleteContest = async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM contests WHERE id = $1', [id]);
    await logAdminAction(req.user.id, 'delete_contest', 'contest', id, {}, req.ip);
    res.json({ status: 'success', message: 'Contest deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.getSubmissionsForContest = async (req, res) => {
  const { id } = req.params;
  try {
    const submissions = await query(`
      SELECT cs.*, u.username, u.full_name
      FROM contest_submissions cs
      JOIN users u ON cs.creator_id = u.id
      WHERE cs.contest_id = $1
      ORDER BY cs.admin_rating DESC NULLS LAST, cs.created_at
    `, [id]);
    res.json({ status: 'success', data: submissions.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.rateSubmission = async (req, res) => {
  const { contestId, submissionId } = req.params;
  const { rating, notes } = req.body;
  try {
    await query(`
      UPDATE contest_submissions
      SET admin_rating = $1, admin_notes = $2, updated_at = NOW()
      WHERE id = $3 AND contest_id = $4
    `, [rating, notes, submissionId, contestId]);
    await logAdminAction(req.user.id, 'rate_submission', 'contest_submission', submissionId, { rating }, req.ip);
    res.json({ status: 'success', message: 'Submission rated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.determineWinner = async (req, res) => {
  const { id } = req.params;
  try {
    const submissions = await query(`
      SELECT id, creator_id, admin_rating
      FROM contest_submissions
      WHERE contest_id = $1 AND admin_rating IS NOT NULL
      ORDER BY admin_rating DESC
      LIMIT 1
    `, [id]);
    if (submissions.rows.length === 0) return res.json({ status: 'success', winner: null });
    const winner = submissions.rows[0];
    // Optionally mark contest as ended
    await query('UPDATE contests SET status = $1 WHERE id = $2', ['ended', id]);
    res.json({ status: 'success', winner });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
