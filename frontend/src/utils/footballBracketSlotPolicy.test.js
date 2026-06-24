import { FIFA_WC_TOURNAMENT_ID } from '../config/fifaWcConfig';
import {
  FIFA_WC_BRACKET_TOURNAMENT_ID,
  getFootballBracketSlotMode,
  usesFifaWorldCupBracketAutoSlots
} from './footballBracketSlotPolicy';
import { FOOTBALL_SPORT_ID } from './footballEventTypes';

describe('footballBracketSlotPolicy', () => {
  const wcId = FIFA_WC_TOURNAMENT_ID;
  const otherFootballTournamentId = wcId === 2 ? 3 : 2;

  test('auto mejores terceros solo torneo WC configurado y sport_id 2', () => {
    expect(
      usesFifaWorldCupBracketAutoSlots({ tournamentId: wcId, sportId: 2, fifaWcTournamentId: wcId })
    ).toBe(true);
    expect(
      usesFifaWorldCupBracketAutoSlots({ tournamentId: wcId, sportId: 1, fifaWcTournamentId: wcId })
    ).toBe(false);
    expect(
      usesFifaWorldCupBracketAutoSlots({
        tournamentId: otherFootballTournamentId,
        sportId: 2,
        fifaWcTournamentId: wcId
      })
    ).toBe(false);
    expect(
      getFootballBracketSlotMode({ tournamentId: wcId, sportId: 2, fifaWcTournamentId: wcId })
    ).toBe('fifa-wc');
  });

  test('acepta id WC desde API en runtime (prod torneo 3)', () => {
    expect(
      usesFifaWorldCupBracketAutoSlots({
        tournamentId: 3,
        sportId: 2,
        fifaWcTournamentId: 3
      })
    ).toBe(true);
    expect(
      usesFifaWorldCupBracketAutoSlots({
        tournamentId: 3,
        sportId: 2,
        fifaWcTournamentId: 2
      })
    ).toBe(false);
  });

  test('otros torneos de fútbol sin auto-asignación', () => {
    expect(getFootballBracketSlotMode({ tournamentId: 10, sportId: 2, fifaWcTournamentId: wcId })).toBe(
      'none'
    );
    expect(getFootballBracketSlotMode({ tournamentId: 5, sportId: 2, fifaWcTournamentId: wcId })).toBe(
      'none'
    );
  });

  test('no aplica fuera de fútbol', () => {
    expect(
      getFootballBracketSlotMode({ tournamentId: wcId, sportId: 1, fifaWcTournamentId: wcId })
    ).toBe('none');
    expect(getFootballBracketSlotMode({ tournamentId: null, sportId: 2, fifaWcTournamentId: wcId })).toBe(
      'none'
    );
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
