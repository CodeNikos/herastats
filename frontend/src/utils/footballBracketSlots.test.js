import {
  FIFA_R32_MATCH_SLOT_TEMPLATE,
  buildFifaR32RoundSlotAssignments,
  buildStandardFootballRoundSlotAssignments,
  applyFifaR32SlotsToRounds,
  applyStandardFootballSlotsToRounds,
  applyAutoFootballBracketSlotsToRounds,
  isDieciseisavosRoundTitle
} from './footballBracketSlots';
import { lookupFifaThirdPlaceCombination } from './fifaThirdPlaceCombinations';

describe('footballBracketSlots', () => {
  test('plantilla tiene 16 partidos', () => {
    expect(FIFA_R32_MATCH_SLOT_TEMPLATE).toHaveLength(16);
  });

  test('isDieciseisavosRoundTitle reconoce fase', () => {
    expect(isDieciseisavosRoundTitle('Dieciseisavos')).toBe(true);
    expect(isDieciseisavosRoundTitle('Semifinals')).toBe(false);
  });

  test('buildFifaR32RoundSlotAssignments resuelve Anexo C EFGHIJKL', () => {
    const combo = lookupFifaThirdPlaceCombination(['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
    const assignments = buildFifaR32RoundSlotAssignments(combo);
    expect(assignments[0]).toEqual({ local: '2A', visitor: '2B' });
    expect(assignments[6]).toEqual({ local: '1A', visitor: '3E' });
    expect(assignments[12]).toEqual({ local: '1B', visitor: '3J' });
  });

  test('applyFifaR32SlotsToRounds rellena slots vacíos en dieciseisavos', () => {
    const rounds = [
      {
        id: 'round-1',
        title: 'Dieciseisavos',
        matches: [
          {
            id: 'g-1',
            bracketOrder: 1,
            statsSlotLocal: null,
            statsSlotVisitor: null,
            teams: [{ teamId: '' }, { teamId: '' }]
          },
          {
            id: 'g-7',
            bracketOrder: 7,
            statsSlotLocal: null,
            statsSlotVisitor: null,
            teams: [{ teamId: '' }, { teamId: '' }]
          }
        ]
      }
    ];

    const { rounds: next, changed } = applyFifaR32SlotsToRounds(
      rounds,
      ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
    );

    expect(changed).toBe(true);
    expect(next[0].matches[0].statsSlotLocal).toBe('2A');
    expect(next[0].matches[0].statsSlotVisitor).toBe('2B');
    expect(next[0].matches[1].statsSlotLocal).toBe('1A');
    expect(next[0].matches[1].statsSlotVisitor).toBe('3E');
  });

  test('no sobrescribe lado con equipo fijo', () => {
    const rounds = [
      {
        id: 'round-1',
        title: 'Dieciseisavos',
        matches: [
          {
            id: 'g-1',
            bracketOrder: 1,
            statsSlotLocal: '2A',
            statsSlotVisitor: '2B',
            teams: [{ teamId: '99', name: 'Fijo' }, { teamId: '' }]
          }
        ]
      }
    ];

    const { changed } = applyFifaR32SlotsToRounds(rounds, ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
    expect(changed).toBe(false);
  });

  test('buildStandardFootballRoundSlotAssignments empareja A-B y C-D', () => {
    expect(buildStandardFootballRoundSlotAssignments(['B', 'A', 'D', 'C'])).toEqual([
      { local: '1A', visitor: '2B' },
      { local: '1B', visitor: '2A' },
      { local: '1C', visitor: '2D' },
      { local: '1D', visitor: '2C' }
    ]);
  });

  test('applyStandardFootballSlotsToRounds rellena playoffs', () => {
    const rounds = [
      {
        id: 'round-1',
        title: 'Playoffs',
        matches: [
          {
            id: 'g-1',
            bracketOrder: 1,
            statsSlotLocal: null,
            statsSlotVisitor: null,
            teams: [{ teamId: '' }, { teamId: '' }]
          },
          {
            id: 'g-2',
            bracketOrder: 2,
            statsSlotLocal: null,
            statsSlotVisitor: null,
            teams: [{ teamId: '' }, { teamId: '' }]
          }
        ]
      }
    ];

    const { rounds: next, changed } = applyStandardFootballSlotsToRounds(rounds, ['A', 'B']);
    expect(changed).toBe(true);
    expect(next[0].matches[0].statsSlotLocal).toBe('1A');
    expect(next[0].matches[0].statsSlotVisitor).toBe('2B');
    expect(next[0].matches[1].statsSlotLocal).toBe('1B');
    expect(next[0].matches[1].statsSlotVisitor).toBe('2A');
  });

  test('applyAutoFootballBracketSlotsToRounds despacha por modo', () => {
    const rounds = [
      {
        id: 'round-1',
        title: 'Octavos',
        matches: [
          {
            id: 'g-1',
            bracketOrder: 1,
            statsSlotLocal: null,
            statsSlotVisitor: null,
            teams: [{ teamId: '' }, { teamId: '' }]
          }
        ]
      }
    ];

    const standard = applyAutoFootballBracketSlotsToRounds(rounds, {
      mode: 'standard',
      groupLetters: ['A', 'B']
    });
    expect(standard.changed).toBe(true);
    expect(standard.rounds[0].matches[0].statsSlotLocal).toBe('1A');

    const none = applyAutoFootballBracketSlotsToRounds(rounds, { mode: 'none' });
    expect(none.changed).toBe(false);
  });
});
