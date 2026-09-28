import { HistoryPoint, HistoryRange } from '../../Shared/Models/sensor';
import { IrrigationCropProfile } from '../../Shared/Models/irrigation';

export const CHART_Y_MAX = 70;
export const CHART_Y_FULL_MIN = 0;
export const CHART_Y_FULL_MAX = 100;
export const SOIL_FLOOR = 10;
/** Margen inferior/superior del eje Y respecto al min/max de la serie. */
export const CHART_Y_PADDING = 5;

/** Escala vertical del gráfico. */
export type ChartYScaleMode = 'dynamic' | 'full';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rango vertical fijo 0–100 %. */
export function computeFullChartYRange(): { yMin: number; yMax: number } {
  return { yMin: CHART_Y_FULL_MIN, yMax: CHART_Y_FULL_MAX };
}

/** Rango vertical del gráfico: min−5 … max+5 (mínimo 0 en el eje). */
export function computeChartYRange(values: readonly number[]): {
  yMin: number;
  yMax: number;
} {
  if (!values.length) {
    return { yMin: CHART_Y_FULL_MIN, yMax: CHART_Y_MAX };
  }

  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  let yMin = Math.max(0, dataMin - CHART_Y_PADDING);
  let yMax = dataMax + CHART_Y_PADDING;

  if (yMax <= yMin) {
    yMax = yMin + 10;
  }

  return { yMin, yMax };
}

/** Resuelve el rango Y según el modo seleccionado. */
export function resolveChartYRange(
  values: readonly number[],
  mode: ChartYScaleMode
): { yMin: number; yMax: number } {
  if (mode === 'full') {
    return computeFullChartYRange();
  }
  return computeChartYRange(values);
}

/** Límites del zoom horizontal (eje X / tiempo). */
export const CHART_X_ZOOM_MIN_POINTS = 2;

export interface ChartXZoomRange {
  startIndex: number;
  endIndex: number;
}

/** Rango X completo para N puntos. */
export function fullChartXRange(pointCount: number): ChartXZoomRange {
  if (pointCount <= 0) {
    return { startIndex: 0, endIndex: 0 };
  }
  return { startIndex: 0, endIndex: pointCount - 1 };
}

/** Indica si el rango X cubre todo el histórico. */
export function isFullChartXRange(
  range: ChartXZoomRange,
  pointCount: number
): boolean {
  if (pointCount <= 1) {
    return true;
  }
  return range.startIndex <= 0 && range.endIndex >= pointCount - 1;
}

/** Acota índices del zoom X con mínimo de puntos visibles. */
export function clampChartXRange(
  startIndex: number,
  endIndex: number,
  pointCount: number
): ChartXZoomRange {
  if (pointCount <= 0) {
    return { startIndex: 0, endIndex: 0 };
  }
  if (pointCount === 1) {
    return { startIndex: 0, endIndex: 0 };
  }

  let start = Math.max(0, Math.min(startIndex, pointCount - 1));
  let end = Math.max(0, Math.min(endIndex, pointCount - 1));
  if (start > end) {
    [start, end] = [end, start];
  }

  const minSpan = CHART_X_ZOOM_MIN_POINTS - 1;
  if (end - start < minSpan) {
    const center = Math.round((start + end) / 2);
    start = Math.max(0, center - Math.floor(minSpan / 2));
    end = start + minSpan;
    if (end >= pointCount) {
      end = pointCount - 1;
      start = Math.max(0, end - minSpan);
    }
  }

  return { startIndex: start, endIndex: end };
}

/**
 * Escala el rango X respecto a un índice central.
 * factor &lt; 1 acerca (menos puntos); factor &gt; 1 aleja.
 */
export function scaleChartXRange(
  range: ChartXZoomRange,
  centerIndex: number,
  factor: number,
  pointCount: number
): ChartXZoomRange {
  if (pointCount <= 1) {
    return fullChartXRange(pointCount);
  }

  const span = Math.max(1, range.endIndex - range.startIndex);
  const newSpan = Math.max(1, Math.round(span * factor));
  const clampedCenter = Math.max(
    range.startIndex,
    Math.min(range.endIndex, centerIndex)
  );
  const centerRatio =
    span > 0 ? (clampedCenter - range.startIndex) / span : 0.5;
  const startIndex = Math.round(clampedCenter - centerRatio * newSpan);
  const endIndex = startIndex + newSpan;
  return clampChartXRange(startIndex, endIndex, pointCount);
}

