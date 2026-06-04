const pool = require('../config/database');

class SpiritSurveyResponse {
  static async createTable() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS spirit_survey_response (
        response_id SERIAL PRIMARY KEY,
        invite_id INTEGER NOT NULL UNIQUE REFERENCES spirit_survey_invite(invite_id) ON DELETE CASCADE,
        game_id INTEGER NOT NULL,
        torneo_id INTEGER NOT NULL,
        responding_team_id INTEGER NOT NULL,
        rated_team_id INTEGER NOT NULL,
        s_rules SMALLINT NOT NULL,
        s_fouls SMALLINT NOT NULL,
        s_fairmind SMALLINT NOT NULL,
        s_attitude SMALLINT NOT NULL,
        s_communication SMALLINT NOT NULL,
        comments TEXT,
        submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT spirit_s_scores_0_4 CHECK (
          s_rules BETWEEN 0 AND 4
          AND s_fouls BETWEEN 0 AND 4
          AND s_fairmind BETWEEN 0 AND 4
          AND s_attitude BETWEEN 0 AND 4
          AND s_communication BETWEEN 0 AND 4
        )
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS spirit_survey_response_tor_rated_idx ON spirit_survey_response(torneo_id, rated_team_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS spirit_survey_response_tor_game_idx ON spirit_survey_response(torneo_id, game_id)`
    );

    await pool.query(`ALTER TABLE spirit_survey_response ADD COLUMN IF NOT EXISTS s_rules SMALLINT`);
    await pool.query(`ALTER TABLE spirit_survey_response ADD COLUMN IF NOT EXISTS s_fouls SMALLINT`);
    await pool.query(`ALTER TABLE spirit_survey_response ADD COLUMN IF NOT EXISTS s_fairmind SMALLINT`);
    await pool.query(`ALTER TABLE spirit_survey_response ADD COLUMN IF NOT EXISTS s_attitude SMALLINT`);
    await pool.query(`ALTER TABLE spirit_survey_response ADD COLUMN IF NOT EXISTS s_communication SMALLINT`);

    await SpiritSurveyResponse.migrateDropLegacySpiritColumns();
  }

  /**
   * Tablas antiguas: copia fairness/respect/communication/overall → s_* y elimina columnas legacy.
   * Idempotente si ya solo existen s_*.
   */
  static async migrateDropLegacySpiritColumns() {
    const { rows: legacyCols } = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'spirit_survey_response'
         AND column_name IN ('fairness', 'respect', 'communication', 'overall')`
    );
    const hasLegacy = legacyCols.length > 0;
    const hasFullLegacySet = legacyCols.length === 4;

    await pool.query(`ALTER TABLE spirit_survey_response DROP CONSTRAINT IF EXISTS spirit_scores_range`);
    await pool.query(`ALTER TABLE spirit_survey_response DROP CONSTRAINT IF EXISTS spirit_scores_range_0_4`);
    await pool.query(`ALTER TABLE spirit_survey_response DROP CONSTRAINT IF EXISTS spirit_s_scores_0_4`);

    if (hasFullLegacySet) {
      await pool.query(`
          UPDATE spirit_survey_response SET
            s_rules = COALESCE(
              s_rules,
              CASE
                WHEN fairness BETWEEN 1 AND 5 THEN fairness - 1
                WHEN fairness BETWEEN 0 AND 4 THEN fairness
                ELSE NULL
              END
            ),
            s_fouls = COALESCE(
              s_fouls,
              CASE
                WHEN respect BETWEEN 1 AND 5 THEN respect - 1
                WHEN respect BETWEEN 0 AND 4 THEN respect
                ELSE NULL
              END
            ),
            s_communication = COALESCE(
              s_communication,
              CASE
                WHEN communication BETWEEN 1 AND 5 THEN communication - 1
                WHEN communication BETWEEN 0 AND 4 THEN communication
                ELSE NULL
              END
            ),
            s_fairmind = COALESCE(
              s_fairmind,
              CASE
                WHEN overall BETWEEN 1 AND 5 THEN overall - 1
                WHEN overall BETWEEN 0 AND 4 THEN overall
                ELSE NULL
              END
            ),
            s_attitude = COALESCE(
              s_attitude,
              CASE
                WHEN overall BETWEEN 1 AND 5 THEN overall - 1
                WHEN overall BETWEEN 0 AND 4 THEN overall
                ELSE NULL
              END
            )
          WHERE s_rules IS NULL
             OR s_fouls IS NULL
             OR s_communication IS NULL
             OR s_fairmind IS NULL
             OR s_attitude IS NULL
        `);
    }

    if (hasLegacy) {
      await pool.query(`ALTER TABLE spirit_survey_response DROP COLUMN IF EXISTS fairness`);
      await pool.query(`ALTER TABLE spirit_survey_response DROP COLUMN IF EXISTS respect`);
      await pool.query(`ALTER TABLE spirit_survey_response DROP COLUMN IF EXISTS communication`);
      await pool.query(`ALTER TABLE spirit_survey_response DROP COLUMN IF EXISTS overall`);
    }

    await pool.query(`
      ALTER TABLE spirit_survey_response
      ALTER COLUMN s_rules SET NOT NULL,
      ALTER COLUMN s_fouls SET NOT NULL,
      ALTER COLUMN s_fairmind SET NOT NULL,
      ALTER COLUMN s_attitude SET NOT NULL,
      ALTER COLUMN s_communication SET NOT NULL
    `);

    await pool.query(`
      ALTER TABLE spirit_survey_response
      ADD CONSTRAINT spirit_s_scores_0_4 CHECK (
        s_rules BETWEEN 0 AND 4
        AND s_fouls BETWEEN 0 AND 4
        AND s_fairmind BETWEEN 0 AND 4
        AND s_attitude BETWEEN 0 AND 4
        AND s_communication BETWEEN 0 AND 4
      )
    `);
  }

