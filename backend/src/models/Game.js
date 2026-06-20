const pool = require('../config/database');
const Phase = require('./Phase');

/**
 * Modelo de persistencia del partido (tabla `game`, API GET/PUT/PATCH en `config`).
 * La pantalla de detalle es la SPA en `/game` (`frontend/src/pages/GamePages.js`); la navegación
 * de vuelta al calendario u otras rutas se define en el frontend, no en este módulo Node.
 * Encuesta de espíritu: deshabilitada para torneos con sport_id = {@link Game.FOOTBALL_SPORT_ID} (fútbol).
 */
class Game {
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS game (
        game_id SERIAL PRIMARY KEY,
        torneo_id INTEGER NOT NULL REFERENCES torneo(torneo_id) ON DELETE CASCADE,
        game_num INTEGER,
        game_date DATE NOT NULL,
        game_time TIME NOT NULL,
        game_location VARCHAR(255),
        division VARCHAR(100),
        phas_id INTEGER NOT NULL REFERENCES phases(phas_id) ON DELETE CASCADE,
        visitor INTEGER REFERENCES team(team_id) ON DELETE RESTRICT,
        "local" INTEGER REFERENCES team(team_id) ON DELETE RESTRICT,
        bracket_order INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await pool.query(query);

    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS game_id SERIAL');
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS torneo_id INTEGER');
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS game_num INTEGER');
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS game_date DATE');
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS game_time TIME');
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS game_location VARCHAR(255)');
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS division VARCHAR(100)');
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS phas_id INTEGER');
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS visitor INTEGER');
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS "local" INTEGER');
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS bracket_order INTEGER');
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS canvas_bracket VARCHAR(32)');
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS placement VARCHAR(255)');
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS placement_number INTEGER');
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS visitor_score VARCHAR(64)');
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS local_score VARCHAR(64)');
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS estado VARCHAR(255)');
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    await pool.query(`ALTER TABLE game ALTER COLUMN estado SET DEFAULT 'Upcoming'`).catch(() => {});
    await pool.query('ALTER TABLE game ALTER COLUMN visitor DROP NOT NULL');
    await pool.query('ALTER TABLE game ALTER COLUMN "local" DROP NOT NULL');
    await pool.query(
      "ALTER TABLE game ADD COLUMN IF NOT EXISTS mix_ratio_first VARCHAR(16)"
    );
    await pool.query(
      "ALTER TABLE game ADD COLUMN IF NOT EXISTS stats_slot_local VARCHAR(64)"
    );
    await pool.query(
      "ALTER TABLE game ADD COLUMN IF NOT EXISTS stats_slot_visitor VARCHAR(64)"
    );
    await pool.query(
      'ALTER TABLE game ADD COLUMN IF NOT EXISTS team_standings_recorded BOOLEAN NOT NULL DEFAULT FALSE'
    );
    await pool.query(
      'ALTER TABLE game ADD COLUMN IF NOT EXISTS live_clock_elapsed_sec INTEGER'
    );
    await pool.query('ALTER TABLE game ADD COLUMN IF NOT EXISTS phas_num INTEGER');
    await pool.query(
      'ALTER TABLE game ADD COLUMN IF NOT EXISTS ps_game_upd_done BOOLEAN NOT NULL DEFAULT FALSE'
    );
    await pool.query(`
      UPDATE game g
      SET torneo_id = p.torneo_id
      FROM phases p
      WHERE g.phas_id = p.phas_id
        AND g.torneo_id IS NULL
    `);
    await pool.query(`
      UPDATE game g
      SET phas_num = p.phase_num
      FROM phases p
      WHERE g.phas_id = p.phas_id
        AND g.phas_num IS NULL
        AND p.phase_num IS NOT NULL
    `);
  }

  /**
   * phase_num de la fase (1=Groups … 4=Final) para persistir en game.phas_num.
   * @param {number|string} phasId
   * @param {number|string|null} explicitNum opcional desde el cliente
   */
  static async resolvePhasNumFromPhaseId(phasId, explicitNum = null) {
    const fromBody = explicitNum != null && explicitNum !== '' ? parseInt(explicitNum, 10) : NaN;
    if (Number.isInteger(fromBody) && fromBody >= 1 && fromBody <= 4) return fromBody;

    const pid = parseInt(phasId, 10);
    if (!Number.isInteger(pid)) return null;

    const r = await pool.query(
      'SELECT phase_num, stage FROM phases WHERE phas_id = $1',
      [pid]
    );
    const row = r.rows[0];
    if (!row) return null;
    if (row.phase_num != null && row.phase_num !== '') {
      const n = Number(row.phase_num);
      if (Number.isInteger(n) && n >= 1) return n;
    }
    return Phase.resolvePhaseNum(row.stage, null);
  }

  static async findByTorneoId(torneoId) {
    const query = `
      SELECT
        g.game_id,
        g.torneo_id,
        g.game_num,
        g.game_date,
        g.game_time,
        g.game_location,
        g.division,
        g.phas_id,
        g.phas_num,
        p.stage AS phase_name,
        p.phase_num AS phase_num_from_phase,
        g.bracket_order,
        g.canvas_bracket,
        g.placement,
        g.placement_number,
        g.stats_slot_local,
        g.stats_slot_visitor,
        g.visitor,
        vt.name AS visitor_name,
        vt.url_imagen AS visitor_image,
        g."local",
        lt.name AS local_name,
        lt.url_imagen AS local_image,
        g.visitor_score,
        g.local_score,
        g.estado,
        g.mix_ratio_first,
        g.live_clock_elapsed_sec,
        g.created_at
      FROM game g
      INNER JOIN phases p ON p.phas_id = g.phas_id
      LEFT JOIN team vt ON vt.team_id = g.visitor
      LEFT JOIN team lt ON lt.team_id = g."local"
      WHERE g.torneo_id = $1
      ORDER BY
        g.game_num NULLS LAST,
        g.bracket_order NULLS LAST,
        g.game_id
    `;
    const result = await pool.query(query, [torneoId]);
    return result.rows;
  }

  static async findById(gameId) {
    const query = `
      SELECT
        g.game_id,
        g.torneo_id,
        g.game_num,
        g.game_date,
        g.game_time,
        g.game_location,
        g.division,
        g.phas_id,
        g.phas_num,
        p.stage AS phase_name,
        p.phase_num AS phase_num_from_phase,
        g.bracket_order,
        g.canvas_bracket,
        g.placement,
        g.placement_number,
        g.stats_slot_local,
        g.stats_slot_visitor,
        g.visitor,
        vt.name AS visitor_name,
        vt.url_imagen AS visitor_image,
        g."local",
        lt.name AS local_name,
        lt.url_imagen AS local_image,
        g.visitor_score,
        g.local_score,
        g.estado,
        g.mix_ratio_first,
        g.live_clock_elapsed_sec,
        g.created_at
      FROM game g
      INNER JOIN phases p ON p.phas_id = g.phas_id
      LEFT JOIN team vt ON vt.team_id = g.visitor
      LEFT JOIN team lt ON lt.team_id = g."local"
      WHERE g.game_id = $1
    `;
    const result = await pool.query(query, [gameId]);
    return result.rows[0] || null;
  }

