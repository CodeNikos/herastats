const PageVisit = require('./PageVisit');

describe('PageVisit timeseries helpers', () => {
  test('_formatDateKey normaliza fechas', () => {
    expect(PageVisit._formatDateKey('2026-06-15')).toBe('2026-06-15');
    expect(PageVisit._formatDateKey(new Date('2026-06-15T00:00:00.000Z'))).toBe('2026-06-15');
    expect(PageVisit._formatDateKey('2026-06-15T00:00:00.000Z')).toBe('2026-06-15');
  });

  test('_iterateUtcDates incluye todos los días del rango', () => {
    const start = new Date('2026-06-01T00:00:00.000Z');
    const end = new Date('2026-06-03T00:00:00.000Z');
    expect(PageVisit._iterateUtcDates(start, end)).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03'
    ]);
  });

  test('_resolveTimeseriesRange respeta from y to', () => {
    const range = PageVisit._resolveTimeseriesRange({
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-05T23:59:59.999Z'
    });
    expect(range.startDate.toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(range.endDate.toISOString().slice(0, 10)).toBe('2026-06-05');
  });
});
