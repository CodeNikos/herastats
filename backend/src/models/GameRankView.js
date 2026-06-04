const pool = require('../config/database');

/**
 * Misma información que espera GamePages (player_id → goals / assists),
 * pero agregando desde game_events cuando no existe la vista Game_Rank_V en PostgreSQL.
 */
async function aggregateFromGameEvents(gameId) {
  const gid = Number(gameId);
  if (!Number.isFinite(gid) || gid <= 0) {
    return [];
  }

  const result = await pool.query(
    `SELECT
       e.player_id,
       COALESCE(SUM(e.goals), 0)::int AS goals,
       COALESCE(SUM(e.assists), 0)::int AS assists
     FROM game_events e
     WHERE e.game_id = $1
       AND e.player_id IS NOT NULL
       AND UPPER(TRIM(e.event_type)) IN ('GOAL', 'AST')
     GROUP BY e.player_id
     ORDER BY
       (COALESCE(SUM(e.goals), 0) + COALESCE(SUM(e.assists), 0)) DESC NULLS LAST,
       e.player_id ASC`,
    [gid]
  );
  return result.rows;
}

/**
 * Filas tipo Game_Rank_V por partido.
 * Primero intenta la vista legacy (nombres variados); si no existe la relación,
 * usa agregados desde game_events (alineado con anotación en vivo).
 */
async function findByGameId(gameId) {
  const gid = Number(gameId);
  if (!Number.isFinite(gid) || gid <= 0) {
    return [];
  }

  const attempts = [
    { sql: 'SELECT * FROM "Game_Rank_V" WHERE "Game_ID" = $1', params: [gid] },
    { sql: 'SELECT * FROM game_rank_v WHERE game_id = $1', params: [gid] },
    { sql: 'SELECT * FROM "Game_Rank_V" WHERE game_id = $1', params: [gid] }
  ];

  let lastErr;
  for (const { sql, params } of attempts) {
    try {
      const result = await pool.query(sql, params);
      return result.rows;
    } catch (e) {
      lastErr = e;
      if (e.code === '42P01' || e.code === '42703') {
        continue;
      }
      throw e;
    }
  }

  const missing =
    lastErr && (lastErr.code === '42P01' || String(lastErr.message || '').includes('does not exist'));
  if (missing || !lastErr) {
    try {
      return await aggregateFromGameEvents(gid);
    } catch (aggErr) {
      throw aggErr;
    }
  }

  throw lastErr || new Error('No se pudo consultar la vista Game_Rank_V');
}

module.exports = {
  findByGameId,
  aggregateFromGameEvents
};