  static async create(gameData) {
    const {
      torneo_id,
      game_num,
      game_date,
      game_time,
      game_location,
      division,
      phas_id,
      phas_num: phasNumBody,
      visitor,
      local,
      bracket_order,
      canvas_bracket,
      placement,
      placement_number,
      stats_slot_local,
      stats_slot_visitor,
      visitor_score,
      local_score,
      estado
    } = gameData;
    const resolvedPhasNum = await Game.resolvePhasNumFromPhaseId(phas_id, phasNumBody);
    const normStatsSlot = (v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      if (s === '') return null;
      return s.length > 64 ? s.slice(0, 64) : s;
    };
    const query = `
      INSERT INTO game (torneo_id, game_num, game_date, game_time, game_location, division, phas_id, phas_num, visitor, "local", bracket_order, canvas_bracket, placement, placement_number, visitor_score, local_score, estado, stats_slot_local, stats_slot_visitor)
      VALUES (
        $1,
        COALESCE(
          $2,
          (
            SELECT COALESCE(MAX(g2.game_num), 0) + 1
            FROM game g2
            WHERE g2.torneo_id = $1
          )
        ),
        $3, $4, $5, $6, $7, $8, $9, $10, $11,
        COALESCE($12, 'Main'),
        $13,
        $14,
        $15,
        $16,
        $17,
        $18,
        $19
      )
      RETURNING game_id
    `;
    const normScore = (v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s === '' ? null : s;
    };
    /** INSERT con NULL anula el DEFAULT de PostgreSQL; sin estado explícito usar Upcoming. */
    const normEstadoCreate = (v) => {
      if (v === undefined || v === null) return 'Upcoming';
      const s = String(v).trim();
      return s === '' ? 'Upcoming' : s;
    };
    const result = await pool.query(query, [
      torneo_id,
      game_num ?? null,
      game_date,
      game_time,
      game_location || null,
      division || null,
      phas_id,
      resolvedPhasNum,
      visitor ?? null,
      local ?? null,
      bracket_order ?? null,
      canvas_bracket != null && String(canvas_bracket).trim() !== '' ? String(canvas_bracket).trim() : null,
      placement != null && String(placement).trim() !== '' ? String(placement) : null,
      placement_number != null && placement_number !== '' && Number.isInteger(Number(placement_number))
        ? Number(placement_number)
        : null,
      normScore(visitor_score),
      normScore(local_score),
      normEstadoCreate(estado),
      normStatsSlot(stats_slot_local),
      normStatsSlot(stats_slot_visitor)
    ]);
    return this.findById(result.rows[0].game_id);
  }

  static async update(gameId, gameData) {
    const {
      torneo_id,
      game_num,
      game_date,
      game_time,
      game_location,
      division,
      phas_id,
      phas_num: phasNumBody,
      visitor,
      local,
      bracket_order,
      canvas_bracket,
      placement,
      placement_number,
      stats_slot_local,
      stats_slot_visitor,
      visitor_score,
      local_score,
      estado
    } = gameData;
    const hasPhasIdField = Object.prototype.hasOwnProperty.call(gameData, 'phas_id');
    const hasVisitorField = Object.prototype.hasOwnProperty.call(gameData, 'visitor');
    const hasLocalField = Object.prototype.hasOwnProperty.call(gameData, 'local');
    const hasGameNumField = Object.prototype.hasOwnProperty.call(gameData, 'game_num');
    const hasCanvasBracketField = Object.prototype.hasOwnProperty.call(gameData, 'canvas_bracket');
    const hasPlacementField = Object.prototype.hasOwnProperty.call(gameData, 'placement');
    const hasPlacementNumberField = Object.prototype.hasOwnProperty.call(gameData, 'placement_number');
    const hasStatsSlotLocalField = Object.prototype.hasOwnProperty.call(gameData, 'stats_slot_local');
    const hasStatsSlotVisitorField = Object.prototype.hasOwnProperty.call(gameData, 'stats_slot_visitor');
    const hasVisitorScoreField = Object.prototype.hasOwnProperty.call(gameData, 'visitor_score');
    const hasLocalScoreField = Object.prototype.hasOwnProperty.call(gameData, 'local_score');
    const hasEstadoField = Object.prototype.hasOwnProperty.call(gameData, 'estado');
    const normScore = (v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s === '' ? null : s;
    };
    const normEstado = (v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s === '' ? null : s;
    };
    const normStatsSlot = (v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      if (s === '') return null;
      return s.length > 64 ? s.slice(0, 64) : s;
    };
    const resolvedPhasNum =
      hasPhasIdField && phas_id != null
        ? await Game.resolvePhasNumFromPhaseId(phas_id, phasNumBody)
        : null;
    const hasPhasNumUpdate = hasPhasIdField && phas_id != null;
    const query = `
      UPDATE game
      SET
        game_num = CASE WHEN $13 THEN $3 ELSE game_num END,
        game_date = COALESCE($4, game_date),
        game_time = COALESCE($5, game_time),
        game_location = COALESCE($6, game_location),
        division = COALESCE($7, division),
        phas_id = COALESCE($8, phas_id),
        phas_num = CASE WHEN $31 THEN $32::int ELSE phas_num END,
        visitor = CASE WHEN $11 THEN $9 ELSE visitor END,
        "local" = CASE WHEN $12 THEN $10 ELSE "local" END,
        bracket_order = COALESCE($14, bracket_order),
        canvas_bracket = CASE WHEN $15 THEN $16 ELSE canvas_bracket END,
        placement = CASE WHEN $17 THEN $18 ELSE placement END,
        placement_number = CASE WHEN $19 THEN $20::int ELSE placement_number END,
        visitor_score = CASE WHEN $21 THEN $22 ELSE visitor_score END,
        local_score = CASE WHEN $23 THEN $24 ELSE local_score END,
        estado = CASE WHEN $25 THEN $26 ELSE estado END,
        stats_slot_local = CASE WHEN $27 THEN $28 ELSE stats_slot_local END,
        stats_slot_visitor = CASE WHEN $29 THEN $30 ELSE stats_slot_visitor END
      WHERE game_id = $1 AND torneo_id = $2
      RETURNING game_id
    `;
    const result = await pool.query(query, [
      gameId,
      torneo_id,
      game_num ?? null,
      game_date,
      game_time,
      game_location,
      division,
      phas_id,
      visitor ?? null,
      local ?? null,
      hasVisitorField,
      hasLocalField,
      hasGameNumField,
      bracket_order ?? null,
      hasCanvasBracketField,
      canvas_bracket != null && String(canvas_bracket).trim() !== '' ? String(canvas_bracket).trim() : null,
      hasPlacementField,
      placement != null && String(placement).trim() !== '' ? String(placement) : null,
      hasPlacementNumberField,
      hasPlacementNumberField
        ? (() => {
            if (placement_number === null || placement_number === undefined || placement_number === '') {
              return null;
            }
            const n = Number(placement_number);
            return Number.isInteger(n) && n >= 0 && n <= 15 ? n : null;
          })()
        : null,
      hasVisitorScoreField,
      normScore(visitor_score),
      hasLocalScoreField,
      normScore(local_score),
      hasEstadoField,
      normEstado(estado),
      hasStatsSlotLocalField,
      hasStatsSlotLocalField ? normStatsSlot(stats_slot_local) : null,
      hasStatsSlotVisitorField,
      hasStatsSlotVisitorField ? normStatsSlot(stats_slot_visitor) : null,
      hasPhasNumUpdate,
      resolvedPhasNum
    ]);
    if (result.rowCount === 0) return null;
    return this.findById(gameId);
  }

