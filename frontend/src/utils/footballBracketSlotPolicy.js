import { FOOTBALL_SPORT_ID } from './footballEventTypes';

/**
 * Torneo con formato Copa del Mundo (12 grupos, mejores terceros, Anexo C FIFA).
 * Debe coincidir con TOURNAMENT_2_SYNC_TARGET_TOURNAMENT_ID del backend (local: 2, prod: suele ser 3).
 */
const parsePositiveInt = (value, fallback) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export const FIFA_WC_BRACKET_TOURNAMENT_ID = parsePositiveInt(
  process.env.REACT_APP_FIFA_WC_TOURNAMENT_ID,
  2
);

const toPositiveInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Auto-asignación de mejores terceros (3X, Anexo C): solo torneo 2 y sport_id = 2. */
export function usesFifaWorldCupBracketAutoSlots({ tournamentId, sportId } = {}) {
  const tid = toPositiveInt(tournamentId);
  const sid = toPositiveInt(sportId);
  return sid === FOOTBALL_SPORT_ID && tid === FIFA_WC_BRACKET_TOURNAMENT_ID;
}

/**
 * @returns {'fifa-wc' | 'none'}
 * Otros torneos de fútbol: cruces 1A/2B se configuran manualmente en Loc./Vis.
 */
export function getFootballBracketSlotMode({ tournamentId, sportId } = {}) {
  if (usesFifaWorldCupBracketAutoSlots({ tournamentId, sportId })) return 'fifa-wc';
  return 'none';
}