function buildYTicks(
  yMin: number,
  yMax: number,
  yToPx: (value: number) => number
): SvgTick[] {
  const span = yMax - yMin;
  const rawStep = span / 6;
  let step = 5;
  if (rawStep > 20) {
    step = 10;
  } else if (rawStep > 10) {
    step = 5;
  } else if (rawStep > 4) {
    step = 2;
  } else {
    step = 1;
  }

  const start = Math.ceil(yMin / step) * step;
  const ticks: SvgTick[] = [];
  for (let v = start; v <= yMax + step * 0.001; v += step) {
    ticks.push({
      y: yToPx(v),
      label: Number.isInteger(v) ? String(v) : v.toFixed(1),
    });
  }

  if (!ticks.length) {
    ticks.push({ y: yToPx(yMin), label: String(Math.round(yMin)) });
    ticks.push({ y: yToPx(yMax), label: String(Math.round(yMax)) });
  }

  return ticks;
}

export const BAND_COLORS = {
  red: 'rgba(229, 57, 53, 0.35)',
  greenDark: 'rgba(178, 223, 179, 0.92)',
  orange: 'rgba(255, 183, 77, 0.58)',
} as const;

export type SvgBandKind = 'deficit' | 'field' | 'saturation';

export interface SvgBand {
  y: number;
  height: number;
  color: string;
  kind: SvgBandKind;
}

export interface SvgTick {
  y: number;
  label: string;
}

export interface SvgXLabel {
  x: number;
  y: number;
  label: string;
  /** rotate(-42, x, y) para fechas legibles sin aplastar el texto. */
  transform: string;
}

/** Punto de la serie en coordenadas SVG (para tooltip al pasar el dedo/cursor). */
export interface SvgPlotPoint {
  x: number;
  y: number;
  value: number;
  timestamp: string;
}

export interface MoistureSvgChart {
  width: number;
  height: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  bands: SvgBand[];
  yTicks: SvgTick[];
  xLabels: SvgXLabel[];
  /** Puntos de la curva (mismo orden que el histórico). */
  points: SvgPlotPoint[];
  linePath: string;
  yTitleX: number;
  yTitleY: number;
  /** Límite inferior del eje Y (% humedad). */
  yMin: number;
  /** Límite superior del eje Y (% humedad). */
  yMax: number;
}

/**
 * Cantidad objetivo de etiquetas X según el rango.
 * - 7d: ~diario
 * - 30d: ≥14 (≈ cada 2 días)
 * - 6m: ~2 por mes
 */
export function targetXLabelCount(
  range: HistoryRange | undefined,
  spanMs: number
): number {
  switch (range) {
    case '7d':
      return 8;
    case '30d':
      return 15;
    case '6m':
      return 12;
    default:
      if (spanMs <= 10 * DAY_MS) {
        return 8;
      }
      if (spanMs <= 40 * DAY_MS) {
        return 15;
      }
      return 12;
  }
}

/** @deprecated Preferir {@link targetXLabelCount}; se mantiene para tests/compat. */
export function xLabelIntervalMs(
  range: HistoryRange | undefined,
  spanMs: number
): number {
  const count = Math.max(2, targetXLabelCount(range, spanMs));
  return spanMs / (count - 1);
}

function formatXLabel(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleDateString('es', {
    day: '2-digit',
    month: 'short',
    timeZone,
  });
}

/**
 * Índice del punto cuya fecha está más cerca de `targetMs`.
 */
function nearestIndex(
  times: number[],
  targetMs: number,
  from = 0
): number {
  let best = from;
  let bestDist = Math.abs(times[from] - targetMs);
  for (let i = from; i < times.length; i++) {
    const d = Math.abs(times[i] - targetMs);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
    // Serie ordenada: si ya nos pasamos y empeora, cortar.
    if (times[i] > targetMs && d > bestDist) {
      break;
    }
  }
  return best;
}

