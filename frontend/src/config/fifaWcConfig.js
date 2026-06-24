/**
 * Torneo Copa del Mundo (mejores terceros, Anexo C FIFA).
 * Debe coincidir con TOURNAMENT_2_SYNC_TARGET_TOURNAMENT_ID del backend.
 * Local: 2 por defecto. Producción: REACT_APP_FIFA_WC_TOURNAMENT_ID (p. ej. 3).
 */

const DEFAULT_FIFA_WC_TOURNAMENT_ID = 2;

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function resolveFifaWcTournamentId() {
  return parsePositiveInt(process.env.REACT_APP_FIFA_WC_TOURNAMENT_ID, DEFAULT_FIFA_WC_TOURNAMENT_ID);
}

export const FIFA_WC_TOURNAMENT_ID = resolveFifaWcTournamentId();
