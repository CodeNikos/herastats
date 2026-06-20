const {
  mapTeamsPayload,
  mapPlayersPayload,
  mapSchedulePayload,
  mapScoresPayload,
  mapGameEventsPayload,
  isFinishedStatus
} = require('./mappers');

describe('tournament2Sync mappers', () => {
  test('mapTeamsPayload normaliza teams de football-data', () => {
    const payload = {
      teams: [
        { id: 10, name: 'Argentina', area: { name: 'World' }, crest: 'https://crest/a.png' },
        { id: 11, name: 'Brazil', area: { name: 'World' }, crest: 'https://crest/b.png' }
      ]
    };
    const mapped = mapTeamsPayload(payload);
    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toMatchObject({
      external_id: '10',
      name: 'Argentina',
      division: 'World',
      url_imagen: 'https://crest/a.png'
    });
    expect(mapped[1]).toMatchObject({
      external_id: '11',
      name: 'Brazil',
      division: 'World',
      url_imagen: 'https://crest/b.png'
    });
  });

  test('mapPlayersPayload extrae squads desde teams[]', () => {
    const payload = {
      teams: [
        {
          id: 10,
          squad: [
            { id: 'p1', name: 'Ana', shirtNumber: 7, position: 'Forward' },
            { id: 'p2', name: 'Beto', shirtNumber: 3, position: 'Defence' }
          ]
        },
        { id: 11, squad: [] }
      ]
    };
    const mapped = mapPlayersPayload(payload);
    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toMatchObject({
      external_id: 'p1',
      team_external_id: '10',
      player_name: 'Ana',
      player_number: 7,
      nickname: null,
      position: 'Forward'
    });
  });

  test('mapSchedulePayload mapea matches de football-data', () => {
    const payload = {
      matches: [
        {
          id: 'g1',
          stage: 'GROUP_STAGE',
          group: 'GROUP_A',
          matchday: 1,
          utcDate: '2026-06-13T14:30:00Z',
          venue: 'Lusail',
          competition: { name: 'World Cup' },
          homeTeam: { id: 10 },
          awayTeam: { id: 11 }
        }
      ]
    };
    const mapped = mapSchedulePayload(payload);
    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toMatchObject({
      external_id: 'g1',
      phase_external_id: 'phase:group_stage:group_a',
      game_date: '2026-06-13',
      game_time: '14:30:00',
      local_team_external_id: '10',
      visitor_team_external_id: '11',
      division: 'World Cup'
    });
  });

  test('mapScoresPayload toma fullTime y status', () => {
    const payload = {
      matches: [
        {
          id: 'g1',
          score: { fullTime: { home: 2, away: 0 } },
          status: 'FINISHED'
        },
        {
          id: 'g2',
          score: { fullTime: { home: 1, away: 1 } },
          status: 'IN_PLAY'
        }
      ]
    };
    const mapped = mapScoresPayload(payload);
    expect(mapped).toHaveLength(2);
    expect(mapped[0].local_score).toBe(2);
    expect(mapped[0].visitor_score).toBe(0);
    expect(mapped[0].status).toBe('Finished');
    expect(mapped[1].status).toBe('Ongoing');
  });

  test('mapGameEventsPayload usa gameExternalId de contexto', () => {
    const payload = { events: [] };
    const mapped = mapGameEventsPayload(payload, { gameExternalId: 'g1' });
    expect(mapped).toHaveLength(0);
  });

  test('isFinishedStatus identifica finalizados', () => {
    expect(isFinishedStatus('FINISHED')).toBe(true);
    expect(isFinishedStatus('Finished')).toBe(true);
    expect(isFinishedStatus('IN_PLAY')).toBe(false);
  });
});
