import { FOOTBALL_SPORT_ID } from './footballEventTypes';

/**
 * Torneo con formato Copa del Mundo (12 grupos, mejores terceros, Anexo C FIFA).
 * Coincide con TOURNAMENT_2_SYNC_TARGET_TOURNAMENT_ID del backend (por defecto 2).
 */
export const FIFA_WC_BRACKET_TOURNAMENT_ID = 2;

const toPositiveInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Llave FIFA WC26 (dieciseisavos + Anexo C): solo torneo 2 y sport_id = 2. */
export function usesFifaWorldCupBracketAutoSlots({ tournamentId, sportId } = {}) {
  const tid = toPositiveInt(tournamentId);
  const sid = toPositiveInt(sportId);
  return sid === FOOTBALL_SPORT_ID && tid === FIFA_WC_BRACKET_TOURNAMENT_ID;
}

/** Cruces clásicos 1A vs 2B, 1B vs 2A: fútbol (sport_id = 2) en cualquier otro torneo. */
export function usesStandardFootballBracketAutoSlots({ tournamentId, sportId } = {}) {
  const tid = toPositiveInt(tournamentId);
  const sid = toPositiveInt(sportId);
  return sid === FOOTBALL_SPORT_ID && tid != null && tid !== FIFA_WC_BRACKET_TOURNAMENT_ID;
}

/**
 * @returns {'fifa-wc' | 'standard' | 'none'}
 */
export function getFootballBracketSlotMode({ tournamentId, sportId } = {}) {
  if (usesFifaWorldCupBracketAutoSlots({ tournamentId, sportId })) return 'fifa-wc';
  if (usesStandardFootballBracketAutoSlots({ tournamentId, sportId })) return 'standard';
  return 'none';
}
