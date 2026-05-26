const { query } = require('../config/database');

class UserModel {
  static async findById(id) {
    const result = await query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async findByEmail(email) {
    const result = await query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  }

  static async findByUsername(username) {
    const result = await query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    return result.rows[0];
  }

  static async create(userData) {
    const { username, email, password_hash, full_name } = userData;
    const result = await query(
      `INSERT INTO users (username, email, password_hash, full_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, full_name, is_creator, preferred_language, created_at`,
      [username, email, password_hash, full_name]
    );
    return result.rows[0];
  }

  static async update(id, updateData) {
    const fields = Object.keys(updateData);
    const values = Object.values(updateData);
    
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    values.push(id);

    const result = await query(
      `UPDATE users SET ${setClause} WHERE id = $${values.length}
       RETURNING id, username, email, full_name, profile_picture, is_creator, preferred_language`,
      values
    );
    return result.rows[0];
  }
}

module.exports = UserModel;