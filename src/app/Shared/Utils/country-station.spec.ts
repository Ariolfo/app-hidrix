import {
  inferCountryFromStationNum,
  parseVisualitiStationNum,
  pruneHistoryToDays,
  sensorBelongsToUserCountry,
  sliceHistoryForRange,
} from './country-station';

describe('country-station utils', () => {
  it('parsea números Visualiti desde ids lógicos', () => {
    expect(parseVisualitiStationNum('M316-1')).toBe(316);
    expect(parseVisualitiStationNum('M319')).toBe(319);
    expect(parseVisualitiStationNum('sn-324')).toBe(324);
  });

  it('infiere país por rango de estación', () => {
    expect(inferCountryFromStationNum(316)?.name).toBe('Colombia');
    expect(inferCountryFromStationNum(334)?.name).toBe('Ecuador');
    expect(inferCountryFromStationNum(330)?.name).toBe('Honduras');
  });

  it('filtra sensores del país del usuario por tz o id', () => {
    expect(
      sensorBelongsToUserCountry(
        { id: 'M316-1', stationId: 'fin-x', timeZoneId: 'America/Bogota' },
        170,
        'Colombia'
      )
    ).toBe(true);
    expect(
      sensorBelongsToUserCountry(
        { id: 'M330-1', stationId: 'fin-y', timeZoneId: 'America/Tegucigalpa' },
        170,
        'Colombia'
      )
    ).toBe(false);
  });

  it('rota el histórico a 30 días', () => {
    const now = Date.parse('2026-11-17T12:00:00Z');
    const points = [
      { timestamp: '2026-10-01T00:00:00Z', v: 1 },
      { timestamp: '2026-11-10T00:00:00Z', v: 2 },
    ];
    const pruned = pruneHistoryToDays(points, 30, now);
    expect(pruned.map((p) => p.v)).toEqual([2]);
  });

  it('recorta 30d a 7d para vista offline', () => {
    const now = Date.parse('2026-11-17T12:00:00Z');
    const points = [
      { timestamp: '2026-11-01T00:00:00Z' },
      { timestamp: '2026-11-15T00:00:00Z' },
    ];
    expect(sliceHistoryForRange(points, '7d', now)).toEqual([
      { timestamp: '2026-11-15T00:00:00Z' },
    ]);
    expect(sliceHistoryForRange(points, '6m', now)).toEqual([]);
  });
});
