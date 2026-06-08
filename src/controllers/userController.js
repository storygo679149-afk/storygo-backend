// src/controllers/userController.js

const { pool } = require('../config/database');

// Become a creator – updates user role to 'creator'
exports.becomeCreator = async (req, res) => {
  try {
    const userId = req.user.id; // assumes you have auth middleware that sets req.user

    // Check if user already a creator
    const userCheck = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [userId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const currentRole = userCheck.rows[0].role;
    if (currentRole === 'creator' || currentRole === 'admin') {
      return res.status(400).json({ success: false, message: 'You are already a creator' });
    }

    // Update role
    await pool.query(
      'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2',
      ['creator', userId]
    );

    // Fetch updated user data
    const updatedUser = await pool.query(
      'SELECT id, email, username, full_name, role, is_verified, profile_picture FROM users WHERE id = $1',
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: 'Congratulations! You are now a creator.',
      user: updatedUser.rows[0]
    });
  } catch (error) {
    console.error('Become creator error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};
