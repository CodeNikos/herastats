import {
  normalizeGroupName,
  normalizeDivisionName,
  isFinishedGameEstado,
  isGroupPhaseGame,
  divisionMatchesLabel,
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

  test('buildGroupStandingsRows ordena por victorias', () => {
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
});
