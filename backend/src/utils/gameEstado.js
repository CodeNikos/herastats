/**
 * Reglas canónicas de estado de partido (alineadas con frontend/src/utils/gameEstado.js).
 */

function normalizeGameEstado(estado) {
  return String(estado ?? '').trim().toLowerCase();
}

function isFinishedGameEstado(estado) {
  const s = normalizeGameEstado(estado);
  return s === 'finished' || s === 'finalizado' || s === 'completed';
}

function shouldRecordFinishedMarker(estadoTrim) {
  return isFinishedGameEstado(estadoTrim);
}

module.exports = {
  normalizeGameEstado,
  isFinishedGameEstado,
  shouldRecordFinishedMarker
};
