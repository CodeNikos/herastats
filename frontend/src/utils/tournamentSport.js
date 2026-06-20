import { FOOTBALL_SPORT_ID } from './footballEventTypes';

export { FOOTBALL_SPORT_ID };

/** @param {unknown} value */
export function isFootballSportName(value) {
  const text = String(value || '').trim().toLowerCase();
  return (
    text.includes('futbol') ||
    text.includes('fútbol') ||
    text.includes('football') ||
    text.includes('soccer')
  );
}

/**
 * Determina si un torneo es de fútbol por sport_id (preferido) o nombre del deporte.
 * @param {{ sportId?: unknown, sportName?: unknown, sport_id?: unknown, sport_name?: unknown }} input
 */
export function isFootballSport(input = {}) {
  const sportId = input.sportId ?? input.sport_id;
  if (sportId != null && Number(sportId) === FOOTBALL_SPORT_ID) {
    return true;
  }
  const sportName = input.sportName ?? input.sport_name;
  return isFootballSportName(sportName);
}
