const pool = require('../config/database');
const XLSX = require('xlsx');

class GameEvent {
  /** Tipos especiales (anotación en vivo). */
  static get EVENT_TYPES() {
    return Object.freeze({
      TIMEOUT: 'TIMEOUT',
      JUEGO_FINALIZADO: 'JUEGO FINALIZADO'
    });
  }

  /** Columnas de la plantilla Excel (asists se acepta como alias de assists al importar). */
  static get IMPORT_COLUMN_HEADERS() {
    return [
      'game_id',
      'event_time',
      'tourn_id',
      'player_id',
      'goals',
      'assists',
      'event_type',
      'team_id'
    ];
  }

  /**
   * Genera buffer .xlsx: fila 1 encabezados; fila 2 ejemplo con game_id, tourn_id, event_time 00:00, START (team_id a completar).
   */
  static generateTemplateBuffer(gameId, tournId) {
    const header = [...this.IMPORT_COLUMN_HEADERS];
    const firstDataRow = [gameId, '00:00', tournId, '', 0, 0, 'START', ''];
    const ws = XLSX.utils.aoa_to_sheet([header, firstDataRow]);
    ws['!cols'] = [
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 8 },
      { wch: 8 },
      { wch: 18 },
      { wch: 10 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'eventos');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  static normalizeImportRow(row) {
    if (!row || typeof row !== 'object') return {};
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      const key = String(k).trim().toLowerCase();
      const keyNorm = key === 'asists' ? 'assists' : key;
      if (GameEvent.IMPORT_COLUMN_HEADERS.includes(keyNorm)) {
        if (v === '' || v === undefined) {
          out[keyNorm] = null;
        } else if (typeof v === 'number') {
          out[keyNorm] = v;
        } else {
          out[keyNorm] = String(v).trim();
        }
      }
    }
    return out;
  }

  static isEmptyImportRow(row) {
    const vals = Object.values(row).filter(
      (v) => v !== null && v !== undefined && String(v).trim() !== ''
    );
    return vals.length === 0;
  }

