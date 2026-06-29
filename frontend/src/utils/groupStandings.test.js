import {
  normalizeGroupName,
  normalizeDivisionName,
  isFinishedGameEstado,
  isGroupPhaseGame,
  divisionMatchesLabel,
  standingsPointsFromRecord,
  buildGroupStandingsRows
} from './groupStandings';

describe('groupStandings', () => {
  test('normalizeGroupName añade prefijo Grupo', () => {
    expect(normalizeGroupName('A')).toBe('Grupo A');
    expect(normalizeGroupName('Grupo B')).toBe('Grupo B');
  });

  test('isFinishedGameEstado acepta variantes', () => {
    expect(isFinishedGameEstado('finished')).toBe(true);
    expect(isFinishedGameEstado('Finalizado')).toBe(true);
    expect(isFinishedGameEstado('completed')).toBe(true);
    expect(isFinishedGameEstado('ongoing')).toBe(false);
  });

  test('isGroupPhaseGame detecta fase de grupos', () => {
    expect(isGroupPhaseGame({ phas_num: 1 })).toBe(true);
    expect(isGroupPhaseGame({ phase_name: 'Groups' })).toBe(true);
    expect(isGroupPhaseGame({ phase_name: 'Semifinal' })).toBe(false);
  });

  test('divisionMatchesLabel ignora mayúsculas', () => {
    expect(divisionMatchesLabel('Open', 'open')).toBe(true);
    expect(divisionMatchesLabel('Open', 'Mixto')).toBe(false);
  });

  test('standingsPointsFromRecord aplica 3-1-0', () => {
    expect(standingsPointsFromRecord(3, 2, 0)).toBe(7);
    expect(standingsPointsFromRecord(3, 1, 1)).toBe(4);
    expect(standingsPointsFromRecord(3, 0, 1)).toBe(2);
  });

  test('buildGroupStandingsRows ordena por victorias (sin empates = mismo orden que puntos)', () => {
    const teams = [
      { id: '1', name: 'A', group: 'Grupo A', wins: 1, losses: 0, games: 1 },
      { id: '2', name: 'B', group: 'Grupo A', wins: 0, losses: 1, games: 1 }
    ];
    const games = [
      {
        estado: 'finished',
        phas_num: 1,
        division: 'Open',
        local: 1,
        visitor: 2,
        local_score: 15,
        visitor_score: 10
      }
    ];
    const rows = buildGroupStandingsRows(teams, games, 'Open');
    expect(rows[0].name).toBe('A');
    expect(rows[1].name).toBe('B');
  });

  test('buildGroupStandingsRows ordena por puntos con empates', () => {
    const teams = [
      { id: '1', name: 'Alfa', group: 'Grupo A', wins: 1, losses: 0, games: 2 },
      { id: '2', name: 'Beta', group: 'Grupo A', wins: 0, losses: 0, games: 2 },
      { id: '3', name: 'Gamma', group: 'Grupo A', wins: 0, losses: 1, games: 2 }
    ];
    const games = [
      {
        estado: 'finished',
        phas_num: 1,
        division: 'Open',
        local: 1,
        visitor: 2,
        local_score: 2,
        visitor_score: 2
      },
      {
        estado: 'finished',
        phas_num: 1,
        division: 'Open',
        local: 1,
        visitor: 3,
        local_score: 3,
        visitor_score: 1
      },
      {
        estado: 'finished',
        phas_num: 1,
        division: 'Open',
        local: 2,
        visitor: 3,
        local_score: 1,
        visitor_score: 1
      }
    ];
    const rows = buildGroupStandingsRows(teams, games, 'Open');
    expect(rows.map((r) => r.name)).toEqual(['Alfa', 'Beta', 'Gamma']);
    expect(rows[0].points).toBe(4);
    expect(rows[1].points).toBe(2);
    expect(rows[2].points).toBe(1);
  });

  test('buildGroupStandingsRows desempata por puntos H2H', () => {
    const teams = [
      { id: '1', name: 'Alfa', group: 'Grupo A', wins: 0, losses: 0, games: 0 },
      { id: '2', name: 'Beta', group: 'Grupo A', wins: 0, losses: 0, games: 0 },
      { id: '3', name: 'Gamma', group: 'Grupo A', wins: 0, losses: 0, games: 0 },
      { id: '4', name: 'Delta', group: 'Grupo A', wins: 0, losses: 0, games: 0 }
    ];
    const games = [
      { estado: 'finished', phas_num: 1, division: 'Open', local: 1, visitor: 2, local_score: 2, visitor_score: 1 },
      { estado: 'finished', phas_num: 1, division: 'Open', local: 1, visitor: 3, local_score: 0, visitor_score: 0 },
      { estado: 'finished', phas_num: 1, division: 'Open', local: 1, visitor: 4, local_score: 0, visitor_score: 1 },
      { estado: 'finished', phas_num: 1, division: 'Open', local: 2, visitor: 3, local_score: 0, visitor_score: 0 },
      { estado: 'finished', phas_num: 1, division: 'Open', local: 2, visitor: 4, local_score: 1, visitor_score: 0 },
      { estado: 'finished', phas_num: 1, division: 'Open', local: 3, visitor: 4, local_score: 1, visitor_score: 0 }
    ];
    const rows = buildGroupStandingsRows(teams, games, 'Open');
    const alfa = rows.find((r) => r.name === 'Alfa');
    const beta = rows.find((r) => r.name === 'Beta');
    expect(alfa.points).toBe(4);
    expect(beta.points).toBe(4);
    expect(alfa.rank).toBeLessThan(beta.rank);
  });
});
