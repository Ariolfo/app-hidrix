import { FcEstimationResult } from './fc-estimate.models';
import { toPercent } from './fc-models';

export interface FcChartModel {
  width: number;
  height: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  linePath: string;
  markers: { x: number; y: number; label: string; color: string }[];
  refLines: { y: number; label: string; color: string }[];
  xLabels: { x: number; y: number; label: string }[];
  yTicks: { y: number; label: string }[];
}

const W = 640;
const H = 260;
const PL = 48;
const PR = 12;
const PT = 16;
const PB = 36;

function yScale(v: number, yMin: number, yMax: number): number {
  const span = yMax - yMin || 1;
  return PT + ((yMax - v) / span) * (H - PT - PB);
}

function xScale(i: number, n: number): number {
  if (n <= 1) {
    return (PL + W - PR) / 2;
  }
  return PL + (i / (n - 1)) * (W - PL - PR);
}

function buildLinePath(
  values: number[],
  yMin: number,
  yMax: number
): string {
  if (!values.length) {
    return '';
  }
  return values
    .map((v, i) => {
      const cmd = i === 0 ? 'M' : 'L';
      return `${cmd}${xScale(i, values.length).toFixed(1)},${yScale(v, yMin, yMax).toFixed(1)}`;
    })
    .join(' ');
}

function yRange(values: number[]): { yMin: number; yMax: number } {
  if (!values.length) {
    return { yMin: 0, yMax: 50 };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(2, (max - min) * 0.1);
  return {
    yMin: Math.max(0, min - pad),
    yMax: Math.min(100, max + pad),
  };
}

/** Gráfica del tramo A→C del mejor ciclo con puntos A, B y C. */
export function buildSeriesCycleChart(
  result: FcEstimationResult
): FcChartModel | null {
  const readings = result.bestReadings;
  const cyc = result.bestCycle;
  if (!readings.length || !cyc) {
    return null;
  }

  const cycleReadings = readings.slice(cyc.iA, cyc.iC + 1);
  if (!cycleReadings.length) {
    return null;
  }

  const values = cycleReadings.map((r) => toPercent(r.theta));
  const { yMin, yMax } = yRange(values);
  const idxB = cyc.iB - cyc.iA;
  const idxC = cyc.iC - cyc.iA;
  const markers = [
    { idx: 0, label: 'A', color: '#1565c0' },
    { idx: idxB, label: 'B', color: '#2e7d32' },
    { idx: idxC, label: 'C', color: '#c62828' },
  ].map((m) => ({
    x: xScale(m.idx, values.length),
    y: yScale(values[m.idx], yMin, yMax),
    label: m.label,
    color: m.color,
  }));

  const refLines: FcChartModel['refLines'] = [];
  if (result.bestEstimatedFcPercent != null) {
    refLines.push({
      y: yScale(result.bestEstimatedFcPercent, yMin, yMax),
      label: `CC ${result.bestEstimatedFcPercent}%`,
      color: '#1060c0',
    });
  }

  const yTicks = [yMin, (yMin + yMax) / 2, yMax].map((v) => ({
    y: yScale(v, yMin, yMax),
    label: `${Math.round(v)}%`,
  }));

  const xLabels = buildCycleTimeLabels(cycleReadings, [0, idxB, idxC]);

  return {
    width: W,
    height: H,
    plotLeft: PL,
    plotRight: W - PR,
    plotTop: PT,
    plotBottom: H - PB,
    linePath: buildLinePath(values, yMin, yMax),
    markers,
    refLines,
    xLabels,
    yTicks,
  };
}

/** Gráfica del miembro de secado del mejor ciclo con estimación de CC. */
export function buildDryingLimbChart(
  result: FcEstimationResult
): FcChartModel | null {
  const limb = result.bestDryingLimb;
  if (!limb.length) {
    return null;
  }

  const values = limb.map((p) => p.thetaPercent);
  const { yMin, yMax } = yRange(values);
  const linePath = buildLinePath(values, yMin, yMax);

  const refLines: FcChartModel['refLines'] = [];
  const markers: FcChartModel['markers'] = [];

  if (result.bestEstimatedFcPercent != null) {
    refLines.push({
      y: yScale(result.bestEstimatedFcPercent, yMin, yMax),
      label: `θ_FC ${result.bestEstimatedFcPercent}%`,
      color: '#1060c0',
    });
  }

  if (result.method === 'swdp-k' && result.bestEstimatedFcPercent != null) {
    const idx = limb.findIndex(
      (p) => Math.abs(p.thetaPercent - result.bestEstimatedFcPercent!) < 0.05
    );
    const kIdx = idx >= 0 ? idx : limb.length - 1;
    markers.push({
      x: xScale(kIdx, values.length),
      y: yScale(limb[kIdx].thetaPercent, yMin, yMax),
      label: 'K',
      color: '#1060c0',
    });
  }

  if (result.method !== 'swdp-k' && limb.length >= 3) {
    return {
      width: W,
      height: H,
      plotLeft: PL,
      plotRight: W - PR,
      plotTop: PT,
      plotBottom: H - PB,
      linePath,
      markers: [
        {
          x: xScale(0, values.length),
          y: yScale(values[0], yMin, yMax),
          label: 'B',
          color: '#2e7d32',
        },
        ...markers,
      ],
      refLines,
      xLabels: [
        { x: PL, y: H - 8, label: '0 h' },
        {
          x: W - PR,
          y: H - 8,
          label: `${limb[limb.length - 1].t.toFixed(0)} h`,
        },
      ],
      yTicks: [yMin, yMax].map((v) => ({
        y: yScale(v, yMin, yMax),
        label: `${Math.round(v)}%`,
      })),
    };
  }

  return {
    width: W,
    height: H,
    plotLeft: PL,
    plotRight: W - PR,
    plotTop: PT,
    plotBottom: H - PB,
    linePath,
    markers: [
      {
        x: xScale(0, values.length),
        y: yScale(values[0], yMin, yMax),
        label: 'B',
        color: '#2e7d32',
      },
      ...markers,
    ],
    refLines,
    xLabels: [
      { x: PL, y: H - 8, label: '0 h' },
      { x: W - PR, y: H - 8, label: `${limb[limb.length - 1].t.toFixed(0)} h` },
    ],
    yTicks: [yMin, yMax].map((v) => ({
      y: yScale(v, yMin, yMax),
      label: `${Math.round(v)}%`,
    })),
  };
}

function formatShort(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function formatAxisDateTime(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${min}`;
}

function buildCycleTimeLabels(
  cycleReadings: { t: Date }[],
  keyIndices: number[]
): FcChartModel['xLabels'] {
  const n = cycleReadings.length;
  if (!n) {
    return [];
  }

  const indices = new Set<number>([0, n - 1]);
  for (const idx of keyIndices) {
    if (idx >= 0 && idx < n) {
      indices.add(idx);
    }
  }

  if (n > 18) {
    const step = Math.max(1, Math.floor(n / 5));
    for (let i = 0; i < n; i += step) {
      indices.add(i);
    }
  }

  return [...indices]
    .sort((a, b) => a - b)
    .map((i) => ({
      x: xScale(i, n),
      y: H - 6,
      label: formatAxisDateTime(cycleReadings[i].t),
    }));
}
