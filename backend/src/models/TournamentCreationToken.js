const pool = require('../config/database');

class TournamentCreationToken {
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS tournament_creation_tokens (
        token_id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(64) NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'available',
        source VARCHAR(20) NOT NULL DEFAULT 'manual',
        assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        used_at TIMESTAMP,
        torneo_id INTEGER REFERENCES torneo(torneo_id) ON DELETE SET NULL
      )
    `;
    await pool.query(query);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tournament_creation_tokens_user_status
      ON tournament_creation_tokens (user_id, status)
    `);
  }

  static normalizeTokenValue(token) {
    return String(token || '').trim();
  }

  static async findByToken(token) {
    const normalized = this.normalizeTokenValue(token);
    if (!normalized) return null;
    const result = await pool.query(
      `SELECT token_id, user_id, token, status, source, assigned_by, assigned_at, used_at, torneo_id
       FROM tournament_creation_tokens
       WHERE token = $1`,
      [normalized]
    );
    return result.rows[0];
  }

  static async findById(tokenId) {
    const result = await pool.query(
      `SELECT token_id, user_id, token, status, source, assigned_by, assigned_at, used_at, torneo_id
       FROM tournament_creation_tokens
       WHERE token_id = $1`,
      [tokenId]
    );
    return result.rows[0];
  }

  static async assign({ userId, token, assignedBy, source = 'manual' }) {
    const normalized = this.normalizeTokenValue(token);
    const query = `
      INSERT INTO tournament_creation_tokens (user_id, token, assigned_by, source)
      VALUES ($1, $2, $3, $4)
      RETURNING token_id, user_id, token, status, source, assigned_by, assigned_at, used_at, torneo_id
    `;
    const result = await pool.query(query, [userId, normalized, assignedBy, source]);
    return result.rows[0];
  }

  static async hasAvailableForUser(userId) {
    const result = await pool.query(
      `SELECT 1
       FROM tournament_creation_tokens
       WHERE user_id = $1 AND status = 'available'
       LIMIT 1`,
      [userId]
    );
    return result.rows.length > 0;
  }

  static async consumeOldestAvailable({ userId, torneoId }) {
    const query = `
      UPDATE tournament_creation_tokens
      SET status = 'used', used_at = CURRENT_TIMESTAMP, torneo_id = $2
      WHERE token_id = (
        SELECT token_id
        FROM tournament_creation_tokens
        WHERE user_id = $1 AND status = 'available'
        ORDER BY assigned_at ASC
        LIMIT 1
        FOR UPDATE
      )
      RETURNING token_id, user_id, token, status, source, assigned_by, assigned_at, used_at, torneo_id
    `;
    const result = await pool.query(query, [userId, torneoId]);
    return result.rows[0];
  }

  static async listByUserId(userId) {
    const result = await pool.query(
      `SELECT token_id, user_id, token, status, source, assigned_by, assigned_at, used_at, torneo_id
       FROM tournament_creation_tokens
       WHERE user_id = $1
       ORDER BY assigned_at DESC`,
      [userId]
    );
    return result.rows;
  }

  static async listByUserIds(userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return [];
    }
    const result = await pool.query(
      `SELECT token_id, user_id, token, status, source, assigned_by, assigned_at, used_at, torneo_id
       FROM tournament_creation_tokens
       WHERE user_id = ANY($1::int[])
       ORDER BY assigned_at DESC`,
      [userIds]
    );
    return result.rows;
  }

  static async updateAvailableToken(tokenId, newToken) {
    const normalized = this.normalizeTokenValue(newToken);
    const query = `
      UPDATE tournament_creation_tokens
      SET token = $2
      WHERE token_id = $1 AND status = 'available'
      RETURNING token_id, user_id, token, status, source, assigned_by, assigned_at, used_at, torneo_id
    `;
    const result = await pool.query(query, [tokenId, normalized]);
    return result.rows[0];
  }

  static async revokeAvailableToken(tokenId) {
    const query = `
      DELETE FROM tournament_creation_tokens
      WHERE token_id = $1 AND status = 'available'
      RETURNING token_id, user_id, token, status
    `;
    const result = await pool.query(query, [tokenId]);
    return result.rows[0];
  }

  static async countAvailableByUserIds(userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return new Map();
    }
    const result = await pool.query(
      `SELECT user_id, COUNT(*)::int AS available_count
       FROM tournament_creation_tokens
       WHERE user_id = ANY($1::int[]) AND status = 'available'
       GROUP BY user_id`,
      [userIds]
    );
    const map = new Map();
    for (const row of result.rows) {
      map.set(row.user_id, row.available_count);
    }
    return map;
  }
}

module.exports = TournamentCreationToken;
