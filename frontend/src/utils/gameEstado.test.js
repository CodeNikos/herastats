import {
  isFinishedGameEstado,
  isGameFinishedState,
  isGameOngoingState,
  isGameUpcomingState,
  pickEstadoFromGame
} from './gameEstado';

describe('gameEstado', () => {
  test('isFinishedGameEstado e isGameFinishedState son equivalentes', () => {
    expect(isGameFinishedState('finalizado')).toBe(true);
    expect(isFinishedGameEstado('finalizado')).toBe(true);
    expect(isGameFinishedState('ongoing')).toBe(false);
  });

  test('isGameOngoingState', () => {
    expect(isGameOngoingState('ongoing')).toBe(true);
    expect(isGameOngoingState('en curso')).toBe(true);
  });

  test('isGameUpcomingState', () => {
    expect(isGameUpcomingState('upcoming')).toBe(true);
    expect(isGameUpcomingState('programado')).toBe(true);
  });

  test('pickEstadoFromGame normaliza claves', () => {
    expect(pickEstadoFromGame({ estado: ' Ongoing ' })).toBe('Ongoing');
    expect(pickEstadoFromGame({ Estado: 'finished' })).toBe('finished');
    expect(pickEstadoFromGame({})).toBe('');
  });
});
