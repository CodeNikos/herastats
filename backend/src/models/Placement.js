const pool = require('../config/database');
const Game = require('./Game');

/** Puesto final (1–32) a partir del slot de posicionamiento del partido (0 = Final, 1 = 3.º–4.º, …). */
function finalRankFromBracketSlot(slot, isWinner) {
  const s = Number(slot);
  if (!Number.isInteger(s) || s < 0 || s > 15) return null;
  if (s === 0) return isWinner ? 1 : 2;
  return isWinner ? s * 2 + 1 : s * 2 + 2;
}

function isFinishedEstado(estado) {
  const s = String(estado ?? '')
    .trim()
    .toLowerCase();
  return s === 'finished' || s === 'finalizado' || s === 'completed';
}

class Placement {
  static async ensureSchema() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS placements (
        placement_id SERIAL PRIMARY KEY,
        torneo_id INTEGER NOT NULL REFERENCES torneo(torneo_id) ON DELETE CASCADE,
        placement_number INTEGER NOT NULL,
        team_name VARCHAR(255) NOT NULL,
        division VARCHAR(255) NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (torneo_id, placement_number, division)
      )
    `);
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_placements_torneo ON placements (torneo_id, placement_number)'
    );
  }

  /**
   * Posiciones desde partidos de posicionamiento (Ranked o Main) ya finalizados con `placement_number`.
   */
  static async deriveFromFinishedGames(torneoId) {
    const tid = Number(torneoId);
    if (!Number.isFinite(tid) || tid <= 0) return [];

    const q = `
      SELECT
        g.game_id,
        g.placement_number,
        g.division,
        g.canvas_bracket,
        g.estado,
        g."local" AS local_id,
        g.visitor AS visitor_id,
        g.local_score,
        g.visitor_score,
        tl.name AS local_name,
        tv.name AS visitor_name,
        tl.url_imagen AS local_image,
        tv.url_imagen AS visitor_image
      FROM game g
      LEFT JOIN team tl ON tl.team_id = g."local"
      LEFT JOIN team tv ON tv.team_id = g.visitor
      WHERE g.torneo_id = $1
        AND g.placement_number IS NOT NULL
        AND g.placement_number >= 0
        AND g.placement_number <= 15
      ORDER BY
        CASE WHEN LOWER(TRIM(COALESCE(g.canvas_bracket, ''))) = 'ranked' THEN 0 ELSE 1 END,
        g.game_id DESC
    `;
    const result = await pool.query(q, [tid]);

    /** @type {Map<string, { placement_number: number, team_name: string, division: string, team_id: number|null, team_image: string|null }>} */
    const byKey = new Map();

    for (const row of result.rows || []) {
      if (!isFinishedEstado(row.estado)) continue;

      const localScore = Game.parseScoreIntForPlayoffWl(row.local_score);
      const visitorScore = Game.parseScoreIntForPlayoffWl(row.visitor_score);
      if (!Number.isFinite(localScore) || !Number.isFinite(visitorScore) || localScore === visitorScore) {
        continue;
      }

      const localWins = localScore > visitorScore;
      const slot = Number(row.placement_number);
      const division = String(row.division ?? '').trim() || 'Sin division';

      const winner = localWins
        ? {
            teamId: row.local_id,
            name: row.local_name,
            image: row.local_image,
            rank: finalRankFromBracketSlot(slot, true)
          }
        : {
            teamId: row.visitor_id,
            name: row.visitor_name,
            image: row.visitor_image,
            rank: finalRankFromBracketSlot(slot, true)
          };

      const loser = localWins
        ? {
            teamId: row.visitor_id,
            name: row.visitor_name,
            image: row.visitor_image,
            rank: finalRankFromBracketSlot(slot, false)
          }
        : {
            teamId: row.local_id,
            name: row.local_name,
            image: row.local_image,
            rank: finalRankFromBracketSlot(slot, false)
          };

      for (const entry of [winner, loser]) {
        if (entry.rank == null || !entry.name) continue;
        const key = `${entry.rank}::${division.toLowerCase()}`;
        if (byKey.has(key)) continue;
        byKey.set(key, {
          placement_number: entry.rank,
          team_name: String(entry.name).trim(),
          division,
          team_id: entry.teamId != null ? Number(entry.teamId) : null,
          team_image: entry.image != null ? String(entry.image).trim() : null
        });
      }
    }

    return [...byKey.values()].sort((a, b) => {
      if (a.placement_number !== b.placement_number) return a.placement_number - b.placement_number;
      return a.division.localeCompare(b.division, 'es');
    });
  }

  static async readStoredPlacements(torneoId) {
    const tid = Number(torneoId);
    if (!Number.isFinite(tid) || tid <= 0) return [];

    const q = `
      SELECT
        p.placement_number,
        p.team_name,
        p.division,
        MAX(t.team_id)::int AS team_id,
        MAX(t.url_imagen) AS team_image
      FROM placements p
      LEFT JOIN team t
        ON t.torneo_id = p.torneo_id
       AND LOWER(TRIM(t.name)) = LOWER(TRIM(p.team_name))
       AND (
         LOWER(TRIM(COALESCE(t.division, ''))) = LOWER(TRIM(COALESCE(p.division, '')))
         OR TRIM(COALESCE(p.division, '')) = ''
       )
      WHERE p.torneo_id = $1
      GROUP BY p.placement_number, p.team_name, p.division
      ORDER BY p.placement_number ASC, p.division ASC
    `;
    const result = await pool.query(q, [tid]);
    return result.rows.map((row) => ({
      placement_number: Number(row.placement_number),
      team_name: String(row.team_name ?? '').trim(),
      division: String(row.division ?? '').trim(),
      team_id: row.team_id != null ? Number(row.team_id) : null,
      team_image: row.team_image != null ? String(row.team_image).trim() : null
    }));
  }

  /**
   * Posiciones finales por categoría.
   * Prioriza filas persistidas en `placements`; si no hay, deriva de partidos Ranked/Main finalizados.
   * @returns {Promise<Array<{ placement_number: number, team_name: string, division: string, team_id: number|null, team_image: string|null }>>}
   */
  static async findByTorneoId(torneoId) {
    await this.ensureSchema();

    const stored = await this.readStoredPlacements(torneoId);
    if (stored.length > 0) return stored;

    return this.deriveFromFinishedGames(torneoId);
  }
}

module.exports = Placement;
