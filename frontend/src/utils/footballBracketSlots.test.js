import {
  FIFA_R32_MATCH_SLOT_TEMPLATE,
  buildFifaR32RoundSlotAssignments,
  buildFifaThirdPlaceOnlyAssignments,
  applyFifaThirdPlaceSlotsOnlyToRounds,
  applyAutoFootballBracketSlotsToRounds,
  isDieciseisavosRoundTitle,
  isThirdPlaceGroupSlot
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

  test('isThirdPlaceGroupSlot reconoce 3X', () => {
    expect(isThirdPlaceGroupSlot('3E')).toBe(true);
    expect(isThirdPlaceGroupSlot('1A')).toBe(false);
    expect(isThirdPlaceGroupSlot('2B')).toBe(false);
  });

  test('buildFifaR32RoundSlotAssignments resuelve Anexo C EFGHIJKL', () => {
    const combo = lookupFifaThirdPlaceCombination(['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
    const assignments = buildFifaR32RoundSlotAssignments(combo);
    expect(assignments[0]).toEqual({ local: '2A', visitor: '2B' });
    expect(assignments[6]).toEqual({ local: '1A', visitor: '3E' });
    expect(assignments[12]).toEqual({ local: '1B', visitor: '3J' });
  });

  test('buildFifaThirdPlaceOnlyAssignments solo incluye 3X', () => {
    const combo = lookupFifaThirdPlaceCombination(['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
    const assignments = buildFifaThirdPlaceOnlyAssignments(combo);
    expect(assignments[0]).toEqual({ local: null, visitor: null });
    expect(assignments[6]).toEqual({ local: null, visitor: '3E' });
    expect(assignments[12]).toEqual({ local: null, visitor: '3J' });
  });

  test('applyFifaThirdPlaceSlotsOnlyToRounds solo actualiza 3X', () => {
    const rounds = [
      {
        id: 'round-1',
        title: 'Dieciseisavos',
        matches: [
          {
            id: 'g-1',
            bracketOrder: 1,
            statsSlotLocal: '1C',
            statsSlotVisitor: '2F',
            teams: [{ teamId: '' }, { teamId: '' }]
          },
          {
            id: 'g-7',
            bracketOrder: 7,
            statsSlotLocal: '1A',
            statsSlotVisitor: null,
            teams: [{ teamId: '' }, { teamId: '' }]
          }
        ]
      }
    ];

    const { rounds: next, changed } = applyFifaThirdPlaceSlotsOnlyToRounds(
      rounds,
      ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
    );

    expect(changed).toBe(true);
    expect(next[0].matches[0].statsSlotLocal).toBe('1C');
    expect(next[0].matches[0].statsSlotVisitor).toBe('2F');
    expect(next[0].matches[1].statsSlotLocal).toBe('1A');
    expect(next[0].matches[1].statsSlotVisitor).toBe('3E');
  });

  test('no sobrescribe cruces manuales (W#, 1A, 2B…)', () => {
    const rounds = [
      {
        id: 'round-1',
        title: 'Dieciseisavos',
        matches: [
          {
            id: 'g-1',
            bracketOrder: 1,
            statsSlotLocal: '2A',
            statsSlotVisitor: 'W75',
            teams: [{ teamId: '' }, { teamId: '' }]
          },
          {
            id: 'g-7',
            bracketOrder: 7,
            statsSlotLocal: '1A',
            statsSlotVisitor: '2B',
            teams: [{ teamId: '' }, { teamId: '' }]
          }
        ]
      }
    ];

    const { rounds: next, changed } = applyFifaThirdPlaceSlotsOnlyToRounds(
      rounds,
      ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
    );

    expect(changed).toBe(false);
    expect(next[0].matches[0].statsSlotVisitor).toBe('W75');
    expect(next[0].matches[1].statsSlotVisitor).toBe('2B');
  });

  test('actualiza solo hueco 3X vacío o ya marcado como tercero', () => {
    const rounds = [
      {
        id: 'round-1',
        title: 'Dieciseisavos',
        matches: [
          {
            id: 'g-7',
            bracketOrder: 7,
            statsSlotLocal: '1A',
            statsSlotVisitor: '3X',
            teams: [{ teamId: '' }, { teamId: '' }]
          }
        ]
      }
    ];

    const { rounds: next, changed } = applyFifaThirdPlaceSlotsOnlyToRounds(
      rounds,
      ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
    );

    expect(changed).toBe(true);
    expect(next[0].matches[0].statsSlotVisitor).toBe('3E');
  });

  test('no sobrescribe lado con equipo fijo', () => {
    const rounds = [
      {
        id: 'round-1',
        title: 'Dieciseisavos',
        matches: [
          {
            id: 'g-7',
            bracketOrder: 7,
            statsSlotLocal: '1A',
            statsSlotVisitor: '3X',
            teams: [{ teamId: '' }, { teamId: '99', name: 'Fijo' }]
          }
        ]
      }
    ];

    const { changed } = applyFifaThirdPlaceSlotsOnlyToRounds(
      rounds,
      ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
    );
    expect(changed).toBe(false);
  });

  test('sin 8 terceros clasificados no cambia nada', () => {
    const rounds = [
      {
        id: 'round-1',
        title: 'Dieciseisavos',
        matches: [
          {
            id: 'g-7',
            bracketOrder: 7,
            statsSlotLocal: '1A',
            statsSlotVisitor: null,
            teams: [{ teamId: '' }, { teamId: '' }]
          }
        ]
      }
    ];

    const { changed } = applyFifaThirdPlaceSlotsOnlyToRounds(rounds, ['E', 'F']);
    expect(changed).toBe(false);
  });

  test('applyAutoFootballBracketSlotsToRounds solo despacha fifa-wc', () => {
    const rounds = [
      {
        id: 'round-1',
        title: 'Octavos',
        matches: [
          {
            id: 'g-1',
            bracketOrder: 1,
            statsSlotLocal: '1C',
            statsSlotVisitor: null,
            teams: [{ teamId: '' }, { teamId: '' }]
          }
        ]
      }
    ];

    const none = applyAutoFootballBracketSlotsToRounds(rounds, { mode: 'none' });
    expect(none.changed).toBe(false);
    expect(none.rounds[0].matches[0].statsSlotLocal).toBe('1C');
  });
});
