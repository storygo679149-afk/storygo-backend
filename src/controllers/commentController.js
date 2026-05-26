const { query } = require('../config/database');
const { clean } = require('../utils/sanitize');

const commentController = {
  // GET all comments for an episode (with user info, nested replies)
  getComments: async (req, res, next) => {
    try {
      const episodeId = req.params.id;
      const { page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      const commentsResult = await query(
        `SELECT c.id, c.body, c.parent_id, c.created_at,
                u.id as user_id, u.username, u.full_name, u.profile_picture
         FROM comments c
         JOIN users u ON c.user_id = u.id
         WHERE c.episode_id = $1 AND c.parent_id IS NULL AND c.is_active = true
         ORDER BY c.created_at ASC
         LIMIT $2 OFFSET $3`,
        [episodeId, limit, offset]
      );

      for (let comment of commentsResult.rows) {
        const replies = await query(
          `SELECT c.id, c.body, c.parent_id, c.created_at,
                  u.id as user_id, u.username, u.full_name, u.profile_picture
           FROM comments c
           JOIN users u ON c.user_id = u.id
           WHERE c.parent_id = $1 AND c.is_active = true
           ORDER BY c.created_at ASC`,
          [comment.id]
        );
        comment.replies = replies.rows;
      }

      const countResult = await query(
        `SELECT COUNT(*) FROM comments WHERE episode_id = $1 AND parent_id IS NULL AND is_active = true`,
        [episodeId]
      );

      return res.json({
        status: 'success',
        data: {
          comments: commentsResult.rows,
          pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(countResult.rows[0].count) }
        }
      });
    } catch (error) {
      console.error('Get comments error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching comments' });
    }
  },

  // POST a new comment
  createComment: async (req, res, next) => {
    try {
      const episodeId = req.params.id;
      const parent_id = req.body.parent_id || null;
      const userId = req.user.id;

      // ---------- SANITISE ----------
      const body = clean(req.body.body);

      if (!body || body.trim().length === 0) {
        return res.status(422).json({ status: 'error', message: 'Comment body cannot be empty' });
      }

      const episodeCheck = await query('SELECT id FROM episodes WHERE id = $1', [episodeId]);
      if (episodeCheck.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Episode not found' });
      }

      if (parent_id) {
        const parentCheck = await query('SELECT id FROM comments WHERE id = $1 AND episode_id = $2', [parent_id, episodeId]);
        if (parentCheck.rows.length === 0) {
          return res.status(400).json({ status: 'error', message: 'Parent comment not found' });
        }
      }

      const result = await query(
        `INSERT INTO comments (user_id, episode_id, parent_id, body)
         VALUES ($1, $2, $3, $4)
         RETURNING id, body, parent_id, created_at`,
        [userId, episodeId, parent_id, body.trim()]
      );

      const userResult = await query(
        'SELECT id, username, full_name, profile_picture FROM users WHERE id = $1',
        [userId]
      );

      const comment = {
        ...result.rows[0],
        user_id: userResult.rows[0].id,
        username: userResult.rows[0].username,
        full_name: userResult.rows[0].full_name,
        profile_picture: userResult.rows[0].profile_picture,
        replies: []
      };

      return res.status(201).json({ status: 'success', data: { comment } });
    } catch (error) {
      console.error('Create comment error:', error);
      return res.status(500).json({ status: 'error', message: 'Error creating comment' });
    }
  },

  // DELETE a comment (owner or admin)
  deleteComment: async (req, res, next) => {
    try {
      const commentId = req.params.commentId;
      const userId = req.user.id;

      const commentResult = await query('SELECT user_id FROM comments WHERE id = $1', [commentId]);
      if (commentResult.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Comment not found' });
      }

      if (commentResult.rows[0].user_id !== userId) {
        return res.status(403).json({ status: 'error', message: 'You can only delete your own comments' });
      }

      await query('UPDATE comments SET is_active = false WHERE id = $1', [commentId]);

      return res.json({ status: 'success', message: 'Comment deleted' });
    } catch (error) {
      console.error('Delete comment error:', error);
      return res.status(500).json({ status: 'error', message: 'Error deleting comment' });
    }
  }
};

module.exports = commentController;