  /**
   * Lee un .xlsx (primera hoja) y devuelve filas normalizadas (sin filas totalmente vacías).
   */
  static parseImportBuffer(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      return [];
    }
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
    return raw
      .map((r) => GameEvent.normalizeImportRow(r))
      .filter((r) => !GameEvent.isEmptyImportRow(r));
  }
  static async ensureGameEventsColumns() {
    const colTeam = await pool.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'game_events' AND column_name = 'team_id'
    `);
    if (colTeam.rows.length === 0) {
      await pool.query(`
        ALTER TABLE game_events
        ADD COLUMN team_id INTEGER REFERENCES team(team_id) ON DELETE SET NULL
      `);
    }
    await pool.query('ALTER TABLE game_events ALTER COLUMN player_id DROP NOT NULL').catch(() => {});

    const colYellow = await pool.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'game_events' AND column_name = 'yellowcard'
    `);
    if (colYellow.rows.length === 0) {
      await pool.query(`ALTER TABLE game_events ADD COLUMN yellowcard INTEGER NOT NULL DEFAULT 0`);
    }

    const colRed = await pool.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'game_events' AND column_name = 'redcard'
    `);
    if (colRed.rows.length === 0) {
      await pool.query(`ALTER TABLE game_events ADD COLUMN redcard INTEGER NOT NULL DEFAULT 0`);
    }

    const colEvTypeLen = await pool.query(`
      SELECT character_maximum_length AS maxlen
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'game_events' AND column_name = 'event_type'
    `);
    const maxlen = colEvTypeLen.rows[0]?.maxlen != null ? Number(colEvTypeLen.rows[0].maxlen) : null;
    if (maxlen != null && Number.isFinite(maxlen) && maxlen < 48) {
      await pool.query('ALTER TABLE game_events ALTER COLUMN event_type TYPE VARCHAR(64)');
    }
  }

  static async createTable() {
    const tbl = await pool.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'game_events'
    `);
    const hasTournId = await pool.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'game_events' AND column_name = 'tourn_id'
    `);
    if (tbl.rows.length > 0 && hasTournId.rows.length === 0) {
      await pool.query('DROP TABLE IF EXISTS game_events CASCADE');
    }

    const query = `
      CREATE TABLE IF NOT EXISTS game_events (
        event_id SERIAL PRIMARY KEY,
        game_id INTEGER NOT NULL REFERENCES game(game_id) ON DELETE CASCADE,
        tourn_id INTEGER NOT NULL REFERENCES torneo(torneo_id) ON DELETE CASCADE,
        event_time VARCHAR(32) NOT NULL,
        player_id INTEGER REFERENCES player(player_id) ON DELETE CASCADE,
        goals INTEGER NOT NULL DEFAULT 0,
        assists INTEGER NOT NULL DEFAULT 0,
        event_type VARCHAR(20) NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        team_id INTEGER REFERENCES team(team_id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await pool.query(query);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_game_events_game ON game_events(game_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_game_events_tourn ON game_events(tourn_id)');
    await this.ensureGameEventsColumns();
  }

  /**
   * @param {Object} row
   * @param {number} row.game_id
   * @param {number} row.tourn_id
   * @param {string} row.event_time
   * @param {number|null} [row.player_id]
   * @param {number} row.goals
   * @param {number} row.assists
   * @param {string} row.event_type
   * @param {number} row.user_id
   * @param {number|null} [row.team_id]
   * @param {number} [row.yellowcard]
   * @param {number} [row.redcard]
   */
  static async create(row) {
    const q = `
      INSERT INTO game_events (game_id, tourn_id, event_time, player_id, goals, assists, event_type, user_id, team_id, yellowcard, redcard)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    const values = [
      row.game_id,
      row.tourn_id,
      row.event_time,
      row.player_id ?? null,
      row.goals,
      row.assists,
      row.event_type,
      row.user_id,
      row.team_id ?? null,
      row.yellowcard != null ? Number(row.yellowcard) : 0,
      row.redcard != null ? Number(row.redcard) : 0
    ];
    const result = await pool.query(q, values);
    return result.rows[0];
  }

  static async findByIdForGame(eventId, gameId, tournamentId) {
    const r = await pool.query(
      `SELECT
         e.event_id,
         e.game_id,
         e.tourn_id,
         e.event_time,
         e.event_type,
         e.player_id,
         e.goals,
         e.assists,
         e.team_id,
         e.yellowcard,
         e.redcard,
         p.player_name,
         p.team_id AS player_team_id
       FROM game_events e
       LEFT JOIN player p ON p.player_id = e.player_id
       WHERE e.event_id = $1 AND e.game_id = $2 AND e.tourn_id = $3`,
      [Number(eventId), Number(gameId), Number(tournamentId)]
    );
    return r.rows[0] || null;
  }

  static async updateById(eventId, row) {
    const q = `
      UPDATE game_events
      SET
        event_time = $2,
        player_id = $3,
        goals = $4,
        assists = $5,
        event_type = $6,
        team_id = $7,
        yellowcard = $8,
        redcard = $9
      WHERE event_id = $1
      RETURNING *
    `;
    const result = await pool.query(q, [
      Number(eventId),
      row.event_time,
      row.player_id ?? null,
      row.goals,
      row.assists,
      row.event_type,
      row.team_id ?? null,
      row.yellowcard != null ? Number(row.yellowcard) : 0,
      row.redcard != null ? Number(row.redcard) : 0
    ]);
    return result.rows[0] || null;
  }

  static async deleteById(eventId) {
    const result = await pool.query('DELETE FROM game_events WHERE event_id = $1 RETURNING event_id', [
      Number(eventId)
    ]);
    return result.rowCount > 0;
  }

  static async findByGameId(gameId) {
    const q = `
      SELECT
        e.event_id,
        e.game_id,
        e.tourn_id,
        e.event_time,
        e.event_type,
        e.player_id,
        e.goals,
        e.assists,
        e.team_id,
        e.yellowcard,
        e.redcard,
        e.created_at,
        p.player_name,
        p.team_id AS player_team_id,
        COALESCE(
          ot.name,
          CASE
            WHEN e.team_id IS NOT NULL AND g."local" IS NOT NULL AND e.team_id = g."local" THEN lt.name
            WHEN e.team_id IS NOT NULL AND g.visitor IS NOT NULL AND e.team_id = g.visitor THEN vt.name
            ELSE NULL::text
          END
        ) AS offense_team_name
      FROM game_events e
      INNER JOIN game g ON g.game_id = e.game_id
      LEFT JOIN player p ON p.player_id = e.player_id
      LEFT JOIN team ot ON ot.team_id = e.team_id
      LEFT JOIN team lt ON lt.team_id = g."local"
      LEFT JOIN team vt ON vt.team_id = g.visitor
      WHERE e.game_id = $1
      ORDER BY e.event_id ASC
    `;
    const result = await pool.query(q, [gameId]);
    return result.rows;
  }

  static async hasStartEvent(gameId) {
    const r = await pool.query(
      `SELECT 1 FROM game_events WHERE game_id = $1 AND UPPER(TRIM(event_type)) = 'START' LIMIT 1`,
      [gameId]
    );
    return r.rows.length > 0;
  }

  /**
   * TIMEOUTs por equipo en un partido (máx. 2 por equipo).
   * @returns {Promise<Array<{ team_id: number, cantidad_to: number }>>}
   */
  static async countTimeoutsByTeam(tournamentId, gameId) {
    const tid = Number(tournamentId);
    const gid = Number(gameId);
    if (!Number.isFinite(tid) || tid <= 0 || !Number.isFinite(gid) || gid <= 0) return [];
    const r = await pool.query(
      `SELECT team_id, COUNT(event_type)::int AS cantidad_to
       FROM game_events
       WHERE tourn_id = $1
         AND game_id = $2
         AND UPPER(TRIM(event_type)) = 'TIMEOUT'
         AND team_id IS NOT NULL
       GROUP BY team_id`,
      [tid, gid]
    );
    return r.rows.map((row) => ({
      team_id: Number(row.team_id),
      cantidad_to: Number(row.cantidad_to) || 0
    }));
  }

  /** Cuenta TIMEOUT de un equipo concreto en el partido. */
  static async countTimeoutsForTeam(tournamentId, gameId, teamId) {
    const tid = Number(tournamentId);
    const gid = Number(gameId);
    const tnum = Number(teamId);
    if (!Number.isFinite(tid) || tid <= 0 || !Number.isFinite(gid) || gid <= 0 || !Number.isFinite(tnum) || tnum <= 0) {
      return 0;
    }
    const r = await pool.query(
      `SELECT COUNT(event_type)::int AS cantidad_to
       FROM game_events
       WHERE tourn_id = $1
         AND game_id = $2
         AND UPPER(TRIM(event_type)) = 'TIMEOUT'
         AND team_id = $3`,
      [tid, gid, tnum]
    );
    return Number(r.rows[0]?.cantidad_to) || 0;
  }

  /** Evita duplicar el marcador «Juego finalizado» si se repite PATCH a Finished */
  static async hasGameFinishedMarker(gameId) {
    const want = GameEvent.EVENT_TYPES.JUEGO_FINALIZADO.toUpperCase();
    const r = await pool.query(
      `SELECT 1 FROM game_events WHERE game_id = $1 AND UPPER(TRIM(event_type)) = $2 LIMIT 1`,
      [gameId, want]
    );
    return r.rows.length > 0;
  }

  /**
   * Timeout: equipo que solicita la pausa (debe ser local o visitante del partido).
   * @param {{ game_id: number, tourn_id: number, event_time: string, team_id: number, user_id: number }} row
   */
  static insertTimeout(row) {
    return this.create({
      game_id: row.game_id,
      tourn_id: row.tourn_id,
      event_time: String(row.event_time ?? '').trim(),
      player_id: null,
      goals: 0,
      assists: 0,
      event_type: GameEvent.EVENT_TYPES.TIMEOUT,
      user_id: row.user_id,
      team_id: row.team_id != null ? Number(row.team_id) : null
    });
  }

  /**
   * Evento dedicado para la línea de tiempo al cerrar el partido.
   * @param {{ game_id: number, tourn_id: number, event_time: string, user_id: number }} row
   */
  static insertGameFinishedMarker(row) {
    return this.create({
      game_id: row.game_id,
      tourn_id: row.tourn_id,
      event_time: String(row.event_time ?? '').trim(),
      player_id: null,
      goals: 0,
      assists: 0,
      event_type: GameEvent.EVENT_TYPES.JUEGO_FINALIZADO,
      user_id: row.user_id,
      team_id: null
    });
  }

  /**
   * Agrega goles, asistencias y partidos (DISTINCT game_id) por jugador desde game_events.
   * @param {number} torneoId
   * @param {{ topOnly?: boolean, division?: string|null, groupPhaseOnly?: boolean }} [options]
   *    groupPhaseOnly: solo partidos cuya fase (phases.stage) contiene grupo/group (alineado con clasificatoria).
   */
  static async aggregatePlayerStatsByTournament(torneoId, options = {}) {
    const tid = Number(torneoId);
    if (!Number.isFinite(tid) || tid <= 0) return [];

    const topOnly = options.topOnly === true;
    const division =
      options.division != null && String(options.division).trim() !== ''
        ? String(options.division).trim()
        : null;
    const groupPhaseOnly = options.groupPhaseOnly === true;

    const groupPhaseClauseG =
      groupPhaseOnly
        ? ` AND EXISTS (
            SELECT 1 FROM phases ph
            WHERE ph.phas_id = g.phas_id
              AND ph.torneo_id = g.torneo_id
              AND (
                LOWER(TRIM(COALESCE(ph.stage, ''))) LIKE '%grupo%'
                OR LOWER(TRIM(COALESCE(ph.stage, ''))) LIKE '%group%'
              )
          )`
        : '';
    const groupPhaseClauseGm =
      groupPhaseOnly
        ? ` AND EXISTS (
            SELECT 1 FROM phases ph
            WHERE ph.phas_id = gm.phas_id
              AND ph.torneo_id = gm.torneo_id
              AND (
                LOWER(TRIM(COALESCE(ph.stage, ''))) LIKE '%grupo%'
                OR LOWER(TRIM(COALESCE(ph.stage, ''))) LIKE '%group%'
              )
          )`
        : '';

    const divFilterBase =
      topOnly || !division ? '' : ' AND TRIM(COALESCE(g.division, \'\')) = $2';
    const divFilterCall =
      topOnly || !division ? '' : ' AND TRIM(COALESCE(gm.division, \'\')) = $2';
    const paramsBase = topOnly || !division ? [tid] : [tid, division];
    const orderLimit = topOnly
      ? ' ORDER BY (b.goals + b.assists) DESC, p.player_name ASC NULLS LAST LIMIT 100'
      : ' ORDER BY (b.goals + b.assists) DESC, p.player_name ASC NULLS LAST';

    const sql = `
      WITH base AS (
        SELECT
          e.player_id,
          SUM(e.goals)::int AS goals,
          SUM(e.assists)::int AS assists,
          COUNT(DISTINCT e.game_id)::int AS games_played
        FROM game_events e
        INNER JOIN game g ON g.game_id = e.game_id AND g.torneo_id = e.tourn_id
        WHERE e.tourn_id = $1
          AND e.player_id IS NOT NULL
          AND UPPER(TRIM(e.event_type)) IN ('GOAL', 'AST')
          ${divFilterBase}
          ${groupPhaseClauseG}
        GROUP BY e.player_id
      ),
      callahan AS (
        SELECT g.player_id, COUNT(*)::int AS callahans
        FROM game_events g
        INNER JOIN game gm ON gm.game_id = g.game_id AND gm.torneo_id = g.tourn_id
        INNER JOIN game_events a
          ON a.game_id = g.game_id
          AND a.event_time = g.event_time
          AND UPPER(TRIM(a.event_type)) = 'AST'
        WHERE g.tourn_id = $1
          AND UPPER(TRIM(g.event_type)) = 'GOAL'
          AND g.player_id IS NOT NULL
          ${divFilterCall}
          ${groupPhaseClauseGm}
          AND (a.player_id = g.player_id OR COALESCE(a.assists, 0) = 0)
        GROUP BY g.player_id
      )
      SELECT
        b.player_id,
        p.player_name,
        t.team_id,
        t.name AS team_name,
        t.url_imagen AS team_image,
        b.goals,
        b.assists,
        b.games_played AS games,
        COALESCE(ch.callahans, 0)::int AS callahans
      FROM base b
      INNER JOIN player p ON p.player_id = b.player_id
      INNER JOIN team t ON t.team_id = p.team_id
      LEFT JOIN callahan ch ON ch.player_id = b.player_id
      WHERE t.torneo_id = $1
      ${orderLimit}
    `;

    const result = await pool.query(sql, paramsBase);
    return result.rows;
  }

  /**
   * Estadísticas de fútbol por jugador desde game_events (goles, tarjetas, partidos).
   */
  static async aggregateFootballPlayerStatsByTournament(torneoId, options = {}) {
    const tid = Number(torneoId);
    if (!Number.isFinite(tid) || tid <= 0) return [];

    const topOnly = options.topOnly === true;
    const division =
      options.division != null && String(options.division).trim() !== ''
        ? String(options.division).trim()
        : null;
    const groupPhaseOnly = options.groupPhaseOnly === true;

    const groupPhaseClauseG =
      groupPhaseOnly
        ? ` AND EXISTS (
            SELECT 1 FROM phases ph
            WHERE ph.phas_id = g.phas_id
              AND ph.torneo_id = g.torneo_id
              AND (
                LOWER(TRIM(COALESCE(ph.stage, ''))) LIKE '%grupo%'
                OR LOWER(TRIM(COALESCE(ph.stage, ''))) LIKE '%group%'
              )
          )`
        : '';

    const divFilterBase =
      topOnly || !division ? '' : ' AND TRIM(COALESCE(g.division, \'\')) = $2';
    const paramsBase = topOnly || !division ? [tid] : [tid, division];
    const orderLimit = topOnly
      ? ' ORDER BY b.goals DESC, b.yellowcards DESC, p.player_name ASC NULLS LAST LIMIT 100'
      : ' ORDER BY b.goals DESC, b.yellowcards DESC, p.player_name ASC NULLS LAST';

    const sql = `
      WITH base AS (
        SELECT
          e.player_id,
          SUM(
            CASE
              WHEN UPPER(TRIM(e.event_type)) IN ('GOAL', 'PENALTY') THEN COALESCE(e.goals, 1)
              ELSE 0
            END
          )::int AS goals,
          SUM(
            CASE
              WHEN UPPER(TRIM(e.event_type)) = 'OWN_GOAL' THEN COALESCE(e.goals, 1)
              ELSE 0
            END
          )::int AS own_goals,
          SUM(COALESCE(e.yellowcard, 0))::int AS yellowcards,
          SUM(COALESCE(e.redcard, 0))::int AS redcards,
          COUNT(DISTINCT e.game_id)::int AS games_played
        FROM game_events e
        INNER JOIN game g ON g.game_id = e.game_id AND g.torneo_id = e.tourn_id
        WHERE e.tourn_id = $1
          AND e.player_id IS NOT NULL
          AND UPPER(TRIM(e.event_type)) IN ('GOAL', 'PENALTY', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD')
          ${divFilterBase}
          ${groupPhaseClauseG}
        GROUP BY e.player_id
      )
      SELECT
        b.player_id,
        p.player_name,
        t.team_id,
        t.name AS team_name,
        t.url_imagen AS team_image,
        b.goals,
        b.own_goals,
        0::int AS assists,
        b.games_played AS games,
        0::int AS callahans,
        b.yellowcards,
        b.redcards
      FROM base b
      INNER JOIN player p ON p.player_id = b.player_id
      INNER JOIN team t ON t.team_id = p.team_id
      WHERE t.torneo_id = $1
      ${orderLimit}
    `;

    const result = await pool.query(sql, paramsBase);
    return result.rows;
  }
}

module.exports = GameEvent;