  static async resequenceGameNumbers(torneoId) {
    const query = `
      WITH ordered AS (
        SELECT
          g.game_id,
          ROW_NUMBER() OVER (
            ORDER BY
              CASE WHEN g.game_num IS NULL THEN 1 ELSE 0 END,
              g.game_num NULLS LAST,
              CASE
                WHEN LOWER(COALESCE(p.stage, '')) LIKE '%grupo%' OR LOWER(COALESCE(p.stage, '')) LIKE '%group%'
                  THEN 0
                ELSE 1
              END,
              p.phas_id,
              g.bracket_order NULLS LAST,
              g.game_date NULLS LAST,
              g.game_time NULLS LAST,
              g.game_id
          ) AS seq_num
        FROM game g
        INNER JOIN phases p ON p.phas_id = g.phas_id
        WHERE g.torneo_id = $1
      )
      UPDATE game g
      SET game_num = ordered.seq_num
      FROM ordered
      WHERE g.game_id = ordered.game_id
    `;
    await pool.query(query, [torneoId]);
  }

  static async remove(gameId, torneoId) {
    const query = 'DELETE FROM game WHERE game_id = $1 AND torneo_id = $2';
    const result = await pool.query(query, [gameId, torneoId]);
    return result.rowCount > 0;
  }

  /**
   * Actualiza solo el campo estado (p. ej. Ongoing).
   * @param {number} gameId
   * @param {number} torneoId
   * @param {string|null} estado
   */
  static async updateEstado(gameId, torneoId, estado) {
    const norm = (v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s === '' ? null : s;
    };
    const r = await pool.query(
      `UPDATE game SET estado = $1 WHERE game_id = $2 AND torneo_id = $3 RETURNING game_id`,
      [norm(estado), gameId, torneoId]
    );
    if (r.rowCount === 0) return null;
    return this.findById(gameId);
  }

  /**
   * Inserta la fila en `game_events` con tipo JUEGO FINALIZADO (línea de tiempo de la pestaña Resumen / GamePages).
   * Suele ejecutarse cuando el estado pasa a Finished (p. ej. botón END en live tras PATCH estado).
   * @param {number} gameId
   * @param {number} torneoId
   * @param {string|null|undefined} eventTimeWall reloj de juego HH:MM:SS
   * @param {number} userId usuario autenticado (FK game_events.user_id)
   */
  static async recordFinishedTimelineMarker(gameId, torneoId, eventTimeWall, userId, options = {}) {
    const GameEvent = require('./GameEvent');
    const t = eventTimeWall == null ? '' : String(eventTimeWall).trim();
    const created = await GameEvent.insertGameFinishedMarker({
      game_id: Number(gameId),
      tourn_id: Number(torneoId),
      event_time: t || '00:00:00',
      user_id: userId
    });
    try {
      const elapsedOpt = options?.elapsedSeconds;
      if (elapsedOpt != null && elapsedOpt !== '' && Number.isFinite(Number(elapsedOpt))) {
        await this.setLiveClockElapsedSec(gameId, torneoId, elapsedOpt);
      } else {
        await this.syncLiveClockFromGameEventTime(gameId, torneoId, t || '00:00:00');
      }
    } catch (eLc) {
      console.warn('[game-clock] live_clock tras JUEGO FINALIZADO:', eLc.message);
    }
    return created;
  }

  /**
   * Convierte reloj de juego `HH:MM:SS` (o `MM:SS`) a segundos transcurridos de fase.
   * @returns {number|null}
   */
  static parseGameClockHmsToSeconds(raw) {
    const t = raw == null ? '' : String(raw).trim();
    if (!t) return null;
    const m = t.match(/^(\d{1,3}):(\d{2}):(\d{2})$/);
    if (m) {
      const h = Number(m[1]);
      const min = Number(m[2]);
      const sec = Number(m[3]);
      if (!Number.isFinite(min) || !Number.isFinite(sec) || min > 59 || sec > 59) return null;
      return Math.max(0, h * 3600 + min * 60 + sec);
    }
    const m2 = t.match(/^(\d{1,3}):(\d{2})$/);
    if (m2) {
      const min = Number(m2[1]);
      const sec = Number(m2[2]);
      if (!Number.isFinite(sec) || sec > 59) return null;
      return Math.max(0, min * 60 + sec);
    }
    return null;
  }

  /**
   * Persiste segundos de reloj de fase en `game.live_clock_elapsed_sec` (sin filtrar por estado).
   */
  static async setLiveClockElapsedSec(gameId, torneoId, elapsedSeconds) {
    const gid = Number(gameId);
    const tid = Number(torneoId);
    if (!Number.isFinite(gid) || gid <= 0 || !Number.isFinite(tid) || tid <= 0) return null;
    let s =
      elapsedSeconds === undefined || elapsedSeconds === null
        ? 0
        : Math.floor(Number(elapsedSeconds));
    if (!Number.isFinite(s) || s < 0) s = 0;
    const capped = Math.min(s, 86400 * 2);
    const r = await pool.query(
      `UPDATE game SET live_clock_elapsed_sec = $1 WHERE game_id = $2 AND torneo_id = $3 RETURNING game_id`,
      [capped, gid, tid]
    );
    if (r.rowCount === 0) return null;
    return this.findById(gid);
  }

  /**
   * Congela segundos de reloj de juego mostrados al marcar FINAL (enviados desde pantalla LIVE al pulsar END).
   * Todas las vistas (live, GamePages resumen, etc.) pueden leer esta columna con estado Finished.
   * @param {number} elapsedSeconds Segundos transcurridos de fase ≥ 0 (el cliente suele clamp a la duración).
   */
  static async setLiveClockElapsedAtFinish(gameId, torneoId, elapsedSeconds) {
    return this.setLiveClockElapsedSec(gameId, torneoId, elapsedSeconds);
  }

  /**
   * Tras PAUSA / FIN en timeline: congela `live_clock_elapsed_sec` desde `event_time` del evento (HH:MM:SS).
   */
  static async syncLiveClockFromGameEventTime(gameId, torneoId, eventTimeWall) {
    const sec = this.parseGameClockHmsToSeconds(eventTimeWall);
    if (sec == null) return null;
    return this.setLiveClockElapsedSec(gameId, torneoId, sec);
  }

  /**
   * ¿El cronómetro está en pausa de usuario? (último meta-evento JUEGO EN PAUSA sin REANUDADO posterior).
   */
  static async isLiveClockUserPaused(gameId) {
    const gid = Number(gameId);
    if (!Number.isFinite(gid) || gid <= 0) return false;
    const r = await pool.query(
      `SELECT UPPER(TRIM(event_type)) AS ty
       FROM game_events
       WHERE game_id = $1
         AND UPPER(TRIM(event_type)) IN ('JUEGO EN PAUSA', 'JUEGO REANUDADO')
       ORDER BY event_id DESC
       LIMIT 1`,
      [gid]
    );
    if (!r.rows.length) return false;
    return r.rows[0].ty === 'JUEGO EN PAUSA';
  }

