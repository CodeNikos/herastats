const pool = require('../config/database');
const Game = require('../models/Game');
const SpiritSurveyInvite = require('../models/SpiritSurveyInvite');
const SpiritSurveyResponse = require('../models/SpiritSurveyResponse');
const TournamentConfig = require('../models/TournamentConfig');
const { hashSpiritSurveyToken } = require('../utils/spiritSurveyToken');
const { hasGlobalTournamentAccess } = require('../utils/userRoles');
const { assertTournamentEditAccess } = require('../services/tournamentAccess');

function isFinishedEstadoForSpirit(estado) {
  return Game.estadoAllowsSpiritSurveyManual(estado);
}

function parseScore0to4(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 4) return null;
  return n;
}

const getSpiritInvite = async (req, res) => {
  try {
    const token = req.query.token;
    if (!token || String(token).trim() === '') {
      return res.status(400).json({ success: false, message: 'Falta token' });
    }
    const hash = hashSpiritSurveyToken(String(token).trim());
    const row = await SpiritSurveyInvite.findByTokenHash(hash);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Enlace no válido' });
    }
    if (row.completed_at) {
      return res.json({
        success: true,
        data: {
          completed: true,
          localTeamName: row.local_name,
          visitorTeamName: row.visitor_name
        }
      });
    }
    const exp = new Date(row.expires_at);
    if (exp.getTime() < Date.now()) {
      return res.status(410).json({ success: false, message: 'Este enlace ha expirado' });
    }
    return res.json({
      success: true,
      data: {
        completed: false,
        localTeamName: row.local_name,
        visitorTeamName: row.visitor_name,
        ratedTeamName: row.rated_team_name,
        respondingTeamName: row.responding_team_name,
        expiresAt: row.expires_at
      }
    });
  } catch (error) {
    console.error('getSpiritInvite:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al cargar la encuesta'
    });
  }
};

const postSpiritRespond = async (req, res) => {
  try {
    const token = req.body?.token;
    if (!token || String(token).trim() === '') {
      return res.status(400).json({ success: false, message: 'Falta token' });
    }
    const rules = parseScore0to4(req.body?.s_rules ?? req.body?.rules);
    const fouls = parseScore0to4(req.body?.s_fouls ?? req.body?.fouls);
    const fairmind = parseScore0to4(req.body?.s_fairmind ?? req.body?.fairmind);
    const attitude = parseScore0to4(req.body?.s_attitude ?? req.body?.attitude);
    const comm = parseScore0to4(req.body?.s_communication ?? req.body?.communication);
    if (rules == null || fouls == null || fairmind == null || attitude == null || comm == null) {
      return res.status(400).json({
        success: false,
        message: 'Las cinco puntuaciones deben ser enteros entre 0 y 4'
      });
    }
    const comments = req.body?.comments != null ? String(req.body.comments).slice(0, 4000) : null;

    const hash = hashSpiritSurveyToken(String(token).trim());
    const invite = await SpiritSurveyInvite.findByTokenHash(hash);
    if (!invite) {
      return res.status(404).json({ success: false, message: 'Enlace no válido' });
    }
    if (invite.completed_at) {
      return res.status(409).json({ success: false, message: 'Esta encuesta ya fue enviada' });
    }
    const exp = new Date(invite.expires_at);
    if (exp.getTime() < Date.now()) {
      return res.status(410).json({ success: false, message: 'Este enlace ha expirado' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO spirit_survey_response (
          invite_id, game_id, torneo_id, responding_team_id, rated_team_id,
          comments, s_rules, s_fouls, s_fairmind, s_attitude, s_communication
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          invite.invite_id,
          invite.game_id,
          invite.torneo_id,
          invite.responding_team_id,
          invite.rated_team_id,
          comments && comments.trim() !== '' ? comments.trim() : null,
          rules,
          fouls,
          fairmind,
          attitude,
          comm
        ]
      );
      await client.query(
        `UPDATE spirit_survey_invite SET completed_at = CURRENT_TIMESTAMP WHERE invite_id = $1`,
        [invite.invite_id]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23505') {
        return res.status(409).json({ success: false, message: 'Esta encuesta ya fue enviada' });
      }
      throw e;
    } finally {
      client.release();
    }

    return res.status(201).json({ success: true, message: 'Gracias. Tu respuesta fue registrada.' });
  } catch (error) {
    console.error('postSpiritRespond:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al guardar la encuesta'
    });
  }
};

