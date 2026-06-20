const crypto = require('crypto');
const Game = require('../models/Game');
const Team = require('../models/Team');
const SpiritSurveyInvite = require('../models/SpiritSurveyInvite');
const { hashSpiritSurveyToken } = require('../utils/spiritSurveyToken');
const { sendSpiritSurveyEmail } = require('./mailService');

function isFinishedEstado(estado) {
  return Game.estadoAllowsSpiritSurveyManual(estado);
}

const DEFAULT_EXPIRY_DAYS = 14;

/**
 * Tras marcar un partido como Finished: crea invitaciones (si no existen) y envía correo a cada representante.
 * No lanza hacia el cliente; errores solo en log.
 * @param {number} tournamentId
 * @param {number} gameId
 */
async function maybeSendSpiritInvitesAfterGameFinished(tournamentId, gameId) {
  try {
    if (!(await Game.tournamentAllowsSpiritSurvey(tournamentId))) {
      return;
    }

    const game = await Game.findById(gameId);
    if (!game || Number(game.torneo_id) !== Number(tournamentId)) {
      console.warn('[spirit-survey] omitido: partido no encontrado o torneo distinto', { tournamentId, gameId });
      return;
    }
    if (!isFinishedEstado(game.estado)) {
      console.warn('[spirit-survey] omitido: estado del partido no es Finished (actual:', game.estado, ') game_id=', gameId);
      return;
    }

    console.log('[spirit-survey] Procesando invitaciones tras Finished — torneo', tournamentId, 'partido', gameId);

    const localId = game.local != null ? Number(game.local) : null;
    const visitorId = game.visitor != null ? Number(game.visitor) : null;
    if (!localId || !visitorId || Number.isNaN(localId) || Number.isNaN(visitorId)) {
      console.warn('[spirit-survey] Partido sin local/visitor; no se envían encuestas.', gameId);
      return;
    }

    const localName = String(game.local_name || 'Local').trim();
    const visitorName = String(game.visitor_name || 'Visitante').trim();

    const sides = [
      { responding: localId, rated: visitorId, respondentLabel: localName },
      { responding: visitorId, rated: localId, respondentLabel: visitorName }
    ];

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + DEFAULT_EXPIRY_DAYS);

    for (const side of sides) {
      const existing = await SpiritSurveyInvite.findByGameAndResponder(gameId, side.responding);
      if (existing) {
        console.log(
          '[spirit-survey] Ya existía invitación para team',
          side.responding,
          'game',
          gameId,
          '— no se reenvía correo'
        );
        continue;
      }

      const teamRow = await Team.findByIdAndTorneo(side.responding, tournamentId);
      const email =
        teamRow?.representative_email && String(teamRow.representative_email).trim() !== ''
          ? String(teamRow.representative_email).trim()
          : '';
      if (!email) {
        console.warn(
          '[spirit-survey] Equipo sin representative_email; omiso. team_id=',
          side.responding,
          'game_id=',
          gameId
        );
        continue;
      }

      const ratedRow = await Team.findByIdAndTorneo(side.rated, tournamentId);
      const ratedTeamName = ratedRow?.name ? String(ratedRow.name).trim() : 'Rival';

      const plainToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashSpiritSurveyToken(plainToken);

      const inserted = await SpiritSurveyInvite.insert({
        game_id: gameId,
        torneo_id: tournamentId,
        responding_team_id: side.responding,
        rated_team_id: side.rated,
        recipient_email: email,
        token_hash: tokenHash,
        channel: 'email',
        expires_at: expiresAt
      });

      if (!inserted) {
        console.log('[spirit-survey] No se insertó invitación (posible condición de carrera o conflicto). team', side.responding);
        continue;
      }

      try {
        const sendResult = await sendSpiritSurveyEmail({
          to: email,
          plainToken,
          localName,
          visitorName,
          ratedTeamName,
          respondentLabel: side.respondentLabel
        });
        if (sendResult?.skipped) {
          console.warn(
            '[spirit-survey] SMTP no configurado o incompleto — invitación guardada pero sin envío. Destino:',
            email,
            'URL para prueba:',
            sendResult.link
          );
        } else {
          console.log('[spirit-survey] Correo enviado a', email, '(partido', gameId, ')');
        }
      } catch (e) {
        console.error('[spirit-survey] Error enviando correo a', email, ':', e.message || e);
      }
    }
  } catch (e) {
    console.error('[spirit-survey] maybeSendSpiritInvitesAfterGameFinished:', e);
  }
}

module.exports = { maybeSendSpiritInvitesAfterGameFinished, isFinishedEstado };
