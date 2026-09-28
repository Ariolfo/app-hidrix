import { normalizeHistoryPoints } from './normalize-history';

describe('normalizeHistoryPoints', () => {
  it('acepta camelCase del API', () => {
    const points = normalizeHistoryPoints([
      { timestamp: '2026-07-24T14:00:00+00:00', depth10cm: 53, depth30cm: 51 },
    ]);
    expect(points.length).toBe(1);
    expect(points[0].depth10cm).toBe(53);
  });

  it('acepta PascalCase', () => {
    const points = normalizeHistoryPoints([
      { Timestamp: '2026-07-24T14:00:00+00:00', Depth10cm: 40, Depth30cm: 38 },
    ]);
    expect(points.length).toBe(1);
    expect(points[0].depth30cm).toBe(38);
  });

  it('descarta puntos inválidos', () => {
    const points = normalizeHistoryPoints([
      { timestamp: 'x', depth10cm: 'no', depth30cm: 1 },
      null,
      { timestamp: '2026-07-24T14:00:00+00:00', depth10cm: 10, depth30cm: 11 },
    ]);
    expect(points.length).toBe(1);
  });
});
