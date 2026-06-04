const GameEvent = require('../models/GameEvent');
const { isFinishedGameEstado } = require('../utils/gameEstado');

const MUTABLE_EVENT_TYPES = new Set([
  'GOAL',
  'AST',
  'HALF',
  'BREAK',
  'JUEGO EN PAUSA',
  'JUEGO REANUDADO',
  'START'
]);

function httpGameEventError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * Impide eventos mutables en partidos ya cerrados.
 * @param {number} gameId
 * @param {object} game
 * @param {string} normalizedType
 */
async function assertGameAcceptsEventType(gameId, game, normalizedType) {
  if (!MUTABLE_EVENT_TYPES.has(normalizedType)) return;

  if (isFinishedGameEstado(game.estado)) {
    throw httpGameEventError(409, 'No se pueden registrar eventos en un partido finalizado');
  }
  if (await GameEvent.hasGameFinishedMarker(gameId)) {
    throw httpGameEventError(409, 'Este partido ya tiene un evento Juego Finalizado registrado');
  }
}

module.exports = {
  assertGameAcceptsEventType,
  MUTABLE_EVENT_TYPES
};
