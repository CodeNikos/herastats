import {
  FIFA_WC_BRACKET_TOURNAMENT_ID,
  getFootballBracketSlotMode,
  usesFifaWorldCupBracketAutoSlots,
  usesStandardFootballBracketAutoSlots
} from './footballBracketSlotPolicy';
import { FOOTBALL_SPORT_ID } from './footballEventTypes';

describe('footballBracketSlotPolicy', () => {
  test('FIFA WC solo torneo 2 y sport_id 2', () => {
    expect(usesFifaWorldCupBracketAutoSlots({ tournamentId: 2, sportId: 2 })).toBe(true);
    expect(usesFifaWorldCupBracketAutoSlots({ tournamentId: 2, sportId: 1 })).toBe(false);
    expect(usesFifaWorldCupBracketAutoSlots({ tournamentId: 3, sportId: 2 })).toBe(false);
    expect(getFootballBracketSlotMode({ tournamentId: 2, sportId: 2 })).toBe('fifa-wc');
  });

  test('fútbol estándar en otros torneos con sport_id 2', () => {
    expect(usesStandardFootballBracketAutoSlots({ tournamentId: 5, sportId: 2 })).toBe(true);
    expect(usesStandardFootballBracketAutoSlots({ tournamentId: 2, sportId: 2 })).toBe(false);
    expect(getFootballBracketSlotMode({ tournamentId: 10, sportId: 2 })).toBe('standard');
  });

  test('no aplica fuera de fútbol', () => {
    expect(getFootballBracketSlotMode({ tournamentId: 5, sportId: 1 })).toBe('none');
    expect(getFootballBracketSlotMode({ tournamentId: null, sportId: 2 })).toBe('none');
  });

  test('torneo WC por defecto es id 2', () => {
    expect(FIFA_WC_BRACKET_TOURNAMENT_ID).toBe(2);
    expect(FOOTBALL_SPORT_ID).toBe(2);
  });
});
