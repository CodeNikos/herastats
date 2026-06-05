const pool = require('../config/database');

class TournamentMember {
  static async createTable() {
    const createQuery = `
      CREATE TABLE IF NOT EXISTS tournament_members (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        torneo_id INTEGER NOT NULL REFERENCES torneo(torneo_id) ON DELETE CASCADE,
        invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, torneo_id)
      )
    `;
    await pool.query(createQuery);
    await this.backfillFromTournamentOwners();
  }

  static async backfillFromTournamentOwners() {
    try {
      await pool.query(`
        INSERT INTO tournament_members (user_id, torneo_id, invited_by)
        SELECT u.id, t.torneo_id, NULL
        FROM torneo t
        INNER JOIN users u ON LOWER(u.email) = LOWER(t.created_by)
        WHERE t.created_by IS NOT NULL AND TRIM(t.created_by) <> ''
        ON CONFLICT (user_id, torneo_id) DO NOTHING
      `);
    } catch (error) {
      console.warn('TournamentMember.backfillFromTournamentOwners:', error.message);
    }
  }

  static async hasAccess(userId, torneoId) {
    const uid = Number(userId);
    const tid = Number(torneoId);
    if (!Number.isInteger(uid) || uid <= 0 || !Number.isInteger(tid) || tid <= 0) {
      return false;
    }
    const result = await pool.query(
      `SELECT 1 FROM tournament_members WHERE user_id = $1 AND torneo_id = $2 LIMIT 1`,
      [uid, tid]
    );
    return result.rows.length > 0;
  }

  static async add({ userId, torneoId, invitedBy = null }) {
    const result = await pool.query(
      `
        INSERT INTO tournament_members (user_id, torneo_id, invited_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, torneo_id) DO NOTHING
        RETURNING id, user_id, torneo_id, invited_by, created_at
      `,
      [userId, torneoId, invitedBy]
    );
    return result.rows[0] || null;
  }

  static async remove(userId, torneoId) {
    const result = await pool.query(
      `
        DELETE FROM tournament_members
        WHERE user_id = $1 AND torneo_id = $2
        RETURNING id
      `,
      [userId, torneoId]
    );
    return result.rows[0] || null;
  }

  static async findByUserId(userId) {
    const result = await pool.query(
      `
        SELECT tm.id, tm.user_id, tm.torneo_id, tm.invited_by, tm.created_at,
               t.name AS tournament_name, t.year AS tournament_year
        FROM tournament_members tm
        INNER JOIN torneo t ON t.torneo_id = tm.torneo_id
        WHERE tm.user_id = $1
        ORDER BY tm.created_at DESC
      `,
      [userId]
    );
    return result.rows;
  }

  static async findByTournamentId(torneoId) {
    const result = await pool.query(
      `
        SELECT tm.id, tm.user_id, tm.torneo_id, tm.invited_by, tm.created_at,
               u.email, u.role, u.name, u.lname
        FROM tournament_members tm
        INNER JOIN users u ON u.id = tm.user_id
        WHERE tm.torneo_id = $1
        ORDER BY tm.created_at ASC
      `,
      [torneoId]
    );
    return result.rows;
  }
}

module.exports = TournamentMember;
