const pool = require('../config/database');

class RankedCanvas {
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS ranked_canvas (
        ranked_canvas_id SERIAL PRIMARY KEY,
        torneo_id INTEGER NOT NULL REFERENCES torneo(torneo_id) ON DELETE CASCADE,
        division VARCHAR(100),
        canvas_key VARCHAR(120) NOT NULL,
        canvas_name VARCHAR(180) NOT NULL,
        canvas_order INTEGER NOT NULL DEFAULT 1,
        rounds_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        links_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await pool.query(query);

    await pool.query('ALTER TABLE ranked_canvas ADD COLUMN IF NOT EXISTS ranked_canvas_id SERIAL');
    await pool.query('ALTER TABLE ranked_canvas ADD COLUMN IF NOT EXISTS torneo_id INTEGER');
    await pool.query('ALTER TABLE ranked_canvas ADD COLUMN IF NOT EXISTS division VARCHAR(100)');
    await pool.query('ALTER TABLE ranked_canvas ADD COLUMN IF NOT EXISTS canvas_key VARCHAR(120)');
    await pool.query('ALTER TABLE ranked_canvas ADD COLUMN IF NOT EXISTS canvas_name VARCHAR(180)');
    await pool.query('ALTER TABLE ranked_canvas ADD COLUMN IF NOT EXISTS canvas_order INTEGER NOT NULL DEFAULT 1');
    await pool.query(`ALTER TABLE ranked_canvas ADD COLUMN IF NOT EXISTS rounds_json JSONB NOT NULL DEFAULT '[]'::jsonb`);
    await pool.query(`ALTER TABLE ranked_canvas ADD COLUMN IF NOT EXISTS links_json JSONB NOT NULL DEFAULT '[]'::jsonb`);
    await pool.query('ALTER TABLE ranked_canvas ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    await pool.query('ALTER TABLE ranked_canvas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ranked_canvas_torneo_division
      ON ranked_canvas(torneo_id, division)
    `);
  }

  static async findByTorneoAndDivision(torneoId, division = null) {
    const baseQuery = `
      SELECT
        ranked_canvas_id,
        torneo_id,
        division,
        canvas_key,
        canvas_name,
        canvas_order,
        rounds_json,
        links_json,
        created_at,
        updated_at
      FROM ranked_canvas
      WHERE torneo_id = $1
    `;

    const query = division == null || division === ''
      ? `${baseQuery} AND division IS NULL ORDER BY canvas_order, ranked_canvas_id`
      : `${baseQuery} AND division = $2 ORDER BY canvas_order, ranked_canvas_id`;

    const result = division == null || division === ''
      ? await pool.query(query, [torneoId])
      : await pool.query(query, [torneoId, division]);

    return result.rows.map((row) => ({
      id: row.canvas_key,
      name: row.canvas_name,
      rounds: Array.isArray(row.rounds_json) ? row.rounds_json : [],
      manualLinks: Array.isArray(row.links_json) ? row.links_json : [],
      order: Number(row.canvas_order) || 0
    }));
  }

  static async replaceForTorneoAndDivision(torneoId, division = null, canvases = []) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (division == null || division === '') {
        await client.query('DELETE FROM ranked_canvas WHERE torneo_id = $1 AND division IS NULL', [torneoId]);
      } else {
        await client.query('DELETE FROM ranked_canvas WHERE torneo_id = $1 AND division = $2', [torneoId, division]);
      }

      for (let index = 0; index < canvases.length; index += 1) {
        const canvas = canvases[index] || {};
        await client.query(
          `INSERT INTO ranked_canvas (
            torneo_id, division, canvas_key, canvas_name, canvas_order, rounds_json, links_json, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, CURRENT_TIMESTAMP)`,
          [
            Number(torneoId),
            division || null,
            String(canvas.id || `ranked-canvas-${index + 1}`),
            String(canvas.name || `Posición ${index + 1}`),
            index + 1,
            JSON.stringify(Array.isArray(canvas.rounds) ? canvas.rounds : []),
            JSON.stringify(Array.isArray(canvas.manualLinks) ? canvas.manualLinks : [])
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

module.exports = RankedCanvas;
