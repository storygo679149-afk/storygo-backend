const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const environment = require('../config/environment');

const authController = {
  // ---------- SIGNUP ----------
  signup: async (req, res) => {
    try {
      const { username, email, password, full_name } = req.body;

      // Detailed validation
      const errors = [];
      if (!username || username.trim().length < 3) {
        errors.push({ field: 'username', message: 'Username must be at least 3 characters' });
      } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        errors.push({ field: 'username', message: 'Username can only contain letters, numbers, and underscores' });
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ field: 'email', message: 'Valid email is required' });
      }
      if (!password || password.length < 6) {
        errors.push({ field: 'password', message: 'Password must be at least 6 characters' });
      }
      if (!full_name || full_name.trim().length < 2) {
        errors.push({ field: 'full_name', message: 'Full name is required' });
      }

      if (errors.length > 0) {
        return res.status(422).json({
          status: 'error',
          message: 'Validation failed',
          errors
        });
      }

      // Check existing user
      const existing = await query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [email.trim(), username.trim()]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({
          status: 'error',
          message: 'User with this email or username already exists'
        });
      }

      // Hash password
      const saltRounds = 12;
      const password_hash = await bcrypt.hash(password, saltRounds);

      // Create user
      const result = await query(
        `INSERT INTO users (username, email, password_hash, full_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id, username, email, full_name, is_creator, is_admin, is_premium, created_at`,
        [username.trim(), email.trim(), password_hash, full_name.trim()]
      );

      const user = result.rows[0];

      // Generate JWT
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        environment.JWT_SECRET,
        { expiresIn: environment.JWT_EXPIRE }
      );

      // Set cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: environment.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      return res.status(201).json({
        status: 'success',
        message: 'Account created successfully',
        data: { user, token }
      });
    } catch (error) {
      console.error('Signup error:', error);
      return res.status(500).json({ status: 'error', message: 'Error creating account' });
    }
  },

  // ---------- LOGIN ----------
  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      // Validation
      if (!email || !password) {
        return res.status(422).json({
          status: 'error',
          message: 'Email and password are required'
        });
      }

      const result = await query(
        `SELECT id, username, email, full_name, profile_picture, password_hash,
                is_creator, is_admin, is_active, is_premium
         FROM users
         WHERE email = $1 AND is_active = true`,
        [email.trim()]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
      }

      const user = result.rows[0];
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
      }

      // Update last login (fire and forget)
      query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]).catch(console.error);

      // Log admin login (fire and forget)
      if (user.is_admin) {
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || req.ip;
        query(
          `INSERT INTO admin_audit_logs (admin_id, action, ip_address)
           VALUES ($1, $2, $3)`,
          [user.id, 'Admin login', ip]
        ).catch(console.error);
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        environment.JWT_SECRET,
        { expiresIn: environment.JWT_EXPIRE }
      );

      // Remove password_hash from response
      const { password_hash, ...userWithoutPassword } = user;

      res.cookie('token', token, {
  httpOnly: true,
  secure: true,           // must be true for sameSite: none
  sameSite: 'none',       // ← allows cross-origin
  maxAge: 7 * 24 * 60 * 60 * 1000
});

      return res.json({
        status: 'success',
        message: 'Login successful',
        data: { user: userWithoutPassword, token }
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ status: 'error', message: 'Error logging in' });
    }
  },

  // ---------- GET CURRENT USER ----------
  getMe: async (req, res) => {
    try {
      const result = await query(
        `SELECT id, username, email, full_name, profile_picture,
                is_creator, is_admin, creator_bio, preferred_language,
                created_at, last_login_at
         FROM users
         WHERE id = $1 AND is_active = true`,
        [req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      return res.json({ status: 'success', data: { user: result.rows[0] } });
    } catch (error) {
      console.error('Get me error:', error);
      return res.status(500).json({ status: 'error', message: 'Error fetching user data' });
    }
  },

  // ---------- LOGOUT ----------
  logout: async (req, res) => {
    try {
      res.clearCookie('token', {
        httpOnly: true,
        secure: environment.NODE_ENV === 'production',
        sameSite: 'strict'
      });
      return res.json({ status: 'success', message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      return res.status(500).json({ status: 'error', message: 'Error logging out' });
    }
  },

  // ---------- UPDATE PROFILE ----------
  updateProfile: async (req, res) => {
    try {
      const userId = req.user.id;
      const updateFields = [];
      const values = [];
      let paramCount = 1;

      if (req.body.full_name) {
        updateFields.push(`full_name = $${paramCount}`);
        values.push(req.body.full_name.trim());
        paramCount++;
      }
      if (req.body.preferred_language) {
        updateFields.push(`preferred_language = $${paramCount}`);
        values.push(req.body.preferred_language);
        paramCount++;
      }
      if (req.body.creator_bio !== undefined && req.user.is_creator) {
        updateFields.push(`creator_bio = $${paramCount}`);
        values.push(req.body.creator_bio);
        paramCount++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No fields to update' });
      }

      values.push(userId);
      const result = await query(
        `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramCount}
         RETURNING id, username, email, full_name, profile_picture, is_creator, preferred_language`,
        values
      );
      return res.json({ status: 'success', message: 'Profile updated successfully', data: { user: result.rows[0] } });
    } catch (error) {
      console.error('Update profile error:', error);
      return res.status(500).json({ status: 'error', message: 'Error updating profile' });
    }
  },

  // ---------- CHANGE PASSWORD ----------
  changePassword: async (req, res) => {
    try {
      const { current_password, new_password } = req.body;
      const userId = req.user.id;

      if (!current_password || !new_password || new_password.length < 6) {
        return res.status(422).json({ status: 'error', message: 'Invalid password data' });
      }

      const result = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      const isValid = await bcrypt.compare(current_password, result.rows[0].password_hash);
      if (!isValid) {
        return res.status(401).json({ status: 'error', message: 'Current password is incorrect' });
      }

      const newHash = await bcrypt.hash(new_password, 12);
      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
      return res.json({ status: 'success', message: 'Password changed successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      return res.status(500).json({ status: 'error', message: 'Error changing password' });
    }
  }
};

module.exports = authController;
