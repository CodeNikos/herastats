import { buildPlacementGrid, placementRowLabel, sortPlacementDivisions } from './poolbracketsPlacements';

describe('poolbracketsPlacements', () => {
  test('sortPlacementDivisions respeta orden WFDF', () => {
    expect(sortPlacementDivisions(['Mixed', 'Open', "Women's"])).toEqual(['Open', "Women's", 'Mixed']);
  });

  test('buildPlacementGrid arma filas por división', () => {
    const grid = buildPlacementGrid([
      { placement_number: 1, division: 'Open', team_name: 'A' },
      { placement_number: 2, division: 'Open', team_name: 'B' },
      { placement_number: 1, division: 'Mixed', team_name: 'C' }
    ]);
    expect(grid.divisions).toEqual(['Open', 'Mixed']);
    expect(grid.tableRows[0].cells[0].team_name).toBe('A');
    expect(grid.tableRows[0].cells[1].team_name).toBe('C');
    expect(grid.tableRows[1].cells[0].team_name).toBe('B');
  });

  test('placementRowLabel medallas top 3', () => {
    expect(placementRowLabel(1).text).toBe('Gold');
    expect(placementRowLabel(2).medal).toBe(true);
    expect(placementRowLabel(4).text).toBe('4');
  });
});
