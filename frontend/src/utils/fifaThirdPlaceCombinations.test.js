import {
  FIFA_COMBINATIONS,
  FIFA_THIRD_PLACE_START_ID,
  buildFifaQualificationKey,
  generateFifaThirdPlaceCombinations,
  getR32MatchupDescriptors,
  lookupFifaThirdPlaceCombination,
  validateFifaCombinationSlots
} from './fifaThirdPlaceCombinations';

describe('fifaThirdPlaceCombinations', () => {
  test('genera exactamente 495 combinaciones (C(12,8))', () => {
    const combos = generateFifaThirdPlaceCombinations();
    expect(combos).toHaveLength(495);
    expect(FIFA_COMBINATIONS).toHaveLength(495);
    expect(combos[0].id).toBe(FIFA_THIRD_PLACE_START_ID);
    expect(combos[494].id).toBe(FIFA_THIRD_PLACE_START_ID + 494);
  });

  test('claves de combinación únicas y de 8 letras', () => {
    const keys = new Set(FIFA_COMBINATIONS.map((c) => c.combinationKey));
    expect(keys.size).toBe(495);
    for (const combo of FIFA_COMBINATIONS) {
      expect(combo.combinationKey).toHaveLength(8);
      expect(validateFifaCombinationSlots(combo.slots)).toBe(true);
    }
  });

  test('lookup por grupos clasificados (fila 1 Anexo C: EFGHIJKL)', () => {
    const key = buildFifaQualificationKey(['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
    expect(key).toBe('EFGHIJKL');
    const combo = lookupFifaThirdPlaceCombination(['L', 'K', 'J', 'I', 'H', 'G', 'F', 'E']);
    expect(combo).not.toBeNull();
    expect(combo.id).toBe(488);
    expect(combo.slots.slot1A).toBe('3E');
    expect(combo.slots.slot1B).toBe('3J');
    expect(combo.slots.slot1L).toBe('3K');

    const matchups = getR32MatchupDescriptors(combo);
    expect(matchups).toHaveLength(8);
    expect(matchups[0]).toMatchObject({ winnerSlot: '1A', thirdSlot: '3E', sameGroupViolation: false });
    expect(matchups.every((m) => !m.sameGroupViolation)).toBe(true);
  });

  test('ningún 3X enfrenta a 1X del mismo grupo', () => {
    for (const combo of FIFA_COMBINATIONS) {
      const matchups = getR32MatchupDescriptors(combo);
      expect(matchups.every((m) => m.thirdGroup !== m.winnerSlot.replace('1', ''))).toBe(true);
    }
  });
});
