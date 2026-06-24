import { FIFA_WC_TOURNAMENT_ID } from '../config/fifaWcConfig';
import {
  FIFA_WC_BRACKET_TOURNAMENT_ID,
  getFootballBracketSlotMode,
  usesFifaWorldCupBracketAutoSlots
} from './footballBracketSlotPolicy';
import { FOOTBALL_SPORT_ID } from './footballEventTypes';

describe('footballBracketSlotPolicy', () => {
  const otherFootballTournamentId = FIFA_WC_TOURNAMENT_ID === 2 ? 3 : 2;

  test('auto mejores terceros solo torneo WC configurado y sport_id 2', () => {
    expect(usesFifaWorldCupBracketAutoSlots({ tournamentId: FIFA_WC_TOURNAMENT_ID, sportId: 2 })).toBe(
      true
    );
    expect(
      usesFifaWorldCupBracketAutoSlots({ tournamentId: FIFA_WC_TOURNAMENT_ID, sportId: 1 })
    ).toBe(false);
    expect(usesFifaWorldCupBracketAutoSlots({ tournamentId: otherFootballTournamentId, sportId: 2 })).toBe(
      false
    );
    expect(getFootballBracketSlotMode({ tournamentId: FIFA_WC_TOURNAMENT_ID, sportId: 2 })).toBe(
      'fifa-wc'
    );
  });

  test('otros torneos de fútbol sin auto-asignación', () => {
    expect(getFootballBracketSlotMode({ tournamentId: 10, sportId: 2 })).toBe('none');
    expect(getFootballBracketSlotMode({ tournamentId: 5, sportId: 2 })).toBe('none');
  });

  test('no aplica fuera de fútbol', () => {
    expect(getFootballBracketSlotMode({ tournamentId: FIFA_WC_TOURNAMENT_ID, sportId: 1 })).toBe('none');
    expect(getFootballBracketSlotMode({ tournamentId: null, sportId: 2 })).toBe('none');
  });

  test('torneo WC lee REACT_APP_FIFA_WC_TOURNAMENT_ID (por defecto id 2)', () => {
    const expected = Number(process.env.REACT_APP_FIFA_WC_TOURNAMENT_ID);
    expect(FIFA_WC_TOURNAMENT_ID).toBe(
      Number.isInteger(expected) && expected > 0 ? expected : 2
    );
    expect(FIFA_WC_BRACKET_TOURNAMENT_ID).toBe(FIFA_WC_TOURNAMENT_ID);
    expect(FOOTBALL_SPORT_ID).toBe(2);
  });
});
