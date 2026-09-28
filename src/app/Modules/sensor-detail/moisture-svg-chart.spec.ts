import {
  buildMoistureSvgChart,
  clampChartXRange,
  computeChartYRange,
  computeFullChartYRange,
  fullChartXRange,
  nearestPlotPointIndex,
  scaleChartXRange,
  targetXLabelCount,
  xLabelIntervalMs,
} from './moisture-svg-chart';
import { IrrigationCropProfile } from '../../Shared/Models/irrigation';
import { HistoryPoint } from '../../Shared/Models/sensor';

describe('computeChartYRange', () => {
  it('aplica ±5 al min/max de la serie', () => {
    expect(computeChartYRange([23, 44])).toEqual({ yMin: 18, yMax: 49 });
  });
});

describe('computeFullChartYRange', () => {
  it('fija el eje Y en 0–100', () => {
    expect(computeFullChartYRange()).toEqual({ yMin: 0, yMax: 100 });
  });
});

describe('clampChartXRange', () => {
  it('limita índices y mantiene al menos 2 puntos', () => {
    expect(clampChartXRange(-2, 1, 10)).toEqual({
      startIndex: 0,
      endIndex: 1,
    });
    expect(clampChartXRange(8, 15, 10)).toEqual({
      startIndex: 8,
      endIndex: 9,
    });
  });
});

describe('scaleChartXRange', () => {
  it('reduce el span temporal al acercar', () => {
    const next = scaleChartXRange(
      { startIndex: 0, endIndex: 9 },
      5,
      0.5,
      10
    );
    expect(next.endIndex - next.startIndex).toBeLessThan(9);
    expect(next.startIndex).toBeGreaterThanOrEqual(0);
    expect(next.endIndex).toBeLessThanOrEqual(9);
  });
});

describe('fullChartXRange', () => {
  it('cubre todo el histórico', () => {
    expect(fullChartXRange(7)).toEqual({ startIndex: 0, endIndex: 6 });
  });
});

describe('buildMoistureSvgChart', () => {
  const cacao: IrrigationCropProfile = {
    name: 'Cacao',
    fieldCapacity: 34,
    maxIrrigationLimit: 27.2,
    irrigationDecision: 21.76,
  };

  const dayPoints = (
    days: number,
    startIso = '2026-06-27T12:00:00+00:00'
  ): HistoryPoint[] => {
    const start = new Date(startIso).getTime();
    return Array.from({ length: days }, (_, i) => ({
      timestamp: new Date(start + i * 24 * 60 * 60 * 1000).toISOString(),
      depth10cm: 40 + (i % 5),
      depth30cm: 38,
    }));
  };

  it('devuelve null sin historial', () => {
    expect(buildMoistureSvgChart([], cacao, 1)).toBeNull();
  });

  it('en modo full usa eje Y 0–100', () => {
    const chart = buildMoistureSvgChart(
      [
        {
          timestamp: '2026-07-24T14:00:00+00:00',
          depth10cm: 15,
          depth30cm: 51,
        },
        {
          timestamp: '2026-07-25T14:00:00+00:00',
          depth10cm: 25,
          depth30cm: 48,
        },
      ],
      cacao,
      1,
      '7d',
      'full'
    );

    expect(chart).not.toBeNull();
    expect(chart!.yMin).toBe(0);
    expect(chart!.yMax).toBe(100);
    expect(chart!.bands.length).toBe(3);
  });

  it('genera ejes, bandas y path con datos reales', () => {
    const chart = buildMoistureSvgChart(
      [
        {
          timestamp: '2026-07-24T14:00:00+00:00',
          depth10cm: 15,
          depth30cm: 51,
        },
        {
          timestamp: '2026-07-25T14:00:00+00:00',
          depth10cm: 25,
          depth30cm: 48,
        },
        {
          timestamp: '2026-07-27T14:00:00+00:00',
          depth10cm: 48,
          depth30cm: 43,
        },
      ],
      cacao,
      1,
      '7d'
    );

    expect(chart).not.toBeNull();
    expect(chart!.bands.length).toBe(3);
    expect(chart!.yMin).toBe(10);
    expect(chart!.yMax).toBe(53);
    expect(chart!.yTicks.length).toBeGreaterThan(0);
    expect(Number(chart!.yTicks[0].label)).toBeGreaterThanOrEqual(chart!.yMin);
    expect(
      Number(chart!.yTicks[chart!.yTicks.length - 1].label)
    ).toBeLessThanOrEqual(chart!.yMax);
    expect(chart!.xLabels.length).toBeGreaterThan(0);
    expect(chart!.xLabels[0].transform).toContain('rotate(-42');
    expect(chart!.linePath.startsWith('M')).toBeTrue();
    expect(chart!.linePath.includes(' L')).toBeTrue();
    expect(chart!.points.length).toBe(3);
    expect(chart!.points[0].value).toBe(15);
    expect(chart!.points[0].timestamp).toBeTruthy();
  });

  it('nearestPlotPointIndex picks closest x', () => {
    const chart = buildMoistureSvgChart(dayPoints(5), cacao, 1, '7d');
    expect(chart).not.toBeNull();
    const midX = chart!.points[2].x;
    expect(nearestPlotPointIndex(chart!.points, midX)).toBe(2);
    expect(nearestPlotPointIndex(chart!.points, midX + 0.4)).toBe(2);
  });

  it('en 30d coloca al menos 14 etiquetas', () => {
    const chart = buildMoistureSvgChart(dayPoints(31), cacao, 1, '30d');
    expect(chart).not.toBeNull();
    expect(chart!.xLabels.length).toBeGreaterThanOrEqual(14);
    expect(chart!.xLabels.length).toBeLessThanOrEqual(16);
  });

  it('en 6m coloca ~2 etiquetas por mes', () => {
    const chart = buildMoistureSvgChart(dayPoints(180), cacao, 1, '6m');
    expect(chart).not.toBeNull();
    expect(chart!.xLabels.length).toBeGreaterThanOrEqual(10);
    expect(chart!.xLabels.length).toBeLessThanOrEqual(14);
  });
});

describe('targetXLabelCount', () => {
  const day = 24 * 60 * 60 * 1000;

  it('usa densidades por rango', () => {
    expect(targetXLabelCount('7d', 7 * day)).toBe(8);
    expect(targetXLabelCount('30d', 30 * day)).toBe(15);
    expect(targetXLabelCount('6m', 180 * day)).toBe(12);
  });
});

describe('xLabelIntervalMs', () => {
  const day = 24 * 60 * 60 * 1000;

  it('deriva intervalo desde el conteo objetivo', () => {
    expect(xLabelIntervalMs('30d', 30 * day)).toBeCloseTo((30 * day) / 14, 0);
  });
});
