// src/controllers/userController.js
const { query } = require('../config/database');
const { validationResult } = require('express-validator');
// const { deleteFile } = require('../utils/fileUpload'); // REMOVED – not used
// const environment = require('../config/environment'); // REMOVED – not used

// ─────────────────────────────────────────────────────────────────
// Public routes
// ─────────────────────────────────────────────────────────────────

exports.getGlobalStats = async (req, res) => {
  try {
    // Try to use `status` column if it exists
    const result = await query(`
      SELECT 
        (SELECT COUNT(*) FROM series WHERE status = 'published') as total_series,
        (SELECT COUNT(*) FROM users WHERE is_creator = true) as total_creators,
        (SELECT COUNT(*) FROM episodes) as total_episodes,
        (SELECT COUNT(*) FROM users) as total_users
    `);
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    // Fallback: ignore `status` column (count all series)
    console.warn('⚠️ Status column missing – using fallback query');
    const fallback = await query(`
      SELECT 
        (SELECT COUNT(*) FROM series) as total_series,
        (SELECT COUNT(*) FROM users WHERE is_creator = true) as total_creators,
        (SELECT COUNT(*) FROM episodes) as total_episodes,
        (SELECT COUNT(*) FROM users) as total_users
    `);
    res.status(200).json({ status: 'success', data: fallback.rows[0] });
  }
};

