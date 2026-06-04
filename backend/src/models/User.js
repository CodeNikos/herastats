const pool = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  static async createTable() {
    const createQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'anotador',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    const alterQuery = `
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'anotador'
    `;
    const alterNameQuery = `
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS name VARCHAR(255)
    `;
    const alterLnameQuery = `
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS lname VARCHAR(255)
    `;

    await pool.query(createQuery);
    await pool.query(alterQuery);
    await pool.query(alterNameQuery);
    await pool.query(alterLnameQuery);
  }

  static async findByEmail(email) {
    try {
      const query = 'SELECT * FROM users WHERE email = $1';
      const result = await pool.query(query, [email]);
      return result.rows[0];
    } catch (error) {
      console.error('Error en User.findByEmail:', error);
      throw error;
    }
  }

  static async findById(id) {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async create(userData) {
    try {
      const { email, password, role = 'anotador' } = userData;
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const query = `
        INSERT INTO users (email, password, role) 
        VALUES ($1, $2, $3) 
        RETURNING id, email, role, name, lname, created_at
      `;
      const result = await pool.query(query, [email, hashedPassword, role]);
      return result.rows[0];
    } catch (error) {
      console.error('Error en User.create:', error);
      throw error;
    }
  }

  static async countAll() {
    const query = 'SELECT COUNT(*)::int AS total FROM users';
    const result = await pool.query(query);
    return result.rows[0]?.total || 0;
  }

  static async listAll() {
    const query = `
      SELECT id, email, role, name, lname, created_at
      FROM users
      ORDER BY created_at ASC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  static async updateProfile(id, { name, lname }) {
    const query = `
      UPDATE users
      SET name = $2, lname = $3
      WHERE id = $1
      RETURNING id, email, role, name, lname, created_at
    `;
    const result = await pool.query(query, [id, name || null, lname || null]);
    return result.rows[0];
  }

  static async updateRole(id, role) {
    const query = `
      UPDATE users
      SET role = $2
      WHERE id = $1
      RETURNING id, email, role, name, lname, created_at
    `;
    const result = await pool.query(query, [id, role]);
    return result.rows[0];
  }

  static async updatePassword(id, hashedPassword) {
    const query = `
      UPDATE users
      SET password = $2
      WHERE id = $1
      RETURNING id, email, role, name, lname, created_at
    `;
    const result = await pool.query(query, [id, hashedPassword]);
    return result.rows[0];
  }

  static async deleteById(id) {
    const query = `
      DELETE FROM users
      WHERE id = $1
      RETURNING id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async validatePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }
}

module.exports = User;
