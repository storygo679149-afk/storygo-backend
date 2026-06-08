// src/controllers/userController.js
const { query } = require('../config/database');
const { validationResult } = require('express-validator');

// ... your other methods (getProfile, updateProfile, etc.)

exports.becomeCreator = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Check current user
    const userCheck = await query(
      `SELECT id, role, is_creator FROM users WHERE id = $1`,
      [userId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    const user = userCheck.rows[0];

    // 2. Already a creator?
    if (user.role === 'creator' || user.is_creator === true) {
      return res.status(400).json({ status: 'error', message: 'You are already a creator' });
    }

    // 3. Update user
    await query(
      `UPDATE users 
       SET role = 'creator', is_creator = true, updated_at = NOW() 
       WHERE id = $1`,
      [userId]
    );

    // 4. Fetch updated user data
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
