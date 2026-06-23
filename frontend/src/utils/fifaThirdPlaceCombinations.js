/**
 * Combinaciones FIFA para 8 mejores terceros (12 grupos A–L → C(12,8) = 495).
 * Cada combinación define qué 3.º enfrenta a 1A, 1B, 1D, 1E, 1G, 1I, 1K, 1L en dieciseisavos.
 * Restricción: ningún 3X puede jugar contra 1X del mismo grupo.
 */

import { ANNEX_C_ROWS, FIFA_R32_WINNER_GROUPS } from './fifaAnnexCRows.data';

export { FIFA_R32_WINNER_GROUPS };

export const FIFA_THIRD_PLACE_START_ID = 488;

export function buildFifaQualificationKey(groupLetters) {
  const letters = (groupLetters || [])
    .map((g) => String(g).trim().toUpperCase())
    .filter((g) => /^[A-Z]$/.test(g));
  if (letters.length === 0) return '';
  return [...new Set(letters)].sort((a, b) => a.localeCompare(b, 'en')).join('');
}

/**
 * Genera las 495 combinaciones a partir del Anexo C oficial.
 */
export function generateFifaThirdPlaceCombinations() {
  const combinations = [];
  let matchId = FIFA_THIRD_PLACE_START_ID;

  for (const row of ANNEX_C_ROWS) {
    const letters = String(row).split('');
    const combinationKey = buildFifaQualificationKey(letters);
    const slots = {};

    FIFA_R32_WINNER_GROUPS.forEach((winnerGroup, index) => {
      slots[`slot1${winnerGroup}`] = `3${letters[index]}`;
    });

    combinations.push({
      id: matchId,
      combinationKey,
      rowLetters: row,
      slots
    });

    matchId += 1;
  }

  return combinations;
}

export const FIFA_COMBINATIONS = generateFifaThirdPlaceCombinations();

const FIFA_COMBINATION_BY_KEY = new Map(
  FIFA_COMBINATIONS.map((entry) => [entry.combinationKey, entry])
);

export function lookupFifaThirdPlaceCombination(groupLetters) {
  const key = buildFifaQualificationKey(groupLetters);
  if (!key || key.length !== 8) return null;
  return FIFA_COMBINATION_BY_KEY.get(key) || null;
}

/** Comprueba que ningún 3X esté emparejado con 1X del mismo grupo. */
export function validateFifaCombinationSlots(slots) {
  for (const winnerGroup of FIFA_R32_WINNER_GROUPS) {
    const thirdSlot = slots?.[`slot1${winnerGroup}`];
    if (!thirdSlot) return false;
    const thirdGroup = String(thirdSlot).replace(/^3/, '').toUpperCase();
    if (thirdGroup === winnerGroup) return false;
  }
  return true;
}

/** Descriptores de cruces 1X vs 3Y para la llave de dieciseisavos. */
export function getR32MatchupDescriptors(fifaCombination) {
  if (!fifaCombination?.slots) return [];

  return FIFA_R32_WINNER_GROUPS.map((winnerGroup) => {
    const thirdSlot = fifaCombination.slots[`slot1${winnerGroup}`];
    const thirdGroup = String(thirdSlot || '')
      .replace(/^3/, '')
      .toUpperCase();

    return {
      winnerSlot: `1${winnerGroup}`,
      thirdSlot,
      thirdGroup,
      matchupLabel: `1${winnerGroup} vs ${thirdSlot}`,
      sameGroupViolation: thirdGroup === winnerGroup
    };
  });
}