function mapSpiritResponseToReceivedPayload(row) {
  if (!row) return null;
  const rules = Number(row.s_rules);
  const fouls = Number(row.s_fouls);
  const fairmind = Number(row.s_fairmind);
  const attitude = Number(row.s_attitude);
  const communication = Number(row.s_communication);
  const parts = [rules, fouls, fairmind, attitude, communication];
  if (parts.some((n) => !Number.isFinite(n))) return null;
  const total = parts.reduce((sum, n) => sum + n, 0);
  const c = row.comments != null ? String(row.comments).trim() : '';
  return {
    rules,
    fouls,
    fairmind,
    attitude,
    communication,
    total,
    comments: c !== '' ? c : null
  };
}

/**
 * GET público (como eventos del partido): puntuaciones recibidas por cada equipo en este juego.
 */
const getGameSpiritScores = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const gameId = parseInt(req.params.gameId, 10);
    if (!Number.isFinite(tournamentId) || tournamentId <= 0 || !Number.isFinite(gameId) || gameId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Identificadores de torneo o partido inválidos'
      });
    }

    const game = await Game.findById(gameId);
    if (!game || Number(game.torneo_id) !== tournamentId) {
      return res.status(404).json({
        success: false,
        message: 'Partido no encontrado en este torneo'
      });
    }

    const rows = await Game.getSpiritSurveyResponsesByGameId(gameId);
    const byRated = new Map(rows.map((r) => [Number(r.rated_team_id), r]));
    const localId = game.local != null ? Number(game.local) : null;
    const visitorId = game.visitor != null ? Number(game.visitor) : null;
    const localRow = localId != null ? byRated.get(localId) : null;
    const visitorRow = visitorId != null ? byRated.get(visitorId) : null;

    return res.json({
      success: true,
      data: {
        localTeamId: localId,
        visitorTeamId: visitorId,
        localName: game.local_name || null,
        visitorName: game.visitor_name || null,
        localImage: game.local_image || null,
        visitorImage: game.visitor_image || null,
        localReceived: mapSpiritResponseToReceivedPayload(localRow),
        visitorReceived: mapSpiritResponseToReceivedPayload(visitorRow)
      }
    });
  } catch (error) {
    console.error('getGameSpiritScores:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener puntuaciones de espíritu del partido'
    });
  }
};

/**
 * POST autenticado: el organizador registra la misma encuesta que el enlace público,
 * cuando el equipo no tenía correo o no llegó la invitación.
 */
