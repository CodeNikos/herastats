import { FIFA_WC_TOURNAMENT_ID } from '../config/fifaWcConfig';
import { FOOTBALL_SPORT_ID } from './footballEventTypes';

/** @deprecated Usar FIFA_WC_TOURNAMENT_ID desde fifaWcConfig */
export const FIFA_WC_BRACKET_TOURNAMENT_ID = FIFA_WC_TOURNAMENT_ID;

const toPositiveInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Auto-asignación de mejores terceros (3X, Anexo C): torneo WC configurado y sport_id = 2. */
export function usesFifaWorldCupBracketAutoSlots({ tournamentId, sportId } = {}) {
  const tid = toPositiveInt(tournamentId);
  const sid = toPositiveInt(sportId);
  return sid === FOOTBALL_SPORT_ID && tid === FIFA_WC_TOURNAMENT_ID;
}

/**
 * @returns {'fifa-wc' | 'none'}
 * Otros torneos de fútbol: cruces 1A/2B se configuran manualmente en Loc./Vis.
 */
export function getFootballBracketSlotMode({ tournamentId, sportId } = {}) {
  if (usesFifaWorldCupBracketAutoSlots({ tournamentId, sportId })) return 'fifa-wc';
  return 'none';
}