  /**
   * Heartbeat del reloj en vivo (partido Ongoing y sin pausa): persiste `live_clock_elapsed_sec` para otras vistas.
   * No modifica partidos finalizados ni cuando el usuario pausó el cronómetro.
   */
  static async syncLiveClockElapsedDuringPlay(gameId, torneoId, elapsedSeconds) {
    const gid = Number(gameId);
    const tid = Number(torneoId);
    if (!Number.isFinite(gid) || gid <= 0 || !Number.isFinite(tid) || tid <= 0) {
      return { ok: false, reason: 'invalid_ids' };
    }
    if (await this.isLiveClockUserPaused(gid)) {
      return { ok: false, reason: 'clock_paused' };
    }
    let s =
      elapsedSeconds === undefined || elapsedSeconds === null
        ? 0
        : Math.floor(Number(elapsedSeconds));
    if (!Number.isFinite(s) || s < 0) s = 0;
    const capped = Math.min(s, 86400 * 2);

    const r = await pool.query(
      `UPDATE game
       SET live_clock_elapsed_sec = $1
       WHERE game_id = $2 AND torneo_id = $3
         AND LOWER(TRIM(COALESCE(estado, ''))) IN ('ongoing', 'en curso')
       RETURNING game_id`,
      [capped, gid, tid]
    );
    if (r.rowCount === 0) {
      return { ok: false, reason: 'not_ongoing_or_missing' };
    }
    return { ok: true, elapsed_seconds: capped };
  }

  /**
   * Registra TIMEOUT en `game_events` (equipo que solicita la pausa; línea «Timeout — …» en Resumen GamePages).
   */
  static recordTimeoutTimelineMarker({ gameId, torneoId, eventTimeWall, teamId, userId }) {
    const GameEvent = require('./GameEvent');
    const tid = torneoId != null ? Number(torneoId) : NaN;
    const gid = gameId != null ? Number(gameId) : NaN;
    const tnum = teamId != null ? Number(teamId) : NaN;
    if (!Number.isFinite(tid) || tid <= 0 || !Number.isFinite(gid) || gid <= 0 || !Number.isFinite(tnum) || tnum <= 0) {
      return Promise.reject(new Error('IDs inválidos para registrar TIMEOUT'));
    }
    const et = eventTimeWall == null ? '' : String(eventTimeWall).trim();
    return GameEvent.insertTimeout({
      game_id: gid,
      tourn_id: tid,
      event_time: et || '00:00:00',
      team_id: tnum,
      user_id: userId
    });
  }

  /**
   * Actualiza estado y, en la misma transacción, mix_ratio_first (regla A mixto).
   * @param {string|null} mixRatioFirst - '3H4M' | '4H3M' | null
   */
  static async updateEstadoAndMixRatioFirst(gameId, torneoId, estado, mixRatioFirst) {
    const normEstado = (v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s === '' ? null : s;
    };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(
        `UPDATE game SET estado = $1, mix_ratio_first = $2 WHERE game_id = $3 AND torneo_id = $4 RETURNING game_id`,
        [normEstado(estado), mixRatioFirst, gameId, torneoId]
      );
      await client.query('COMMIT');
      if (r.rowCount === 0) return null;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return this.findById(gameId);
  }

  /**
   * Suma eventos GOAL por `team_id` del anotador y reparte entre local / visitante.
   *
   * El SQL antiguo exigía `player.team_id` = `game.local` o `game.visitor`; con `local`/`visitor`
   * NULL (playoffs por slot), mixto sólo desde URL-LIVE u OBD desalineado, todos los goles quedaban
   * fuera y `refreshScoresFromGoalEvents` ponía siempre 0–0.
   *
   * Reglas:
   * - Coincidencia directa con los IDs del partido.
   * - Sólo un lado definido en `game`: goles «huérfanos» van al bando sin ID (suele cubrir placeholders).
   * - Sin `local` ni `visitor`: dos equipos con más goles (desempate por team_id).
   *
   * @param {number} gameId
   * @param {import('pg').PoolClient|import('pg').Pool} client
   * @returns {Promise<{ local_goals: number, visitor_goals: number }>}
   */
  static async computeGoalTotalsFromEvents(gameId, client = pool) {
    const gid = Number(gameId);
    if (!Number.isFinite(gid) || gid <= 0) return { local_goals: 0, visitor_goals: 0 };

    if (await this.hasForfeitEvent(gid, client)) {
      const sc = await client.query(
        `SELECT local_score, visitor_score FROM game WHERE game_id = $1`,
        [gid]
      );
      const lg = this.parseScoreIntForPlayoffWl(sc.rows[0]?.local_score);
      const vg = this.parseScoreIntForPlayoffWl(sc.rows[0]?.visitor_score);
      return {
        local_goals: Number.isFinite(lg) ? lg : 0,
        visitor_goals: Number.isFinite(vg) ? vg : 0
      };
    }

    const gameRes = await client.query(`SELECT game_id, "local", visitor FROM game WHERE game_id = $1`, [gid]);
    const gRow = gameRes.rows[0];
    if (!gRow) return { local_goals: 0, visitor_goals: 0 };

    const totalsRes = await client.query(
      `
      SELECT
        COALESCE(e.team_id, p.team_id) AS scorer_tid,
        SUM(e.goals)::bigint AS goal_sum
      FROM game_events e
      LEFT JOIN player p ON p.player_id = e.player_id
      WHERE e.game_id = $1
        AND UPPER(TRIM(COALESCE(e.event_type, ''))) IN ('GOAL', 'PENALTY', 'OWN_GOAL')
      GROUP BY scorer_tid
      `,
      [gid]
    );

    /** @type {Map<number, number>} */
    const byTeam = new Map();
    for (const row of totalsRes.rows) {
      const tidRaw = row.scorer_tid;
      const tid = tidRaw != null ? Number(tidRaw) : NaN;
      const gsum = row.goal_sum != null ? Number(row.goal_sum) : 0;
      if (!Number.isFinite(tid) || tid <= 0 || !Number.isFinite(gsum) || gsum <= 0) continue;
      byTeam.set(tid, (byTeam.get(tid) || 0) + gsum);
    }

    const localDb = this.parsePositiveTeamIdField(gRow.local);
    const visitorDb = this.parsePositiveTeamIdField(gRow.visitor);
    const hasLocal = localDb != null;
    const hasVisitor = visitorDb != null;

    let localGoals = 0;
    let visitorGoals = 0;

    if (hasLocal && hasVisitor) {
      for (const [tid, gc] of byTeam) {
        if (tid === localDb) localGoals += gc;
        else if (tid === visitorDb) visitorGoals += gc;
        else {
          /**
           * team_id del anotador no coincide literal con los FK (datos legacy, importaciones, etc.).
           * IMPORTANTE: no usar orden numérico de team_id (menor ⇒ local): suele invertir el marcador
           * cuando el visitante lleva número de equipo menor que el local.
           * Reparto por proximidad absoluta al par de FK declarados (empate muy raro → visitante).
           */
          const dl = Math.abs(tid - localDb);
          const dv = Math.abs(tid - visitorDb);
          if (dl < dv) localGoals += gc;
          else if (dv < dl) visitorGoals += gc;
          else visitorGoals += gc;
        }
      }
    } else if (hasLocal && !hasVisitor) {
      for (const [tid, gc] of byTeam) {
        if (tid === localDb) localGoals += gc;
        else visitorGoals += gc;
      }
    } else if (!hasLocal && hasVisitor) {
      for (const [tid, gc] of byTeam) {
        if (tid === visitorDb) visitorGoals += gc;
        else localGoals += gc;
      }
    } else {
      const ids = [...byTeam.keys()].sort((a, b) => a - b);
      if (ids.length === 0) {
        /* noop */
      } else if (ids.length === 1) {
        localGoals = byTeam.get(ids[0]) || 0;
      } else {
        const ranked = [...byTeam.entries()].sort((aa, bb) => {
          const gd = bb[1] - aa[1];
          if (gd !== 0) return gd;
          return aa[0] - bb[0];
        });
        const topTwo = ranked.slice(0, 2).sort((a, b) => a[0] - b[0]);
        localGoals = topTwo[0][1];
        visitorGoals = topTwo[1][1];
      }
    }

    let localGoalsFloor = Math.floor(localGoals);
    let visitorGoalsFloor = Math.floor(visitorGoals);

    try {
      const sumRes = await client.query(
        `SELECT COALESCE(SUM(goals), 0)::int AS s
         FROM game_events
         WHERE game_id = $1
           AND UPPER(TRIM(COALESCE(event_type, ''))) = 'GOAL'`,
        [gid]
      );
      const rawSum = Number(sumRes.rows[0]?.s) || 0;
      const primarySum = localGoalsFloor + visitorGoalsFloor;
      if (rawSum > 0 && primarySum < rawSum) {
        const legacy = await this.legacySumGoalsAgainstGameSides(gid, client);
        const legSum = legacy.local_goals + legacy.visitor_goals;
        if (legSum > primarySum) {
          localGoalsFloor = legacy.local_goals;
          visitorGoalsFloor = legacy.visitor_goals;
        }
      }
    } catch (e) {
      console.warn('[goal-totals] fallback suma legada falló', { gameId: gid, message: e.message });
    }

    return {
      local_goals: localGoalsFloor,
      visitor_goals: visitorGoalsFloor
    };
  }

