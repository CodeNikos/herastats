/**
 * Asignación automática en brackets de fútbol.
 * - Torneo WC (REACT_APP_FIFA_WC_TOURNAMENT_ID, sport 2): solo slots 3X según Anexo C FIFA.
 * - Resto de cruces (1A, 2B, 1C, 2F…): configuración manual en Loc./Vis.
 */

import { lookupFifaThirdPlaceCombination } from './fifaThirdPlaceCombinations';

/** Orden oficial de los 16 partidos de dieciseisavos (referencia FIFA WC26). */
export const FIFA_R32_MATCH_SLOT_TEMPLATE = Object.freeze([
  { local: '2A', visitor: '2B' },
  { local: '1E', visitorSlotKey: 'slot1E' },
  { local: '1F', visitor: '2C' },
  { local: '1C', visitor: '2F' },
  { local: '1I', visitorSlotKey: 'slot1I' },
  { local: '2E', visitor: '2I' },
  { local: '1A', visitorSlotKey: 'slot1A' },
  { local: '1L', visitorSlotKey: 'slot1L' },
  { local: '1D', visitorSlotKey: 'slot1D' },
  { local: '1G', visitorSlotKey: 'slot1G' },
  { local: '2K', visitor: '2L' },
  { local: '1H', visitor: '2J' },
  { local: '1B', visitorSlotKey: 'slot1B' },
  { local: '1J', visitor: '2H' },
  { local: '1K', visitorSlotKey: 'slot1K' },
  { local: '2D', visitor: '2G' }
]);

export function isDieciseisavosRoundTitle(title) {
  const text = String(title || '')
    .trim()
    .toLowerCase();
  return (
    text.includes('dieciseis') ||
    text.includes('16avos') ||
    text.includes('16 avos') ||
    text.includes('round of 32') ||
    text.includes('r32') ||
    text.includes('r-32')
  );
}

export function findDieciseisavosRoundIndex(rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) return -1;
  const byTitle = rounds.findIndex((round) => isDieciseisavosRoundTitle(round?.title));
  if (byTitle >= 0) return byTitle;
  return 0;
}

/** Slot de tercero de grupo: 3A, 3E… */
export function isThirdPlaceGroupSlot(slot) {
  const normalized = String(slot || '')
    .trim()
    .toUpperCase();
  return /^3[A-Z]$/.test(normalized);
}

export function buildFifaR32RoundSlotAssignments(fifaCombination) {
  return FIFA_R32_MATCH_SLOT_TEMPLATE.map((entry) => {
    let visitor = entry.visitor || null;
    if (entry.visitorSlotKey && fifaCombination?.slots) {
      visitor = fifaCombination.slots[entry.visitorSlotKey] || null;
    }
    return {
      local: entry.local,
      visitor
    };
  });
}

/**
 * Solo los 8 slots 3X del Anexo C (posición en dieciseisavos según plantilla FIFA).
 */
export function buildFifaThirdPlaceOnlyAssignments(fifaCombination) {
  return buildFifaR32RoundSlotAssignments(fifaCombination).map((entry) => ({
    local: isThirdPlaceGroupSlot(entry.local) ? entry.local : null,
    visitor: isThirdPlaceGroupSlot(entry.visitor) ? entry.visitor : null
  }));
}

const normSlot = (value) => (value == null ? '' : String(value).trim().toUpperCase());

const matchHasFixedTeamId = (match, sideIndex) => {
  const id = match?.teams?.[sideIndex]?.teamId;
  if (id == null || String(id).trim() === '') return false;
  const n = Number(id);
  return Number.isInteger(n) && n > 0;
};

const emptyTeamForSlot = () => ({
  teamId: '',
  name: 'Por Definir',
  seed: '-',
  flag: ''
});

const matchBracketOrder = (match, fallbackIndex) =>
  Number.isFinite(Number(match?.bracketOrder)) && Number(match.bracketOrder) > 0
    ? Number(match.bracketOrder)
    : fallbackIndex + 1;

export function applySlotAssignmentToMatch(match, assignment) {
  if (!assignment || !match) return { match, changed: false };

  let changed = false;
  const next = { ...match, teams: [...(match.teams || [])] };

  const tryAssignThirdPlaceSide = (sideIndex, slotValue) => {
    if (!slotValue || !isThirdPlaceGroupSlot(slotValue)) return;
    if (matchHasFixedTeamId(match, sideIndex)) return;

    const current = normSlot(sideIndex === 0 ? match.statsSlotLocal : match.statsSlotVisitor);
    const nextSlot = String(slotValue).trim().toUpperCase();

    // Solo huecos de mejores terceros: vacío o ya 3X. No tocar 1A, 2B, W#, L#, etc.
    if (current !== '' && !isThirdPlaceGroupSlot(current)) return;
    if (current === nextSlot) return;

    if (sideIndex === 0) {
      next.statsSlotLocal = nextSlot;
    } else {
      next.statsSlotVisitor = nextSlot;
    }
    next.teams[sideIndex] = emptyTeamForSlot();
    changed = true;
  };

  tryAssignThirdPlaceSide(0, assignment.local);
  tryAssignThirdPlaceSide(1, assignment.visitor);

  return { match: next, changed };
}

function applyAssignmentsToRound(round, assignments) {
  if (!round || !Array.isArray(assignments) || assignments.length === 0) {
    return { round, changed: false };
  }

  let anyChanged = false;
  const updatedMatches = (round.matches || []).map((match, index) => {
    const order = matchBracketOrder(match, index);
    const assignment = assignments[order - 1];
    if (!assignment) return match;
    const { match: nextMatch, changed } = applySlotAssignmentToMatch(match, assignment);
    if (changed) anyChanged = true;
    return nextMatch;
  });

  if (!anyChanged) return { round, changed: false };
  return { round: { ...round, matches: updatedMatches }, changed: true };
}

/**
 * Solo actualiza slots 3X (mejores terceros) en dieciseisavos según Anexo C.
 * No modifica 1A, 2B, 1C, 2F… ya configurados manualmente.
 */
export function applyFifaThirdPlaceSlotsOnlyToRounds(rounds, qualifiedThirdGroupLetters = []) {
  if (!Array.isArray(rounds) || rounds.length === 0) {
    return { rounds, changed: false };
  }

  const roundIndex = findDieciseisavosRoundIndex(rounds);
  if (roundIndex < 0) return { rounds, changed: false };

  const letters = (qualifiedThirdGroupLetters || [])
    .map((g) => String(g).trim().toUpperCase())
    .filter((g) => /^[A-Z]$/.test(g));

  if (letters.length !== 8) return { rounds, changed: false };

  const fifaCombination = lookupFifaThirdPlaceCombination(letters);
  if (!fifaCombination) return { rounds, changed: false };

  const assignments = buildFifaThirdPlaceOnlyAssignments(fifaCombination);
  const { round: updatedRound, changed } = applyAssignmentsToRound(rounds[roundIndex], assignments);

  if (!changed) return { rounds, changed: false };

  const nextRounds = rounds.map((item, index) => (index === roundIndex ? updatedRound : item));
  return { rounds: nextRounds, changed: true };
}

/**
 * Despacha auto-asignación de bracket de fútbol (solo mejores terceros en torneo WC).
 * @param {'fifa-wc' | 'none'} mode
 */
export function applyAutoFootballBracketSlotsToRounds(
  rounds,
  { mode, qualifiedThirdGroupLetters = [] } = {}
) {
  if (mode === 'fifa-wc') {
    return applyFifaThirdPlaceSlotsOnlyToRounds(rounds, qualifiedThirdGroupLetters);
  }
  return { rounds, changed: false };
}
