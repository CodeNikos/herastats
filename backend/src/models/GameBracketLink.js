const pool = require('../config/database');

class GameBracketLink {
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS game_bracket_links (
        link_id SERIAL PRIMARY KEY,
        torneo_id INTEGER NOT NULL REFERENCES torneo(torneo_id) ON DELETE CASCADE,
        division VARCHAR(100),
        from_game_id INTEGER NOT NULL REFERENCES game(game_id) ON DELETE CASCADE,
        to_game_id INTEGER NOT NULL REFERENCES game(game_id) ON DELETE CASCADE,
        to_slot VARCHAR(20) NOT NULL CHECK (to_slot IN ('local', 'visitor')),
        rule VARCHAR(20) NOT NULL DEFAULT 'winner',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await pool.query(query);
  }

  static async findByTorneoAndDivision(torneoId, division = null) {
    const baseQuery = `
      SELECT link_id, torneo_id, division, from_game_id, to_game_id, to_slot, rule, created_at, updated_at
      FROM game_bracket_links
      WHERE torneo_id = $1
    `;

    if (division == null || division === '') {
      const result = await pool.query(`${baseQuery} AND division IS NULL ORDER BY link_id`, [torneoId]);
      return result.rows;
    }

    const result = await pool.query(`${baseQuery} AND division = $2 ORDER BY link_id`, [torneoId, division]);
    return result.rows;
  }

  static async replaceForTorneoAndDivision(torneoId, division = null, links = []) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (division == null || division === '') {
        await client.query('DELETE FROM game_bracket_links WHERE torneo_id = $1 AND division IS NULL', [torneoId]);
      } else {
        await client.query('DELETE FROM game_bracket_links WHERE torneo_id = $1 AND division = $2', [torneoId, division]);
      }

      for (const link of links) {
        await client.query(
          `INSERT INTO game_bracket_links (torneo_id, division, from_game_id, to_game_id, to_slot, rule)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            torneoId,
            division || null,
            Number(link.from_game_id),
            Number(link.to_game_id),
            link.to_slot,
            link.rule || 'winner'
          ]
        );
      }

      await client.query('COMMIT');
      return this.findByTorneoAndDivision(torneoId, division);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = GameBracketLink;
