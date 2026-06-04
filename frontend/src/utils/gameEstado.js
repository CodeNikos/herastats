/**
 * Reglas canónicas de estado de partido (alineadas con backend/utils/gameEstado.js).
 */

export function normalizeGameEstado(estado) {
  return String(estado ?? '').trim().toLowerCase();
}

export function isFinishedGameEstado(estado) {
  const s = normalizeGameEstado(estado);
  return s === 'finished' || s === 'finalizado' || s === 'completed';
}

/** Alias usado en reloj en vivo y anotación. */
export function isGameFinishedState(estado) {
  return isFinishedGameEstado(estado);
}

export function isGameOngoingState(estado) {
  const s = normalizeGameEstado(estado);
  return s === 'ongoing' || s === 'en curso';
}

export function isGameUpcomingState(estado) {
  const s = normalizeGameEstado(estado);
  return s === 'upcoming' || s === 'programado' || s === 'scheduled';
}

export function pickEstadoFromGame(game) {
  if (!game || typeof game !== 'object') return '';
  const raw = game.estado ?? game.Estado ?? game.estatus;
  if (raw === null || raw === undefined) return '';
  const s = String(raw).trim();
  return s === '' ? '' : s;
}
