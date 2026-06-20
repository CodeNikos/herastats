const pool = require('../config/database');

class Sport {
  static async createTable() {
    const createQuery = `
      CREATE TABLE IF NOT EXISTS sports (
        sport_id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        sport_desc VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    const alterDescQuery = `
      ALTER TABLE sports
      ADD COLUMN IF NOT EXISTS sport_desc VARCHAR(500)
    `;
    const alterCreatedAtQuery = `
      ALTER TABLE sports
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `;

    await pool.query(createQuery);
    await pool.query(alterDescQuery);
    await pool.query(alterCreatedAtQuery);
  }

  static async findById(sportId) {
    const query = `
      SELECT sport_id, name, sport_desc AS brief_description, created_at
      FROM sports
      WHERE sport_id = $1
    `;
    const result = await pool.query(query, [sportId]);
    return result.rows[0];
  }

  static async findAll() {
    const query = `
      SELECT sport_id, name, sport_desc AS brief_description, created_at
      FROM sports
      ORDER BY name ASC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  static async findByName(name) {
    const query = `
      SELECT sport_id, name, sport_desc AS brief_description, created_at
      FROM sports
      WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
      LIMIT 1
    `;
    const result = await pool.query(query, [name]);
    return result.rows[0];
  }

  static async create({ name, brief_description }) {
    const query = `
      INSERT INTO sports (name, sport_desc)
      VALUES ($1, $2)
      RETURNING sport_id, name, sport_desc AS brief_description, created_at
    `;
    const result = await pool.query(query, [name, brief_description || null]);
    return result.rows[0];
  }
}

module.exports = Sport;
