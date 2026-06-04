import {
  phaseHmsToSeconds,
  parseEventWallMs,
  computeLiveClockFromEvents,
  hasGameFinishedMarker,
  isGameFinishedState
} from './gamePhaseClock';

describe('gamePhaseClock', () => {
  test('phaseHmsToSeconds', () => {
    expect(phaseHmsToSeconds(0, 5, 30)).toBe(330);
  });

  test('parseEventWallMs acepta ISO string', () => {
    const ms = parseEventWallMs('2024-01-01T12:00:00.000Z');
    expect(typeof ms).toBe('number');
    expect(Number.isFinite(ms)).toBe(true);
  });

  test('computeLiveClockFromEvents sin START', () => {
    const r = computeLiveClockFromEvents([], 600);
    expect(r.hasStart).toBe(false);
    expect(r.elapsedSeconds).toBe(0);
  });

  test('hasGameFinishedMarker', () => {
    expect(hasGameFinishedMarker([{ event_type: 'JUEGO FINALIZADO' }])).toBe(true);
    expect(hasGameFinishedMarker([{ event_type: 'GOAL' }])).toBe(false);
  });

  test('isGameFinishedState delega a gameEstado', () => {
    expect(isGameFinishedState('completed')).toBe(true);
  });
});
