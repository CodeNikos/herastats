/**
 * Asignación automática de nomenclatura en brackets de fútbol.
 * - Torneo WC (id 2, sport 2): plantilla FIFA dieciseisavos + Anexo C.
 * - Otros torneos de fútbol: 1A vs 2B, 1B vs 2A por pares de grupos.
 */

import { lookupFifaThirdPlaceCombination } from './fifaThirdPlaceCombinations';

/** Orden oficial de los 16 partidos de dieciseisavos. */
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

/** Primera fase eliminatoria (playoffs, octavos, dieciseisavos…). */
export function findFirstKnockoutRoundIndex(rounds) {
  return findDieciseisavosRoundIndex(rounds);
}

/**
 * Cruces estándar por pares de grupos: A–B → 1A vs 2B y 1B vs 2A; C–D → 1C vs 2D y 1D vs 2C…
 */
export function buildStandardFootballRoundSlotAssignments(groupLetters = []) {
  const letters = [...new Set(
    (groupLetters || [])
      .map((letter) => String(letter).trim().toUpperCase())
      .filter((letter) => /^[A-Z]$/.test(letter))
  )].sort((a, b) => a.localeCompare(b, 'en'));

  const assignments = [];
  for (let index = 0; index < letters.length; index += 2) {
    const groupA = letters[index];
    const groupB = letters[index + 1];
    if (!groupB) break;
    assignments.push({ local: `1${groupA}`, visitor: `2${groupB}` });
    assignments.push({ local: `1${groupB}`, visitor: `2${groupA}` });
  }
  return assignments;
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

  if (!matchHasFixedTeamId(match, 0) && assignment.local) {
    const slot = String(assignment.local).trim().toUpperCase();
    if (normSlot(match.statsSlotLocal) !== slot) {
      next.statsSlotLocal = slot;
      next.teams[0] = emptyTeamForSlot();
      changed = true;
    }
  }

  if (!matchHasFixedTeamId(match, 1) && assignment.visitor) {
    const slot = String(assignment.visitor).trim().toUpperCase();
    if (normSlot(match.statsSlotVisitor) !== slot) {
      next.statsSlotVisitor = slot;
      next.teams[1] = emptyTeamForSlot();
      changed = true;
    }
  }

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
 * Aplica nomenclatura FIFA a la fase de dieciseisavos (por `bracket_order` 1–16).
 * @param {Array} rounds
 * @param {string[]} qualifiedThirdGroupLetters — 8 letras de grupo de los mejores terceros
 */
export function applyFifaR32SlotsToRounds(rounds, qualifiedThirdGroupLetters = []) {
  if (!Array.isArray(rounds) || rounds.length === 0) {
    return { rounds, changed: false };
  }

  const roundIndex = findDieciseisavosRoundIndex(rounds);
  if (roundIndex < 0) return { rounds, changed: false };

  const letters = (qualifiedThirdGroupLetters || [])
    .map((g) => String(g).trim().toUpperCase())
    .filter((g) => /^[A-Z]$/.test(g));

  const fifaCombination =
    letters.length === 8 ? lookupFifaThirdPlaceCombination(letters) : null;
  const assignments = buildFifaR32RoundSlotAssignments(fifaCombination);
  const { round: updatedRound, changed } = applyAssignmentsToRound(rounds[roundIndex], assignments);

  if (!changed) return { rounds, changed: false };

  const nextRounds = rounds.map((item, index) => (index === roundIndex ? updatedRound : item));
  return { rounds: nextRounds, changed: true };
}

/**
 * Aplica cruces 1A vs 2B, 1B vs 2A… en la primera fase eliminatoria.
 */
export function applyStandardFootballSlotsToRounds(rounds, groupLetters = []) {
  if (!Array.isArray(rounds) || rounds.length === 0) {
    return { rounds, changed: false };
  }

  const roundIndex = findFirstKnockoutRoundIndex(rounds);
  if (roundIndex < 0) return { rounds, changed: false };

  const assignments = buildStandardFootballRoundSlotAssignments(groupLetters);
  const { round: updatedRound, changed } = applyAssignmentsToRound(rounds[roundIndex], assignments);

  if (!changed) return { rounds, changed: false };

  const nextRounds = rounds.map((item, index) => (index === roundIndex ? updatedRound : item));
  return { rounds: nextRounds, changed: true };
}

/**
 * Despacha según modo de bracket de fútbol.
 * @param {'fifa-wc' | 'standard'} mode
 */
export function applyAutoFootballBracketSlotsToRounds(
  rounds,
  { mode, qualifiedThirdGroupLetters = [], groupLetters = [] } = {}
) {
  if (mode === 'fifa-wc') {
    return applyFifaR32SlotsToRounds(rounds, qualifiedThirdGroupLetters);
  }
  if (mode === 'standard') {
    return applyStandardFootballSlotsToRounds(rounds, groupLetters);
  }
  return { rounds, changed: false };
}