  /**
   * Suma por local/visitante como en la query original (útil si el reparto por equipos «huérfanos»
   * del método principal atribuye menos goles que `SUM(goals)` de filas GOAL).
   * @param {number} gameId
   * @param {import('pg').PoolClient|import('pg').Pool} client
   */
  static async legacySumGoalsAgainstGameSides(gameId, client = pool) {
    const gid = Number(gameId);
    if (!Number.isFinite(gid) || gid <= 0) return { local_goals: 0, visitor_goals: 0 };
    const r = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN COALESCE(e.team_id, p.team_id) IS NOT NULL AND COALESCE(e.team_id, p.team_id) = g."local" THEN e.goals ELSE 0 END), 0)::int AS local_goals,
         COALESCE(SUM(CASE WHEN COALESCE(e.team_id, p.team_id) IS NOT NULL AND COALESCE(e.team_id, p.team_id) = g.visitor THEN e.goals ELSE 0 END), 0)::int AS visitor_goals
       FROM game_events e
       INNER JOIN game g ON g.game_id = e.game_id
       LEFT JOIN player p ON p.player_id = e.player_id
       WHERE e.game_id = $1 AND UPPER(TRIM(COALESCE(e.event_type, ''))) = 'GOAL'`,
      [gid]
    );
    const row = r.rows[0];
    return {
      local_goals: Number(row?.local_goals) || 0,
      visitor_goals: Number(row?.visitor_goals) || 0
    };
  }

  /**
   * API pública `/goal-totals`: cuando el partido ya cerró y la suma de GOAL por roster da 0
   * (slots playoff / equipos locales desalineados con `player.team_id`), usa `local_score`/`visitor_score`
   * que el servidor ya sincronizó al finalizar — **solo si en BD hay algún gol** (no forzar 0-0 sobre eventos).
   * @param {Record<string, unknown>} gameRow
   * @param {{ local_goals: number, visitor_goals: number }} eventTotals
   */
  static resolveGoalTotalsForDisplay(gameRow, eventTotals) {
    const lgE = Number(eventTotals?.local_goals) || 0;
    const vgE = Number(eventTotals?.visitor_goals) || 0;
    const lgDb = this.parseScoreIntForPlayoffWl(gameRow?.local_score);
    const vgDb = this.parseScoreIntForPlayoffWl(gameRow?.visitor_score);
    const hasDb = Number.isFinite(lgDb) && Number.isFinite(vgDb);
    if (
      this.isBracketFinishedEstado(gameRow?.estado) &&
      hasDb &&
      lgE === 0 &&
      vgE === 0 &&
      (lgDb !== 0 || vgDb !== 0)
    ) {
      return { local_goals: lgDb, visitor_goals: vgDb };
    }
    return { local_goals: lgE, visitor_goals: vgE };
  }

  /** Fase de grupos (phas_num=1 o nombre Groups/Grupo) — alineado con estadísticas de grupos. */
  static isGroupPhaseGameRow(row) {
    const phasNum = Number(row?.phas_num ?? row?.phase_num);
    if (phasNum === 1) return true;
    const text = String(row?.phase_name ?? row?.stage ?? '').toLowerCase().trim();
    return text.includes('grupo') || text.includes('group') || text === 'groups';
  }

  /**
   * Al marcar finalizado por primera vez (solo fase de grupos): +1 games a local y visitante; wins/losses según goles en eventos.
   * Empate: sólo aumenta «games». Idempotente vía game.team_standings_recorded.
   */
  static async applyFinishedGameTeamStandings(gameId, torneoId) {
    const gid = Number(gameId);
    const tid = Number(torneoId);
    if (!Number.isFinite(gid) || gid <= 0 || !Number.isFinite(tid) || tid <= 0) {
      return { applied: false, reason: 'invalid_ids' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const gRes = await client.query(
        `SELECT g.game_id, g.torneo_id, g."local", g.visitor, g.team_standings_recorded,
                g.phas_num, p.phase_num, p.stage AS phase_name
         FROM game g
         INNER JOIN phases p ON p.phas_id = g.phas_id
         WHERE g.game_id = $1 AND g.torneo_id = $2
         FOR UPDATE OF g`,
        [gid, tid]
      );
      const row = gRes.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { applied: false, reason: 'no_game' };
      }
      if (row.team_standings_recorded === true) {
        await client.query('COMMIT');
        return { applied: false, reason: 'already_recorded' };
      }
      if (!Game.isGroupPhaseGameRow(row)) {
        await client.query('COMMIT');
        return { applied: false, reason: 'not_group_phase' };
      }

      const localTeamId = row.local != null ? Number(row.local) : NaN;
      const visitorTeamId = row.visitor != null ? Number(row.visitor) : NaN;
      if (
        !Number.isFinite(localTeamId) ||
        localTeamId <= 0 ||
        !Number.isFinite(visitorTeamId) ||
        visitorTeamId <= 0
      ) {
        await client.query('ROLLBACK');
        return { applied: false, reason: 'missing_teams' };
      }

      const totals = await Game.computeGoalTotalsFromEvents(gid, client);
      const [lg, vg] = Game.scoreIntsForDb(totals.local_goals, totals.visitor_goals);

      await client.query(
        `UPDATE game SET local_score = $1, visitor_score = $2 WHERE game_id = $3 AND torneo_id = $4`,
        [lg, vg, gid, tid]
      );

      const bumpTeam = (teamId, winsInc, lossesInc) =>
        client.query(
          `UPDATE team SET
             games = COALESCE(games, 0) + 1,
             wins = COALESCE(wins, 0) + $3,
             losses = COALESCE(losses, 0) + $4
           WHERE team_id = $1 AND torneo_id = $2`,
          [teamId, tid, winsInc, lossesInc]
        );

      if (lg > vg) {
        await bumpTeam(localTeamId, 1, 0);
        await bumpTeam(visitorTeamId, 0, 1);
      } else if (vg > lg) {
        await bumpTeam(localTeamId, 0, 1);
        await bumpTeam(visitorTeamId, 1, 0);
      } else {
        await bumpTeam(localTeamId, 0, 0);
        await bumpTeam(visitorTeamId, 0, 0);
      }

      await client.query(`UPDATE game SET team_standings_recorded = TRUE WHERE game_id = $1 AND torneo_id = $2`, [
        gid,
        tid
      ]);

      await client.query('COMMIT');
      return { applied: true, local_goals: lg, visitor_goals: vg };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /** Victoria/derrota por marcador (fase de grupos). */
  static _standingsWlDelta(localGoals, visitorGoals) {
    const lg = Number(localGoals) || 0;
    const vg = Number(visitorGoals) || 0;
    if (lg > vg) return { localW: 1, localL: 0, visitorW: 0, visitorL: 1 };
    if (vg > lg) return { localW: 0, localL: 1, visitorW: 1, visitorL: 0 };
    return { localW: 0, localL: 0, visitorW: 0, visitorL: 0 };
  }

  /**
   * Corrige wins/losses/games en `team` cuando cambia el marcador de un partido ya contabilizado.
   */
  static async reviseTeamStandingsAfterScoreChange(
    gameId,
    torneoId,
    oldLocal,
    oldVisitor,
    newLocal,
    newVisitor
  ) {
    const gid = Number(gameId);
    const tid = Number(torneoId);
    if (!Number.isFinite(gid) || gid <= 0 || !Number.isFinite(tid) || tid <= 0) {
      return { applied: false, reason: 'invalid_ids' };
    }
    const oL = Number(oldLocal) || 0;
    const oV = Number(oldVisitor) || 0;
    const nL = Number(newLocal) || 0;
    const nV = Number(newVisitor) || 0;
    if (oL === nL && oV === nV) return { applied: false, reason: 'unchanged' };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const gRes = await client.query(
        `SELECT g.game_id, g."local", g.visitor, g.team_standings_recorded,
                g.phas_num, p.phase_num, p.stage AS phase_name
         FROM game g
         INNER JOIN phases p ON p.phas_id = g.phas_id
         WHERE g.game_id = $1 AND g.torneo_id = $2
         FOR UPDATE OF g`,
        [gid, tid]
      );
      const row = gRes.rows[0];
      if (!row || row.team_standings_recorded !== true) {
        await client.query('COMMIT');
        return { applied: false, reason: 'not_recorded' };
      }
      if (!Game.isGroupPhaseGameRow(row)) {
        await client.query('COMMIT');
        return { applied: false, reason: 'not_group_phase' };
      }

      const localTeamId = row.local != null ? Number(row.local) : NaN;
      const visitorTeamId = row.visitor != null ? Number(row.visitor) : NaN;
      if (
        !Number.isFinite(localTeamId) ||
        localTeamId <= 0 ||
        !Number.isFinite(visitorTeamId) ||
        visitorTeamId <= 0
      ) {
        await client.query('ROLLBACK');
        return { applied: false, reason: 'missing_teams' };
      }

      const oldD = Game._standingsWlDelta(oL, oV);
      const newD = Game._standingsWlDelta(nL, nV);

      const adjustTeam = async (teamId, gamesDelta, winsDelta, lossesDelta) => {
        await client.query(
          `UPDATE team SET
             games = GREATEST(COALESCE(games, 0) + $3, 0),
             wins = GREATEST(COALESCE(wins, 0) + $4, 0),
             losses = GREATEST(COALESCE(losses, 0) + $5, 0)
           WHERE team_id = $1 AND torneo_id = $2`,
          [teamId, tid, gamesDelta, winsDelta, lossesDelta]
        );
      };

      await adjustTeam(localTeamId, -1, -oldD.localW, -oldD.localL);
      await adjustTeam(visitorTeamId, -1, -oldD.visitorW, -oldD.visitorL);
      await adjustTeam(localTeamId, 1, newD.localW, newD.localL);
      await adjustTeam(visitorTeamId, 1, newD.visitorW, newD.visitorL);

      await client.query('COMMIT');
      return { applied: true };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Invoca el procedimiento almacenado `ps_game_upd(tourn_id, ga_num, phase_num)`:
   * estadísticas por grupo y posiciones en lienzos Principal / Ranked.
   * Idempotente por partido (`ps_game_upd_done`) y bloqueo transaccional por torneo+juego.
   *
   * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, ga_num?: number, phase_num?: number }>}
   */
  static async runPsGameUpd(tournamentId, gameId, options = {}) {
    const tid = Number(tournamentId);
    const gid = Number(gameId);
    if (!Number.isFinite(tid) || tid <= 0 || !Number.isFinite(gid) || gid <= 0) {
      return { ok: false, reason: 'invalid_ids' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [tid, gid]);

      const gRes = await client.query(
        `SELECT g.game_num,
                g.phas_num,
                g.ps_game_upd_done,
                p.phase_num AS phase_from_join
         FROM game g
         LEFT JOIN phases p ON p.phas_id = g.phas_id
         WHERE g.game_id = $1 AND g.torneo_id = $2
         FOR UPDATE OF g`,
        [gid, tid]
      );
      const row = gRes.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'no_game' };
      }
      if (row.ps_game_upd_done === true && !options.force) {
        await client.query('COMMIT');
        return { ok: true, skipped: true };
      }

      const gaNum = Number(row.game_num);
      let phaseNum = Number(row.phas_num);
      if (!Number.isFinite(phaseNum) || phaseNum <= 0) {
        phaseNum = Number(row.phase_from_join);
      }
      if (!Number.isFinite(gaNum) || gaNum <= 0) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'missing_game_num' };
      }
      if (!Number.isFinite(phaseNum) || phaseNum <= 0) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'missing_phase_num' };
      }

      await Game._invokePsGameUpd(client, tid, gaNum, phaseNum);

      await client.query(
        `UPDATE game SET ps_game_upd_done = TRUE WHERE game_id = $1 AND torneo_id = $2`,
        [gid, tid]
      );
      await client.query('COMMIT');
      return { ok: true, ga_num: gaNum, phase_num: phaseNum };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /** CALL o SELECT según cómo esté definido `ps_game_upd` en PostgreSQL. */
  static async _invokePsGameUpd(client, tournId, gaNum, phaseNum) {
    await client.query('SAVEPOINT before_ps_game_upd');
    try {
      await client.query('CALL ps_game_upd($1::integer, $2::integer, $3::integer)', [
        tournId,
        gaNum,
        phaseNum
      ]);
      await client.query('RELEASE SAVEPOINT before_ps_game_upd');
      return;
    } catch (e) {
      const msg = String(e?.message || '');
      const missing =
        e?.code === '42883' ||
        e?.code === '42809' ||
        /does not exist/i.test(msg) ||
        /no existe/i.test(msg);
      if (!missing) {
        await client.query('ROLLBACK TO SAVEPOINT before_ps_game_upd').catch(() => {});
        throw e;
      }
      await client.query('ROLLBACK TO SAVEPOINT before_ps_game_upd');
    }
    await client.query('SELECT ps_game_upd($1::integer, $2::integer, $3::integer)', [
      tournId,
      gaNum,
      phaseNum
    ]);
  }

  /**
   * Divisiones distintas usadas en partidos del torneo (para filtros de estadísticas).
   */
  static async listDistinctDivisions(torneoId) {
    const r = await pool.query(
      `SELECT DISTINCT TRIM(COALESCE(division, '')) AS d
       FROM game
       WHERE torneo_id = $1
         AND division IS NOT NULL
         AND TRIM(COALESCE(division, '')) <> ''
       ORDER BY 1`,
      [torneoId]
    );
    return r.rows.map((row) => row.d).filter(Boolean);
  }

  static async hasForfeitEvent(gameId, client = pool) {
    const gid = Number(gameId);
    if (!Number.isFinite(gid) || gid <= 0) return false;
    const r = await client.query(
      `SELECT 1 FROM game_events
       WHERE game_id = $1 AND UPPER(TRIM(COALESCE(event_type, ''))) = 'FORFEIT'
       LIMIT 1`,
      [gid]
    );
    return r.rows.length > 0;
  }

  /**
   * Forfeit: marcador 15–0 al rival, sin eventos GOAL/AST. Registra FORFEIT en timeline.
   * @returns {Promise<{ local_score: string, visitor_score: string, forfeit_team_id: number, winner_team_id: number }>}
   */
  static async applyForfeit({ gameId, torneoId, forfeitTeamId, userId, eventTimeWall }) {
    const gid = Number(gameId);
    const tid = Number(torneoId);
    const fid = Number(forfeitTeamId);
    const uid = Number(userId);
    if (!Number.isFinite(gid) || gid <= 0 || !Number.isFinite(tid) || tid <= 0) {
      throw new Error('Identificadores de partido inválidos');
    }
    if (!Number.isFinite(fid) || fid <= 0) {
      throw new Error('forfeit_team_id inválido');
    }
    if (!Number.isFinite(uid) || uid <= 0) {
      throw new Error('Usuario no autenticado');
    }

    const game = await this.findById(gid);
    if (!game || Number(game.torneo_id) !== tid) {
      throw new Error('Partido no encontrado en este torneo');
    }
    if (this.isBracketFinishedEstado(game.estado)) {
      throw new Error('El partido ya está finalizado');
    }
    if (await this.hasForfeitEvent(gid)) {
      throw new Error('Este partido ya tiene un forfeit registrado');
    }

    const localId = this.parsePositiveTeamIdField(game.local);
    const visitorId = this.parsePositiveTeamIdField(game.visitor);
    if (localId == null || visitorId == null) {
      throw new Error('El partido debe tener equipos local y visitante definidos');
    }
    if (fid !== localId && fid !== visitorId) {
      throw new Error('El equipo indicado no participa en este partido');
    }

    const localScore = fid === localId ? '0' : '15';
    const visitorScore = fid === visitorId ? '0' : '15';
    const winnerTeamId = fid === localId ? visitorId : localId;
    const wall = eventTimeWall != null && String(eventTimeWall).trim() !== '' ? String(eventTimeWall).trim() : '00:00:00';

    await pool.query(
      `UPDATE game SET local_score = $1, visitor_score = $2 WHERE game_id = $3 AND torneo_id = $4`,
      [localScore, visitorScore, gid, tid]
    );

    const GameEvent = require('./GameEvent');
    await GameEvent.create({
      game_id: gid,
      tourn_id: tid,
      event_time: wall,
      player_id: null,
      goals: 0,
      assists: 0,
      event_type: 'FORFEIT',
      user_id: uid,
      team_id: fid
    });

    return {
      local_score: localScore,
      visitor_score: visitorScore,
      local_goals: Number(localScore),
      visitor_goals: Number(visitorScore),
      forfeit_team_id: fid,
      winner_team_id: winnerTeamId
    };
  }

  /**
   * Recalcula local_score y visitor_score sumando goles (event_type GOAL) por equipo del anotador.
   * Mantiene alineado el marcador del partido con la pantalla de anotación / eventos en vivo.
   */
  static async refreshScoresFromGoalEvents(gameId) {
    const game = await this.findById(gameId);
    if (!game) return null;
    const torneoId = Number(game.torneo_id);
    if (!Number.isFinite(torneoId)) return null;

    if (await this.hasForfeitEvent(gameId)) {
      return this.findById(gameId);
    }

    const totals = await this.computeGoalTotalsFromEvents(gameId);
    const [lg, vg] = this.scoreIntsForDb(totals.local_goals, totals.visitor_goals);
    const upd = await pool.query(
      `UPDATE game SET local_score = $1, visitor_score = $2 WHERE game_id = $3 AND torneo_id = $4 RETURNING game_id`,
      [lg, vg, gameId, torneoId]
    );
    if (upd.rowCount === 0) return null;
    return this.findById(gameId);
  }

  static FOOTBALL_SPORT_ID = 2;

  /**
   * Ultimate y otros deportes usan encuesta de espíritu; fútbol (sport_id = 2) no.
   * @param {number|string|null|undefined} sportId
   * @returns {boolean}
   */
  static sportAllowsSpiritSurvey(sportId) {
    const n = Number(sportId);
    if (!Number.isFinite(n) || n <= 0) return true;
    return n !== Game.FOOTBALL_SPORT_ID;
  }

  /**
   * @param {number|string} tournamentId
   * @returns {Promise<boolean>}
   */
  static async tournamentAllowsSpiritSurvey(tournamentId) {
    const tid = Number(tournamentId);
    if (!Number.isFinite(tid) || tid <= 0) return false;
    const TournamentConfig = require('./TournamentConfig');
    const tournament = await TournamentConfig.findById(tid);
    if (!tournament) return false;
    return Game.sportAllowsSpiritSurvey(tournament.sport_id);
  }

  /**
   * Solo en partidos Finished se permite registrar la encuesta de espíritu de forma manual
   * (organizador) desde la ficha del juego cuando no hubo correo o no se envió el enlace.
   * No aplica a torneos de fútbol ({@link Game.FOOTBALL_SPORT_ID}).
   * @param {string|null|undefined} estado
   * @returns {boolean}
   */
  static estadoAllowsSpiritSurveyManual(estado) {
    return String(estado ?? '').trim().toLowerCase() === 'finished';
  }

  static normDivisionKey(d) {
    return String(d ?? '').trim();
  }

  /** Normaliza stats_slot tipo W16 / L8 (equiv. al lienzo frontend). */
  static normStatsAdvanceToken(raw) {
    return String(raw ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
  }

  static isBracketFinishedEstado(estado) {
    const s = String(estado ?? '').trim().toLowerCase();
    return s === 'finished' || s === 'finalizado' || s === 'completed';
  }

  static parseScoreIntForPlayoffWl(v) {
    if (v == null || v === '') return NaN;
    const n = parseInt(String(v).trim(), 10);
    return Number.isFinite(n) ? n : NaN;
  }

  /** Enteros para persistir marcador (compatible con columnas INTEGER o VARCHAR). */
  static scoreIntsForDb(localGoals, visitorGoals) {
    const lg = Math.max(0, Math.floor(Number(localGoals) || 0));
    const vg = Math.max(0, Math.floor(Number(visitorGoals) || 0));
    return [lg, vg];
  }

  static parsePositiveTeamIdField(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /**
   * Recorre todos los partidos **Finished** del torneo y propaga ganador/perdedor a huecos
   * `stats_slot_*` con tokens W# / L# (misma lógica que al cerrar un partido vía PATCH estado).
   * Idempotente: útil tras importaciones o si un cierre no disparó bien los hooks.
   *
   * @param {number} tournamentId
   * @returns {Promise<{ updatedGameIds: number[], updatedGames: number }>}
   */
  static async syncPlayoffAdvancesFromFinishedGames(tournamentId) {
    const tid = Number(tournamentId);
    if (!Number.isFinite(tid) || tid <= 0) return { updatedGameIds: [], updatedGames: 0 };

    const r = await pool.query(
      `
      SELECT game_id
      FROM game
      WHERE torneo_id = $1
        AND LOWER(TRIM(COALESCE(estado, ''))) IN ('finished', 'finalizado', 'completed')
      ORDER BY game_num NULLS LAST, bracket_order NULLS LAST, game_id
      `,
      [tid]
    );

    /** @type {Set<number>} */
    const allTouched = new Set();
    for (const row of r.rows) {
      const gid = Number(row.game_id);
      if (!Number.isFinite(gid) || gid <= 0) continue;
      const { updatedGameIds } = await this.propagatePlayoffWlAfterGameFinished(tid, gid);
      for (const x of updatedGameIds || []) allTouched.add(x);
    }

    const arr = [...allTouched];
    return { updatedGameIds: arr, updatedGames: arr.length };
  }

  /**
   * Rellena local/visitor de partidos posteriores cuyo stats_slot_* refiere W#/L#
   * del número de partido ya cerrado y con marcador decidido (sin empate).
   * Encadena hasta un tope cuando un descendiente también está Finished y a su vez define W#/L#.
   * @param {number} tournamentId
   * @param {number} finishedGameId
   * @returns {Promise<{ updatedGameIds: number[] }>}
   */
  static async propagatePlayoffWlAfterGameFinished(tournamentId, finishedGameId) {
    const tid = Number(tournamentId);
    const root = Number(finishedGameId);
    if (!Number.isFinite(tid) || tid <= 0 || !Number.isFinite(root) || root <= 0) {
      return { updatedGameIds: [] };
    }

    /** @type {number[]} */
    const updatedFlatten = [];
    const seenSources = new Set();
    /** @type {number[]} */
    let frontier = [root];

    while (frontier.length > 0 && seenSources.size < 96) {
      const sid = frontier.shift();
      if (!Number.isFinite(sid) || seenSources.has(sid)) continue;
      seenSources.add(sid);

      const srcRow = await this.findById(sid);
      if (!srcRow || Number(srcRow.torneo_id) !== tid) continue;
      if (!this.isBracketFinishedEstado(srcRow.estado)) continue;

      const touched = await this.propagateWlFromOneFinishedBracketGame(tid, srcRow);
      for (const gid of touched) {
        if (!updatedFlatten.includes(gid)) updatedFlatten.push(gid);
        const gNext = await this.findById(gid);
        if (gNext && this.isBracketFinishedEstado(gNext.estado)) frontier.push(gid);
      }
    }

    return { updatedGameIds: updatedFlatten };
  }

  /**
   * Una sola oleada desde un partido origen Finished.
   * @param {number} tournamentId
   * @param {Record<string, unknown>} srcRow resultado de Game.findById (origen)
   * @returns {Promise<number[]>} game_ids actualizados
   */
  static async propagateWlFromOneFinishedBracketGame(tournamentId, srcRow) {
    const tid = Number(tournamentId);
    const sid = Number(srcRow.game_id);
    if (!Number.isFinite(tid) || tid <= 0 || !Number.isFinite(sid) || sid <= 0) return [];

    const gn = Number(srcRow.game_num);
    if (!Number.isInteger(gn) || gn <= 0) return [];

    let lg = this.parseScoreIntForPlayoffWl(srcRow.local_score);
    let vg = this.parseScoreIntForPlayoffWl(srcRow.visitor_score);
    if (!Number.isFinite(lg) || !Number.isFinite(vg)) {
      try {
        const totals = await this.computeGoalTotalsFromEvents(sid);
        lg = Number(totals.local_goals) || 0;
        vg = Number(totals.visitor_goals) || 0;
      } catch (_) {
        return [];
      }
    }
    if (!Number.isFinite(lg) || !Number.isFinite(vg) || lg === vg) return [];

    const localTeamId = this.parsePositiveTeamIdField(srcRow.local);
    const visitorTeamId = this.parsePositiveTeamIdField(srcRow.visitor);
    if (!localTeamId || !visitorTeamId) return [];

    const winnerTeamId = lg > vg ? localTeamId : visitorTeamId;
    const loserTeamId = lg > vg ? visitorTeamId : localTeamId;

    const WL = `W${gn}`;
    const LL = `L${gn}`;
    const divKey = this.normDivisionKey(srcRow.division);

    const cand = await pool.query(
      `
      SELECT game_id, division, stats_slot_local, stats_slot_visitor, "local", visitor, estado
      FROM game
      WHERE torneo_id = $1
        AND game_id <> $2
        AND (
          REGEXP_REPLACE(UPPER(TRIM(COALESCE(stats_slot_local, ''))), '[^A-Z0-9]+', '', 'g') IN ($3::text, $4::text)
          OR REGEXP_REPLACE(UPPER(TRIM(COALESCE(stats_slot_visitor, ''))), '[^A-Z0-9]+', '', 'g') IN ($3::text, $4::text)
        )
      `,
      [tid, sid, WL, LL]
    );

    /** @type {number[]} */
    const updatedIds = [];

    for (const row of cand.rows) {
      if (this.normDivisionKey(row.division) !== divKey) continue;

      const tokL = this.normStatsAdvanceToken(row.stats_slot_local);
      const tokV = this.normStatsAdvanceToken(row.stats_slot_visitor);

      let nl = row.local != null ? this.parsePositiveTeamIdField(row.local) : null;
      let nv = row.visitor != null ? this.parsePositiveTeamIdField(row.visitor) : null;
      let changed = false;

      if (tokL === WL || tokL === LL) {
        const want = tokL === WL ? winnerTeamId : loserTeamId;
        if (want && nl !== want) {
          nl = want;
          changed = true;
        }
      }
      if (tokV === WL || tokV === LL) {
        const want = tokV === WL ? winnerTeamId : loserTeamId;
        if (want && nv !== want) {
          nv = want;
          changed = true;
        }
      }

      if (!changed) continue;

      try {
        const out = await this.update(Number(row.game_id), {
          torneo_id: tid,
          local: nl ?? null,
          visitor: nv ?? null
        });
        if (out) updatedIds.push(Number(row.game_id));
      } catch (e) {
        console.warn('[playoff-propagate] update failed', {
          tournamentId: tid,
          sourceGameId: sid,
          targetGameId: row.game_id,
          message: e.message
        });
      }
    }

    return updatedIds;
  }

  /**
   * Respuestas de encuesta de espíritu para un partido: hasta dos filas, una por combinación
   * `(responding_team_id, rated_team_id)` (cada lado evalúa al rival de forma independiente).
   */
  static async getSpiritSurveyResponsesByGameId(gameId) {
    const SpiritSurveyResponse = require('./SpiritSurveyResponse');
    return SpiritSurveyResponse.findByGameId(gameId);
  }
}

module.exports = Game;
