const GameEvent = require('../models/GameEvent');
const TournamentConfig = require('../models/TournamentConfig');
const { isFinishedGameEstado } = require('../utils/gameEstado');
const {
  FOOTBALL_SPORT_ID,
  FOOTBALL_POST_MATCH_EVENT_TYPES,
  isAdminOrSuperuserRole
} = require('../utils/footballEventTypes');

const MUTABLE_EVENT_TYPES = new Set([
  'GOAL',
  'AST',
  'HALF',
  'BREAK',
  'JUEGO EN PAUSA',
  'JUEGO REANUDADO',
  'START',
  'OWN_GOAL',
  'YELLOW_CARD',
  'RED_CARD',
  'PENALTY'
]);

function httpGameEventError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * Impide eventos mutables en partidos ya cerrados (salvo fútbol post-partido por admin/superuser).
 * @param {number} gameId
 * @param {object} game
 * @param {string} normalizedType
 * @param {{ userRole?: string, tournamentSportId?: number|null }} [options]
 */
async function assertGameAcceptsEventType(gameId, game, normalizedType, options = {}) {
  const isFootballScoringEvent = FOOTBALL_POST_MATCH_EVENT_TYPES.has(normalizedType);
  const sportId =
    options.tournamentSportId != null
      ? Number(options.tournamentSportId)
      : null;
  const isFootballTournament = Number.isFinite(sportId) && sportId === FOOTBALL_SPORT_ID;
  const finished = isFinishedGameEstado(game.estado);
  const hasFinishedMarker = await GameEvent.hasGameFinishedMarker(gameId);

  if (isFootballScoringEvent && isFootballTournament && isAdminOrSuperuserRole(options.userRole)) {
    return;
  }

  if (!MUTABLE_EVENT_TYPES.has(normalizedType)) return;

  if (finished) {
    throw httpGameEventError(409, 'No se pueden registrar eventos en un partido finalizado');
  }
  if (hasFinishedMarker) {
    throw httpGameEventError(409, 'Este partido ya tiene un evento Juego Finalizado registrado');
  }
}

/**
 * @param {number} tournamentId
 * @returns {Promise<number|null>}
 */
async function resolveTournamentSportId(tournamentId) {
  const tournament = await TournamentConfig.findById(tournamentId);
  if (!tournament || tournament.sport_id == null) return null;
  const n = Number(tournament.sport_id);
  return Number.isFinite(n) ? n : null;
}

module.exports = {
  assertGameAcceptsEventType,
  resolveTournamentSportId,
  MUTABLE_EVENT_TYPES
};