const postSpiritSurveyManual = async (req, res) => {
  try {
    const tournamentRaw =
      req.params?.id ?? req.body?.torneo_id ?? req.body?.tournament_id ?? req.body?.tournamentId;
    const gameRaw = req.params?.gameId ?? req.body?.game_id ?? req.body?.gameId;

    const tournamentId = parseInt(tournamentRaw, 10);
    const gameId = parseInt(gameRaw, 10);
    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
      return res.status(400).json({ success: false, message: 'ID de torneo inválido' });
    }
    if (!Number.isFinite(gameId) || gameId <= 0) {
      return res.status(400).json({ success: false, message: 'ID de partido inválido' });
    }

    const access = await assertTournamentEditAccess(req, tournamentId);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const respondingTeamId = parseInt(req.body?.responding_team_id, 10);
    if (!Number.isFinite(respondingTeamId) || respondingTeamId <= 0) {
      return res.status(400).json({ success: false, message: 'responding_team_id inválido' });
    }

    const rules = parseScore0to4(req.body?.s_rules ?? req.body?.rules);
    const fouls = parseScore0to4(req.body?.s_fouls ?? req.body?.fouls);
    const fairmind = parseScore0to4(req.body?.s_fairmind ?? req.body?.fairmind);
    const attitude = parseScore0to4(req.body?.s_attitude ?? req.body?.attitude);
    const comm = parseScore0to4(req.body?.s_communication ?? req.body?.communication);
    if (rules == null || fouls == null || fairmind == null || attitude == null || comm == null) {
      return res.status(400).json({
        success: false,
        message: 'Las cinco puntuaciones deben ser enteros entre 0 y 4'
      });
    }
    const comments =
      req.body?.comments != null ? String(req.body.comments).slice(0, 4000) : null;

    const game = await Game.findById(gameId);
    if (!game || Number(game.torneo_id) !== tournamentId) {
      /** 422: no es “URL inexistente”, evita confusion con 404 por despliegue / proxy. */
      return res.status(422).json({ success: false, message: 'Partido no encontrado en este torneo' });
    }

    const estadoNorm = game.estado ?? game.Estado;
    if (!isFinishedEstadoForSpirit(estadoNorm)) {
      return res.status(400).json({
        success: false,
        message: 'Solo se puede registrar tras finalizar el partido'
      });
    }

    const localId = game.local != null ? Number(game.local) : NaN;
    const visitorId = game.visitor != null ? Number(game.visitor) : NaN;
    if (
      !Number.isFinite(localId) ||
      !Number.isFinite(visitorId) ||
      localId <= 0 ||
      visitorId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'El partido no tiene equipos local y visitante asignados'
      });
    }

    if (respondingTeamId !== localId && respondingTeamId !== visitorId) {
      return res.status(400).json({
        success: false,
        message: 'responding_team_id no corresponde a un equipo del partido'
      });
    }

    const ratedTeamId = respondingTeamId === localId ? visitorId : localId;

    let invite = await SpiritSurveyInvite.findByGameAndResponder(gameId, respondingTeamId);
    if (!invite) {
      const inserted = await SpiritSurveyInvite.insertManualInvite({
        game_id: gameId,
        torneo_id: tournamentId,
        responding_team_id: respondingTeamId,
        rated_team_id: ratedTeamId
      });
      invite = inserted || (await SpiritSurveyInvite.findByGameAndResponder(gameId, respondingTeamId));
    }

    if (!invite) {
      return res.status(500).json({ success: false, message: 'No se pudo crear la invitación de encuesta' });
    }

    if (
      Number(invite.responding_team_id) !== respondingTeamId ||
      Number(invite.rated_team_id) !== ratedTeamId
    ) {
      return res.status(409).json({
        success: false,
        message: 'Hay una invitación guardada incompatible con estos equipos. Contacta soporte.'
      });
    }

    if (invite.completed_at) {
      return res.status(409).json({ success: false, message: 'Esta encuesta ya fue registrada' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO spirit_survey_response (
          invite_id, game_id, torneo_id, responding_team_id, rated_team_id,
          comments, s_rules, s_fouls, s_fairmind, s_attitude, s_communication
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          invite.invite_id,
          gameId,
          tournamentId,
          respondingTeamId,
          ratedTeamId,
          comments && comments.trim() !== '' ? comments.trim() : null,
          rules,
          fouls,
          fairmind,
          attitude,
          comm
        ]
      );
      await client.query(
        `UPDATE spirit_survey_invite SET completed_at = CURRENT_TIMESTAMP WHERE invite_id = $1 AND completed_at IS NULL`,
        [invite.invite_id]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23505') {
        return res.status(409).json({ success: false, message: 'Esta encuesta ya fue enviada' });
      }
      throw e;
    } finally {
      client.release();
    }

    return res.status(201).json({ success: true, message: 'Encuesta registrada correctamente.' });
  } catch (error) {
    console.error('postSpiritSurveyManual:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al guardar la encuesta'
    });
  }
};

const getTournamentSpiritStats = async (req, res) => {
  try {
    const userEmail = req.user?.email;
    const userRole = req.user?.role;
    if (!userEmail) {
      return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
    }
    const tournamentId = parseInt(req.params.id, 10);
    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
      return res.status(400).json({ success: false, message: 'ID de torneo inválido' });
    }
    const tournament = await TournamentConfig.findById(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, message: 'Torneo no encontrado' });
    }
    const isOwner =
      String(tournament.created_by || '').toLowerCase() === String(userEmail).toLowerCase();
    if (!isOwner && !hasGlobalTournamentAccess(userRole)) {
      return res.status(403).json({ success: false, message: 'No autorizado para este torneo' });
    }

    const divisionRaw = req.query?.division;
    const division =
      divisionRaw != null &&
      String(divisionRaw).trim() !== '' &&
      String(divisionRaw).toLowerCase() !== '__all__'
        ? String(divisionRaw).trim()
        : null;

    const rows = await SpiritSurveyResponse.aggregateByRatedTeamForTournament(tournamentId, division);
    return res.json({
      success: true,
      data: { spiritStats: rows }
    });
  } catch (error) {
    console.error('getTournamentSpiritStats:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas de espíritu'
    });
  }
};

module.exports = {
  getSpiritInvite,
  postSpiritRespond,
  postSpiritSurveyManual,
  getTournamentSpiritStats,
  getGameSpiritScores
};
