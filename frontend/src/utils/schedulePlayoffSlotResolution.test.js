import { parseStatsSlotDescriptor, enrichScheduleParticipantFromSlots } from './schedulePlayoffSlotResolution';

describe('schedulePlayoffSlotResolution', () => {
  test('parseStatsSlotDescriptor 1A y A1', () => {
    expect(parseStatsSlotDescriptor('1A')).toEqual({ type: 'groupRank', rank: 1, groupToken: 'A' });
    expect(parseStatsSlotDescriptor('A1')).toEqual({ type: 'groupRank', rank: 1, groupToken: 'A' });
    expect(parseStatsSlotDescriptor('3ABCDF')).toEqual({
      type: 'bestThird',
      slot: '3ABCDF',
      groups: ['A', 'B', 'C', 'D', 'F']
    });
    expect(parseStatsSlotDescriptor('')).toBeNull();
  });

  test('enrichScheduleParticipantFromSlots con slot de grupo', () => {
    const teamsRows = [
      {
        team_id: 10,
        name: 'Equipo A',
        division: 'Open',
        group: 'Grupo A',
        wins: 2,
        losses: 0,
        games: 2,
        url_imagen: '/a.png'
      },
      {
        team_id: 11,
        name: 'Equipo B',
        division: 'Open',
        group: 'Grupo A',
        wins: 0,
        losses: 2,
        games: 2
      }
    ];
    const teamLookup = new Map([
      [10, { name: 'Equipo A', image: '/a.png' }],
      [11, { name: 'Equipo B', image: '/b.png' }]
    ]);
    const result = enrichScheduleParticipantFromSlots({
      teamId: null,
      joinName: 'A definir',
      joinImage: null,
      statsSlotRaw: '1A',
      teamLookup,
      teamsRows,
      division: 'Open',
      tournamentGamesNormalized: []
    });
    expect(result.name).toBe('Equipo A');
  });
});