  static async insert(row) {
    const {
      invite_id,
      game_id,
      torneo_id,
      responding_team_id,
      rated_team_id,
      comments,
      s_rules,
      s_fouls,
      s_fairmind,
      s_attitude,
      s_communication
    } = row;
    const r = await pool.query(
      `INSERT INTO spirit_survey_response (
        invite_id, game_id, torneo_id, responding_team_id, rated_team_id,
        comments, s_rules, s_fouls, s_fairmind, s_attitude, s_communication
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        invite_id,
        game_id,
        torneo_id,
        responding_team_id,
        rated_team_id,
        comments != null && String(comments).trim() !== '' ? String(comments).trim() : null,
        s_rules,
        s_fouls,
        s_fairmind,
        s_attitude,
        s_communication
      ]
    );
    return r.rows[0];
  }

  /** Todas las respuestas de espíritu del partido (como máximo dos: una por equipo calificado). */
  static async findByGameId(gameId) {
    const gid = parseInt(gameId, 10);
    if (!Number.isFinite(gid) || gid <= 0) return [];
    const r = await pool.query(
      `SELECT
         r.response_id,
         r.game_id,
         r.torneo_id,
         r.rated_team_id,
         r.responding_team_id,
         r.s_rules,
         r.s_fouls,
         r.s_fairmind,
         r.s_attitude,
         r.s_communication,
         r.comments,
         t.name AS rated_team_name,
         t.url_imagen AS rated_team_image
       FROM spirit_survey_response r
       LEFT JOIN team t ON t.team_id = r.rated_team_id AND t.torneo_id = r.torneo_id
       WHERE r.game_id = $1
       ORDER BY r.rated_team_id`,
      [gid]
    );
    return r.rows;
  }

  /** Promedios por equipo calificado (rival). Escala 0–4. */
  static async aggregateByRatedTeamForTournament(torneoId, division) {
    const divNorm =
      division != null && String(division).trim() !== '' && String(division).toLowerCase() !== '__all__'
        ? String(division).trim()
        : null;
    const r = await pool.query(
      `SELECT
         r.rated_team_id,
         t.name AS rated_team_name,
         t.url_imagen AS rated_team_image,
         COUNT(*)::int AS response_count,
         ROUND(AVG(r.s_rules::numeric), 2) AS avg_rules,
         ROUND(AVG(r.s_fouls::numeric), 2) AS avg_fouls,
         ROUND(AVG(r.s_fairmind::numeric), 2) AS avg_fairmind,
         ROUND(AVG(r.s_attitude::numeric), 2) AS avg_attitude,
         ROUND(AVG(r.s_communication::numeric), 2) AS avg_communication,
         ROUND((
           AVG(r.s_rules::numeric) +
           AVG(r.s_fouls::numeric) +
           AVG(r.s_fairmind::numeric) +
           AVG(r.s_attitude::numeric) +
           AVG(r.s_communication::numeric)
         ) / 5.0, 2) AS avg_spirit
       FROM spirit_survey_response r
       LEFT JOIN team t ON t.team_id = r.rated_team_id AND t.torneo_id = r.torneo_id
       WHERE r.torneo_id = $1
         AND ($2::text IS NULL OR TRIM(COALESCE(t.division, '')) = $2)
       GROUP BY r.rated_team_id, t.name, t.url_imagen
       ORDER BY avg_spirit DESC NULLS LAST, r.rated_team_id`,
      [torneoId, divNorm]
    );
    return r.rows;
  }
}

module.exports = SpiritSurveyResponse;
