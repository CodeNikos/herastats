import {
  FIFA_WC_BRACKET_TOURNAMENT_ID,
  getFootballBracketSlotMode,
  usesFifaWorldCupBracketAutoSlots
} from './footballBracketSlotPolicy';
import { FOOTBALL_SPORT_ID } from './footballEventTypes';

describe('footballBracketSlotPolicy', () => {
  test('auto mejores terceros solo torneo 2 y sport_id 2', () => {
    expect(usesFifaWorldCupBracketAutoSlots({ tournamentId: 2, sportId: 2 })).toBe(true);
    expect(usesFifaWorldCupBracketAutoSlots({ tournamentId: 2, sportId: 1 })).toBe(false);
    expect(usesFifaWorldCupBracketAutoSlots({ tournamentId: 3, sportId: 2 })).toBe(false);
    expect(getFootballBracketSlotMode({ tournamentId: 2, sportId: 2 })).toBe('fifa-wc');
  });

  test('otros torneos de fútbol sin auto-asignación', () => {
    expect(getFootballBracketSlotMode({ tournamentId: 10, sportId: 2 })).toBe('none');
    expect(getFootballBracketSlotMode({ tournamentId: 5, sportId: 2 })).toBe('none');
  });

  test('no aplica fuera de fútbol', () => {
    expect(getFootballBracketSlotMode({ tournamentId: 2, sportId: 1 })).toBe('none');
    expect(getFootballBracketSlotMode({ tournamentId: null, sportId: 2 })).toBe('none');
  });

  test('torneo WC configurable por env (por defecto id 2)', () => {
    const expected = Number(process.env.REACT_APP_FIFA_WC_TOURNAMENT_ID);
    expect(FIFA_WC_BRACKET_TOURNAMENT_ID).toBe(
      Number.isInteger(expected) && expected > 0 ? expected : 2
    );
    expect(FOOTBALL_SPORT_ID).toBe(2);
  });
});
