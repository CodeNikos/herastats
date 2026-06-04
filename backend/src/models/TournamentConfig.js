const pool = require('../config/database');

class TournamentConfig {

  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS torneo (
        torneo_id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        year INTEGER NOT NULL,
        country VARCHAR(255),
        location VARCHAR(255),
        image_url TEXT,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await pool.query(query);
    await pool.query('ALTER TABLE torneo DROP COLUMN IF EXISTS timeouts');
    await pool.query('ALTER TABLE torneo DROP COLUMN IF EXISTS timeout_dur');
  }

  static async create(configData) {
    try {
      const { name, year, country, location, image_url, created_by } = configData;
      
      const query = `
        INSERT INTO torneo (name, year, country, location, image_url, created_by) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING torneo_id, name, year, country, location, image_url, created_by, created_at
      `;
      const result = await pool.query(query, [name, year, country, location, image_url, created_by]);
      return result.rows[0];
    } catch (error) {
      console.error('Error en TournamentConfig.create:', error);
      throw error;
    }
  }

  static async findByUserEmail(userEmail) {
    try {
      const query = `
        SELECT t.torneo_id, t.name, t.year, t.country, t.location, t.image_url, t.created_by, t.created_at,
          (SELECT MIN(g.game_date) FROM game g WHERE g.torneo_id = t.torneo_id) AS first_game_date
        FROM torneo t
        WHERE t.created_by = $1 
        ORDER BY t.created_at DESC
      `;
      const result = await pool.query(query, [userEmail]);
      return result.rows;
    } catch (error) {
      console.error('Error en TournamentConfig.findByUserEmail:', error);
      throw error;
    }
  }

  /**
   * Obtener un torneo por ID (vista pública)
   */
  static async findById(torneoId) {
    try {
      const query = `
        SELECT torneo_id, name, year, country, location, image_url, created_by, created_at
        FROM torneo 
        WHERE torneo_id = $1
      `;
      const result = await pool.query(query, [torneoId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error en TournamentConfig.findById:', error);
      throw error;
    }
  }

  /**
   * Actualizar un torneo por ID
   */
  static async update(torneoId, configData) {
    try {
      const { name, year, country, location, image_url } = configData;
      const query = `
        UPDATE torneo 
        SET name = COALESCE($2, name), year = COALESCE($3, year), country = $4, location = $5,
            image_url = COALESCE($6, image_url)
        WHERE torneo_id = $1
        RETURNING torneo_id, name, year, country, location, image_url, created_by, created_at
      `;
      const result = await pool.query(query, [torneoId, name, year, country, location || country, image_url]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error en TournamentConfig.update:', error);
      throw error;
    }
  }

  /**
   * Obtener todos los torneos (para vista pública sin autenticación)
   */
  static async findAll() {
    try {
      const query = `
        SELECT t.torneo_id, t.name, t.year, t.country, t.location, t.image_url, t.created_by, t.created_at,
          (SELECT MIN(g.game_date) FROM game g WHERE g.torneo_id = t.torneo_id) AS first_game_date
        FROM torneo t
        ORDER BY t.created_at DESC
      `;
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error en TournamentConfig.findAll:', error);
      throw error;
    }
  }

  /**
   * Restablecer un torneo:
   * - Borra datos operativos relacionados (equipos, jugadores, juegos, eventos, brackets, encuestas).
   * - Limpia la configuración base del torneo dejándolo en estado inicial.
   */
  static async resetById(torneoId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT torneo_id, created_by
         FROM torneo
         WHERE torneo_id = $1`,
        [torneoId]
      );

      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      await client.query('DELETE FROM spirit_survey_response WHERE torneo_id = $1', [torneoId]);
      await client.query('DELETE FROM spirit_survey_invite WHERE torneo_id = $1', [torneoId]);
      await client.query('DELETE FROM game_events WHERE tourn_id = $1', [torneoId]);
      await client.query('DELETE FROM game_bracket_links WHERE torneo_id = $1', [torneoId]);
      await client.query('DELETE FROM ranked_canvas WHERE torneo_id = $1', [torneoId]);
      await client.query('DELETE FROM game WHERE torneo_id = $1', [torneoId]);
      await client.query('DELETE FROM player WHERE torneo_id = $1', [torneoId]);
      await client.query('DELETE FROM phases WHERE torneo_id = $1', [torneoId]);
      await client.query('DELETE FROM team WHERE torneo_id = $1', [torneoId]);

      const currentYear = new Date().getFullYear();
      const reset = await client.query(
        `UPDATE torneo
         SET
           name = '',
           year = $2,
           country = NULL,
           location = NULL,
           image_url = NULL
         WHERE torneo_id = $1
         RETURNING torneo_id, name, year, country, location, image_url, created_by, created_at`,
        [torneoId, currentYear]
      );

      await client.query('COMMIT');
      return reset.rows[0] || null;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error en TournamentConfig.resetById:', error);
      throw error;
    } finally {
      client.release();
    }
  }

}

module.exports = TournamentConfig;