const {
  isFinishedGameEstado,
  shouldRecordFinishedMarker,
  normalizeGameEstado
} = require('./gameEstado');

describe('gameEstado (backend)', () => {
  test('normalizeGameEstado', () => {
    expect(normalizeGameEstado(' Finished ')).toBe('finished');
  });

  test('isFinishedGameEstado variantes', () => {
    expect(isFinishedGameEstado('finalizado')).toBe(true);
    expect(isFinishedGameEstado('completed')).toBe(true);
    expect(isFinishedGameEstado('ongoing')).toBe(false);
  });

  test('shouldRecordFinishedMarker', () => {
    expect(shouldRecordFinishedMarker('Finished')).toBe(true);
    expect(shouldRecordFinishedMarker('upcoming')).toBe(false);
  });
});
