import {
  parseBestThirdSlotDescriptor,
  compareBestThirdCandidates,
  pickBestThirdAmongGroups,
  computeAllBestThirdPlaceResults,
  computeFairPlayScore,
  BEST_THIRD_PLACE_COMBINATIONS
} from './bestThirdPlace';

describe('bestThirdPlace', () => {
  test('parseBestThirdSlotDescriptor reconoce 3ABCDF y rechaza 3A', () => {
    expect(parseBestThirdSlotDescriptor('3ABCDF')).toEqual({
      type: 'bestThird',
      slot: '3ABCDF',
      groups: ['A', 'B', 'C', 'D', 'F']
    });
    expect(parseBestThirdSlotDescriptor('3A')).toBeNull();
  });

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

  test('pickBestThirdAmongGroups elige el mejor tercero del pool', () => {
    const teams = [
      { team_id: 1, name: 'A1', division: 'Open', group: 'Grupo A', wins: 3, losses: 0, games: 3 },
      { team_id: 2, name: 'A2', division: 'Open', group: 'Grupo A', wins: 2, losses: 1, games: 3 },
      { team_id: 3, name: 'A3', division: 'Open', group: 'Grupo A', wins: 1, losses: 2, games: 3 },
      { team_id: 4, name: 'B1', division: 'Open', group: 'Grupo B', wins: 3, losses: 0, games: 3 },
      { team_id: 5, name: 'B2', division: 'Open', group: 'Grupo B', wins: 2, losses: 1, games: 3 },
      { team_id: 6, name: 'B3', division: 'Open', group: 'Grupo B', wins: 0, losses: 3, games: 3 }
    ];
    const games = [
      { estado: 'finished', phas_num: 1, division: 'Open', local: 1, visitor: 2, local_score: 2, visitor_score: 0 },
      { estado: 'finished', phas_num: 1, division: 'Open', local: 1, visitor: 3, local_score: 2, visitor_score: 0 },
      { estado: 'finished', phas_num: 1, division: 'Open', local: 2, visitor: 3, local_score: 2, visitor_score: 0 },
      { estado: 'finished', phas_num: 1, division: 'Open', local: 4, visitor: 5, local_score: 1, visitor_score: 0 },
      { estado: 'finished', phas_num: 1, division: 'Open', local: 4, visitor: 6, local_score: 3, visitor_score: 0 },
      { estado: 'finished', phas_num: 1, division: 'Open', local: 5, visitor: 6, local_score: 2, visitor_score: 0 }
    ];

    const winner = pickBestThirdAmongGroups(['A', 'B'], teams, games, 'Open');
    expect(winner?.name).toBe('A3');
    expect(winner?.groupLetter).toBe('A');
  });

  test('computeAllBestThirdPlaceResults devuelve 8 slots', () => {
    const results = computeAllBestThirdPlaceResults([], [], 'Open');
    expect(results).toHaveLength(BEST_THIRD_PLACE_COMBINATIONS.length);
    expect(results[0].slot).toBe('3ABCDF');
  });

  test('computeFairPlayScore mayor con menos tarjetas', () => {
    expect(computeFairPlayScore(1, 0)).toBeGreaterThan(computeFairPlayScore(2, 1));
  });
});
