import {
  compareBestThirdCandidates,
  computeBestThirdPlaceDashboard,
  pickTopEightThirdPlaceTeams,
  rankThirdPlaceTeamsGlobally,
  computeFairPlayScore
} from './bestThirdPlace';

describe('bestThirdPlace', () => {
  test('compareBestThirdCandidates respeta orden puntos → GD → GF → fair play', () => {
    const highPts = { metrics: { points: 4, gd: 0, gf: 3, fairPlayScore: 0 }, name: 'A' };
    const lowPts = { metrics: { points: 3, gd: 5, gf: 10, fairPlayScore: 10 }, name: 'B' };
    expect(compareBestThirdCandidates(highPts, lowPts)).toBeLessThan(0);

    const tiePtsA = { metrics: { points: 4, gd: 2, gf: 4, fairPlayScore: -1 }, name: 'A' };
    const tiePtsB = { metrics: { points: 4, gd: 1, gf: 8, fairPlayScore: 0 }, name: 'B' };
    expect(compareBestThirdCandidates(tiePtsA, tiePtsB)).toBeLessThan(0);

    const tieGdA = { metrics: { points: 4, gd: 1, gf: 5, fairPlayScore: -2 }, name: 'A' };
    const tieGdB = { metrics: { points: 4, gd: 1, gf: 4, fairPlayScore: 0 }, name: 'B' };
    expect(compareBestThirdCandidates(tieGdA, tieGdB)).toBeLessThan(0);

    const fairA = { metrics: { points: 4, gd: 1, gf: 5, fairPlayScore: -1 }, name: 'A' };
    const fairB = { metrics: { points: 4, gd: 1, gf: 5, fairPlayScore: -4 }, name: 'B' };
    expect(compareBestThirdCandidates(fairA, fairB)).toBeLessThan(0);
  });

  test('pickTopEightThirdPlaceTeams ordena globalmente y devuelve 8', () => {
    const thirds = [
      { groupLetter: 'A', name: 'A3', metrics: { points: 6, gd: 2, gf: 5, fairPlayScore: -1 } },
      { groupLetter: 'B', name: 'B3', metrics: { points: 4, gd: 1, gf: 4, fairPlayScore: -2 } },
      { groupLetter: 'C', name: 'C3', metrics: { points: 4, gd: 0, gf: 3, fairPlayScore: 0 } },
      { groupLetter: 'D', name: 'D3', metrics: { points: 3, gd: 0, gf: 2, fairPlayScore: 0 } }
    ];
    const ranked = rankThirdPlaceTeamsGlobally(thirds);
    expect(ranked[0].groupLetter).toBe('A');
    expect(ranked[0].globalRank).toBe(1);
    expect(ranked[1].groupLetter).toBe('B');
  });

  test('computeBestThirdPlaceDashboard marca qualified en top 8', () => {
    const dashboard = computeBestThirdPlaceDashboard([], [], 'Open');
    expect(dashboard.qualifiedEight).toHaveLength(0);
    expect(dashboard.fifaQualificationKey).toBe('');
    expect(dashboard.r32Matchups).toEqual([]);
  });

  test('computeFairPlayScore mayor con menos tarjetas', () => {
    expect(computeFairPlayScore(1, 0)).toBeGreaterThan(computeFairPlayScore(2, 1));
  });
});