function buildXLabels(
  history: HistoryPoint[],
  plotLeft: number,
  plotW: number,
  plotBottom: number,
  range?: HistoryRange,
  timeZone?: string
): SvgXLabel[] {
  const n = history.length;
  if (n === 0) {
    return [];
  }

  const xAt = (i: number) =>
    plotLeft + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);

  const labelY = plotBottom + 16;
  const toLabel = (i: number): SvgXLabel => {
    const x = xAt(i);
    return {
      x,
      y: labelY,
      label: formatXLabel(history[i].timestamp, timeZone),
      transform: `rotate(-42, ${x}, ${labelY})`,
    };
  };

  if (n === 1) {
    return [toLabel(0)];
  }

  const times = history.map((p) => new Date(p.timestamp).getTime());
  const t0 = times[0];
  const t1 = times[n - 1];
  const spanMs = Math.max(DAY_MS, t1 - t0);
  const target = Math.min(n, targetXLabelCount(range, spanMs));

  // Reparto uniforme en el tiempo → densidad estable (p. ej. 15 en 30d).
  const indices: number[] = [];
  let searchFrom = 0;
  for (let k = 0; k < target; k++) {
    const targetMs = t0 + (spanMs * k) / (target - 1);
    const idx = nearestIndex(times, targetMs, searchFrom);
    if (indices.length === 0 || indices[indices.length - 1] !== idx) {
      indices.push(idx);
    }
    searchFrom = idx;
  }
  if (indices[indices.length - 1] !== n - 1) {
    indices.push(n - 1);
  }

  // Solo fusionar si el texto es el mismo Y están muy juntas en X.
  const labels: SvgXLabel[] = [];
  for (const i of indices) {
    const next = toLabel(i);
    const prev = labels[labels.length - 1];
    if (prev && prev.label === next.label && Math.abs(next.x - prev.x) < 14) {
      labels[labels.length - 1] = next;
      continue;
    }
    labels.push(next);
  }

  return labels;
}

/**
 * Construye el modelo SVG del gráfico de humedad (ejes + bandas + serie real).
 */
export function buildMoistureSvgChart(
  history: HistoryPoint[],
  profile: IrrigationCropProfile,
  channel: 1 | 2,
  range?: HistoryRange,
  yScaleMode: ChartYScaleMode = 'dynamic',
  timeZone?: string
): MoistureSvgChart | null {
  if (!history.length) {
    return null;
  }

  const width = 400;
  const height = 300;
  const plotLeft = 52;
  const plotRight = 384;
  const plotTop = 20;
  const plotBottom = 228;
  const plotW = plotRight - plotLeft;
  const plotH = plotBottom - plotTop;

  const seriesValues = history.map((p) =>
    channel === 2 ? p.depth30cm : p.depth10cm
  );
  const { yMin, yMax } = resolveChartYRange(seriesValues, yScaleMode);
  const ySpan = yMax - yMin;

  const yToPx = (value: number) =>
    plotTop + ((yMax - value) / ySpan) * plotH;

  const clipBand = (min: number, max: number) => ({
    min: Math.max(yMin, min),
    max: Math.min(yMax, max),
  });

  const bandsSrc: {
    min: number;
    max: number;
    color: string;
    kind: SvgBandKind;
  }[] = [
    {
      min: yMin,
      max: profile.irrigationDecision,
      color: BAND_COLORS.red,
      kind: 'deficit',
    },
    {
      min: profile.irrigationDecision,
      max: profile.maxIrrigationLimit,
      color: BAND_COLORS.greenDark,
      kind: 'field',
    },
    {
      min: profile.maxIrrigationLimit,
      max: yMax,
      color: BAND_COLORS.orange,
      kind: 'saturation',
    },
  ];

  const bands: SvgBand[] = [];
  for (const b of bandsSrc) {
    const clipped = clipBand(b.min, b.max);
    if (clipped.max <= clipped.min) {
      continue;
    }
    const yTop = yToPx(clipped.max);
    const yBottom = yToPx(clipped.min);
    bands.push({
      y: yTop,
      height: Math.max(0, yBottom - yTop),
      color: b.color,
      kind: b.kind,
    });
  }

  const yTicks = buildYTicks(yMin, yMax, yToPx);

  const n = history.length;
  const xLabels = buildXLabels(history, plotLeft, plotW, plotBottom, range, timeZone);

  const points: SvgPlotPoint[] = history.map((p, i) => {
    const value = channel === 2 ? p.depth30cm : p.depth10cm;
    const x = plotLeft + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const y = yToPx(Math.min(yMax, Math.max(yMin, value)));
    return { x, y, value, timestamp: p.timestamp };
  });

  const linePath = points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');

  return {
    width,
    height,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    bands,
    yTicks,
    xLabels,
    points,
    linePath,
    yTitleX: 20,
    yTitleY: (plotTop + plotBottom) / 2,
    yMin,
    yMax,
  };
}

/**
 * Índice del punto de la serie más cercano a la coordenada X del pointer (viewBox).
 */
export function nearestPlotPointIndex(
  points: SvgPlotPoint[],
  svgX: number
): number {
  if (!points.length) {
    return -1;
  }
  let best = 0;
  let bestDist = Math.abs(points[0].x - svgX);
  for (let i = 1; i < points.length; i++) {
    const d = Math.abs(points[i].x - svgX);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}
