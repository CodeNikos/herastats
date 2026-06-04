const crypto = require('crypto');
const pool = require('../config/database');
const { hashSpiritSurveyToken } = require('../utils/spiritSurveyToken');

/** Correo marcador cuando el organizador registra la encuesta a mano (sin envío por email). */
const MANUAL_RECIPIENT_EMAIL = 'manual-entry@spirit.herastats';

const MANUAL_EXPIRY_DAYS = 14;

class SpiritSurveyInvite {
  static async createTable() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS spirit_survey_invite (
        invite_id SERIAL PRIMARY KEY,
        game_id INTEGER NOT NULL REFERENCES game(game_id) ON DELETE CASCADE,
        torneo_id INTEGER NOT NULL REFERENCES torneo(torneo_id) ON DELETE CASCADE,
        responding_team_id INTEGER NOT NULL REFERENCES team(team_id) ON DELETE CASCADE,
        rated_team_id INTEGER NOT NULL REFERENCES team(team_id) ON DELETE CASCADE,
        recipient_email VARCHAR(255) NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        channel VARCHAR(32) DEFAULT 'email',
        sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ,
        reminder_count INTEGER DEFAULT 0
      )
    `);
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS spirit_survey_invite_token_hash_uq ON spirit_survey_invite(token_hash)`
    );
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS spirit_survey_invite_game_responder_uq ON spirit_survey_invite(game_id, responding_team_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS spirit_survey_invite_tor_game_idx ON spirit_survey_invite(torneo_id, game_id)`
    );
  }

  /**
   * @returns {Promise<object|null>}
   */
  static async findByTokenHash(tokenHash) {
    const r = await pool.query(
      `SELECT i.*,
              lt.name AS local_name,
              vt.name AS visitor_name,
              g.game_date,
              g.game_time,
              rt.name AS rated_team_name,
              st.name AS responding_team_name
       FROM spirit_survey_invite i
       INNER JOIN game g ON g.game_id = i.game_id
       LEFT JOIN team vt ON vt.team_id = g.visitor AND vt.torneo_id = g.torneo_id
       LEFT JOIN team lt ON lt.team_id = g."local" AND lt.torneo_id = g.torneo_id
       LEFT JOIN team rt ON rt.team_id = i.rated_team_id AND rt.torneo_id = i.torneo_id
       LEFT JOIN team st ON st.team_id = i.responding_team_id AND st.torneo_id = i.torneo_id
       WHERE i.token_hash = $1`,
      [tokenHash]
    );
    return r.rows[0] || null;
  }

  static async findByGameAndResponder(gameId, respondingTeamId) {
    const r = await pool.query(
      `SELECT * FROM spirit_survey_invite WHERE game_id = $1 AND responding_team_id = $2 LIMIT 1`,
      [gameId, respondingTeamId]
    );
    return r.rows[0] || null;
  }

  static async insert(row) {
    const {
      game_id,
      torneo_id,
      responding_team_id,
      rated_team_id,
      recipient_email,
      token_hash,
      channel,
      expires_at
    } = row;
    const r = await pool.query(
      `INSERT INTO spirit_survey_invite (
        game_id, torneo_id, responding_team_id, rated_team_id,
        recipient_email, token_hash, channel, expires_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (game_id, responding_team_id) DO NOTHING
      RETURNING *`,
      [
        game_id,
        torneo_id,
        responding_team_id,
        rated_team_id,
        recipient_email,
        token_hash,
        channel || 'email',
        expires_at
      ]
    );
    return r.rows[0] || null;
  }

  static async markCompleted(inviteId) {
    const r = await pool.query(
      `UPDATE spirit_survey_invite SET completed_at = CURRENT_TIMESTAMP WHERE invite_id = $1 AND completed_at IS NULL RETURNING *`,
      [inviteId]
    );
    return r.rows[0] || null;
  }

  /**
   * Invitación para encuesta cargada manualmente por el organizador (sin correo del equipo).
   * @param {{ game_id: number, torneo_id: number, responding_team_id: number, rated_team_id: number }} row
   * @returns {Promise<object|null>}
   */
  static async insertManualInvite(row) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + MANUAL_EXPIRY_DAYS);

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashSpiritSurveyToken(plainToken);

    return SpiritSurveyInvite.insert({
      game_id: row.game_id,
      torneo_id: row.torneo_id,
      responding_team_id: row.responding_team_id,
      rated_team_id: row.rated_team_id,
      recipient_email: MANUAL_RECIPIENT_EMAIL,
      token_hash: tokenHash,
      channel: 'manual',
      expires_at: expiresAt
    });
  }
}

SpiritSurveyInvite.MANUAL_RECIPIENT_EMAIL = MANUAL_RECIPIENT_EMAIL;
module.exports = SpiritSurveyInvite;