exports.getTopCreators = async (req, res) => {
  try {
    const result = await query(`
      SELECT id, username, full_name, profile_picture, 
             (SELECT COUNT(*) FROM followers WHERE following_id = u.id) as followers_count
      FROM users u
      WHERE is_creator = true AND is_active = true
      ORDER BY followers_count DESC
      LIMIT 10
    `);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('Top creators error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────
// Authenticated user routes
// ─────────────────────────────────────────────────────────────────

exports.getProfile = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, username, email, full_name, role, is_creator, is_admin, 
              profile_picture, preferred_language, creator_bio, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    res.status(200).json({ status: 'success', data: { user: result.rows[0] } });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.updateProfile = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: 'error', errors: errors.array() });
  }
  try {
    const { full_name, preferred_language, creator_bio } = req.body;
    await query(
      `UPDATE users 
       SET full_name = COALESCE($1, full_name),
           preferred_language = COALESCE($2, preferred_language),
           creator_bio = COALESCE($3, creator_bio),
           updated_at = NOW()
       WHERE id = $4`,
      [full_name, preferred_language, creator_bio, req.user.id]
    );
    res.status(200).json({ status: 'success', message: 'Profile updated' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// ✅ BECOME CREATOR
exports.becomeCreator = async (req, res) => {
  try {
    const userId = req.user.id;

    const userCheck = await query(
      `SELECT id, role, is_creator FROM users WHERE id = $1`,
      [userId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    const user = userCheck.rows[0];

    if (user.role === 'creator' || user.is_creator === true) {
      return res.status(400).json({ status: 'error', message: 'You are already a creator' });
    }

    await query(
      `UPDATE users 
       SET role = 'creator', is_creator = true, updated_at = NOW() 
       WHERE id = $1`,
      [userId]
    );

    const updatedUser = await query(
      `SELECT id, username, email, full_name, role, is_creator, is_admin, profile_picture 
       FROM users WHERE id = $1`,
      [userId]
    );

    return res.status(200).json({
      status: 'success',
      message: 'Congratulations! You are now a creator.',
      data: { user: updatedUser.rows[0] }
    });
  } catch (error) {
    console.error('Become creator error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Server error. Please try again later.'
    });
  }
};

// ─────────────────────────────────────────────────────────────────
// Listening history, bookmarks, etc.
// ─────────────────────────────────────────────────────────────────

exports.getListeningHistory = async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM listening_history WHERE user_id = $1 ORDER BY listened_at DESC`,
      [req.user.id]
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('Listening history error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.getBookmarks = async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM bookmarks WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('Bookmarks error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.getBookmarkedSeries = async (req, res) => {
  try {
    const result = await query(
      `SELECT s.* FROM series s
       JOIN bookmarks b ON b.series_id = s.id
       WHERE b.user_id = $1`,
      [req.user.id]
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('Bookmarked series error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.getFollowing = async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.full_name, u.profile_picture
       FROM followers f
       JOIN users u ON u.id = f.following_id
       WHERE f.follower_id = $1`,
      [req.user.id]
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.followCreator = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: 'error', errors: errors.array() });
  }
  try {
    const creatorId = req.params.id;
    await query(
      `INSERT INTO followers (follower_id, following_id, created_at)
       VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
      [req.user.id, creatorId]
    );
    res.status(200).json({ status: 'success', message: 'Followed successfully' });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.unfollowCreator = async (req, res) => {
  try {
    const creatorId = req.params.id;
    await query(
      `DELETE FROM followers WHERE follower_id = $1 AND following_id = $2`,
      [req.user.id, creatorId]
    );
    res.status(200).json({ status: 'success', message: 'Unfollowed successfully' });
  } catch (error) {
    console.error('Unfollow error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.getUserStats = async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        (SELECT COUNT(*) FROM listening_history WHERE user_id = $1) as total_listens,
        (SELECT COUNT(*) FROM bookmarks WHERE user_id = $1) as total_bookmarks,
        (SELECT COUNT(*) FROM followers WHERE follower_id = $1) as following_count,
        (SELECT COUNT(*) FROM followers WHERE following_id = $1) as followers_count
      `,
      [req.user.id]
    );
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('User stats error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.getFollowers = async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.full_name, u.profile_picture
       FROM followers f
       JOIN users u ON u.id = f.follower_id
       WHERE f.following_id = $1`,
      [req.user.id]
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.getCreatorAnalytics = async (req, res) => {
  if (!req.user.is_creator) {
    return res.status(403).json({ status: 'error', message: 'Creator access required' });
  }
  try {
    const result = await query(
      `SELECT 
        (SELECT COUNT(*) FROM episodes WHERE series_id IN (SELECT id FROM series WHERE creator_id = $1)) as total_episodes,
        (SELECT COUNT(*) FROM series WHERE creator_id = $1) as total_series,
        (SELECT COUNT(*) FROM followers WHERE following_id = $1) as total_followers
      `,
      [req.user.id]
    );
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('Creator analytics error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.getCreatorStats = async (req, res) => {
  return exports.getCreatorAnalytics(req, res);
};

// ─────────────────────────────────────────────────────────────────
// Avatar upload / removal (Cloudinary)
// ─────────────────────────────────────────────────────────────────

exports.uploadAvatar = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ status: 'error', message: 'No file uploaded' });
  }
  try {
    const avatarUrl = req.file.path; // Cloudinary URL
    await query(
      `UPDATE users SET profile_picture = $1, updated_at = NOW() WHERE id = $2`,
      [avatarUrl, req.user.id]
    );
    res.status(200).json({ status: 'success', message: 'Avatar uploaded', data: { url: avatarUrl } });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

exports.removeAvatar = async (req, res) => {
  try {
    await query(
      `UPDATE users SET profile_picture = NULL, updated_at = NOW() WHERE id = $1`,
      [req.user.id]
    );
    res.status(200).json({ status: 'success', message: 'Avatar removed' });
  } catch (error) {
    console.error('Remove avatar error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────
// Change password
// ─────────────────────────────────────────────────────────────────

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ status: 'error', message: 'Both current and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ status: 'error', message: 'Password must be at least 6 characters' });
  }
  try {
    const bcrypt = require('bcryptjs');
    const userResult = await query(`SELECT password_hash FROM users WHERE id = $1`, [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ status: 'error', message: 'Current password is incorrect' });
    }
    const newHash = await bcrypt.hash(newPassword, 10);
    await query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [newHash, req.user.id]);
    res.status(200).json({ status: 'success', message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
