const pool = require('../config/database');

/** Etiqueta UI → phase_num en BD */
const STAGE_TO_PHASE_NUM = {
  Groups: 1,
  Playoffs: 2,
  Semifinals: 3,
  Final: 4
};

class Phase {

  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS phases (
        phas_id SERIAL PRIMARY KEY,
        torneo_id INTEGER NOT NULL REFERENCES torneo(torneo_id) ON DELETE CASCADE,
        stage VARCHAR(255),
        duration VARCHAR(255),
        goal_limit INTEGER,
        phase_num INTEGER
      )
    `;
    await pool.query(query);
    await pool.query('ALTER TABLE phases ADD COLUMN IF NOT EXISTS phase_num INTEGER');
  }

  static resolvePhaseNum(stage, explicitNum) {
    const n = explicitNum != null && explicitNum !== '' ? parseInt(explicitNum, 10) : NaN;
    if (Number.isInteger(n) && n >= 1 && n <= 4) return n;
    const key = String(stage || '').trim();
    return STAGE_TO_PHASE_NUM[key] ?? null;
  }

  /**
   * Sincronizar fases: actualiza por phas_id si la fase ya existe en el torneo;
   * inserta filas nuevas sin phas_id; elimina del torneo las fases que ya no vienen en la lista.
   */
  static async replaceByTorneoId(torneoId, phases) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const list = Array.isArray(phases) ? phases : [];
      const keptIds = [];

      for (const p of list) {
        const rawId = p.phas_id;
        const phasId =
          rawId != null && rawId !== ''
            ? parseInt(rawId, 10)
            : null;
        const stage = p.stage || null;
        const duration =
          p.duration != null && p.duration !== '' ? String(p.duration) : null;
        const goalLimit =
          p.goal_limit != null && p.goal_limit !== ''
            ? parseInt(p.goal_limit, 10)
            : null;
        const phaseNum = Phase.resolvePhaseNum(stage, p.phase_num);

        let updated = false;
        if (phasId != null && Number.isInteger(phasId)) {
          const up = await client.query(
            `UPDATE phases
             SET stage = $2, duration = $3, goal_limit = $4, phase_num = $5
             WHERE phas_id = $1 AND torneo_id = $6`,
            [phasId, stage, duration, goalLimit, phaseNum, torneoId]
          );
          if (up.rowCount > 0) {
            keptIds.push(phasId);
            updated = true;
          }
        }

        if (!updated) {
          const ins = await client.query(
            `INSERT INTO phases (torneo_id, stage, duration, goal_limit, phase_num)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING phas_id`,
            [torneoId, stage, duration, goalLimit, phaseNum]
          );
          keptIds.push(Number(ins.rows[0].phas_id));
        }
      }

      if (keptIds.length > 0) {
        await client.query(
          `DELETE FROM phases
           WHERE torneo_id = $1
             AND NOT (phas_id = ANY($2::int[]))`,
          [torneoId, keptIds]
        );
      } else {
        await client.query('DELETE FROM phases WHERE torneo_id = $1', [torneoId]);
      }

      await client.query('COMMIT');
      return await Phase.findByTorneoId(torneoId);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error en Phase.replaceByTorneoId:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtener todas las fases de un torneo
   */
  static async findByTorneoId(torneoId) {
    try {
      const query = `
        SELECT phas_id, torneo_id, stage, duration, goal_limit, phase_num
        FROM phases
        WHERE torneo_id = $1
        ORDER BY phase_num NULLS LAST, phas_id
      `;
      const result = await pool.query(query, [torneoId]);
      return result.rows;
    } catch (error) {
      console.error('Error en Phase.findByTorneoId:', error);
      throw error;
    }
  }
}

module.exports = Phase;