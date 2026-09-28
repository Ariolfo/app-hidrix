import { HistoryPoint } from '../../Shared/Models/sensor';
import {
  CycleEstimateRow,
  FcEstimationResult,
  FcMethodKey,
  MoistureChannel,
  MoistureReading,
} from './fc-estimate.models';
import {
  cycles,
  dedupeHourly,
  dryingLimb,
  isCompleteCycle,
  nlsExponential,
  overnight,
  Reading,
  swdpK,
  swdpR,
  toPercent,
} from './fc-models';

export interface EstimateParams {
  method: FcMethodKey;
  methodLabel: string;
  sensorLabel: string;
  channel: MoistureChannel;
  studyStart: string;
  studyEnd: string;
  history: HistoryPoint[];
}

function channelValue(p: HistoryPoint, channel: MoistureChannel): number | null {
  const v = channel === '10cm' ? p.depth10cm : p.depth30cm;
  if (v == null || Number.isNaN(v)) {
    return null;
  }
  return v;
}

function toReadings(
  history: HistoryPoint[],
  channel: MoistureChannel,
  start: Date,
  end: Date
): MoistureReading[] {
  const rows: Reading[] = [];
  for (const p of history) {
    const v = channelValue(p, channel);
    if (v == null) {
      continue;
    }
    const t = new Date(p.timestamp);
    if (t < start || t > end) {
      continue;
    }
    rows.push({ t, theta: v / 100 });
  }
  rows.sort((a, b) => a.t.getTime() - b.t.getTime());
  return dedupeHourly(rows);
}

function estimateCycleFc(
  method: FcMethodKey,
  readings: Reading[],
  cyc: ReturnType<typeof cycles>[0]
): { fc: number | null; r2: number | null } {
  const limb = dryingLimb(readings, cyc);
  const night = overnight(readings, cyc);
  if (method === 'swdp-k') {
    if (limb.length < 3) {
      return { fc: null, r2: null };
    }
    const k = swdpK(limb);
    return { fc: k.thetaFc, r2: null };
  }
  const pts = method === 'swdp-r' ? night : night.length >= 6 ? night : limb;
  if (pts.length < 3) {
    return { fc: null, r2: null };
  }
  const fit = swdpR(pts);
  return { fc: fit.intercept, r2: fit.r2 };
}

function pickBestCycleIndex(
  rows: CycleEstimateRow[],
  method: FcMethodKey
): number | null {
  const complete = rows
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.complete && x.r.estimatedFcPercent != null);
  if (!complete.length) {
    return null;
  }
  if (method === 'swdp-k') {
    const last = complete[complete.length - 1];
    return last.i;
  }
  complete.sort((a, b) => (b.r.r2 ?? 0) - (a.r.r2 ?? 0));
  return complete[0].i;
}

/** Ejecuta la estimación SWDP sobre el histórico filtrado. */
export function runFcEstimation(params: EstimateParams): FcEstimationResult {
  const start = new Date(`${params.studyStart}T00:00:00`);
  const end = new Date(`${params.studyEnd}T23:59:59`);
  const readings = toReadings(params.history, params.channel, start, end);
  const strictSax = params.method === 'r-sax';
  const detected = cycles(readings);

  const rows: CycleEstimateRow[] = detected.map((cyc, cycleIndex) => {
    const complete = isCompleteCycle(readings, cyc, strictSax);
    const estimateMethod =
      params.method === 'r-sax' ? 'swdp-r' : params.method;
    const { fc, r2 } = estimateCycleFc(estimateMethod, readings, cyc);
    return {
      cycleIndex,
      timeA: readings[cyc.iA].t.toISOString(),
      timeB: readings[cyc.iB].t.toISOString(),
      timeC: readings[cyc.iC].t.toISOString(),
      thetaAPercent: toPercent(cyc.thetaA),
      thetaBPercent: toPercent(cyc.thetaB),
      thetaCPercent: toPercent(cyc.thetaC),
      valid: cyc.valid,
      complete,
      estimatedFcPercent: fc != null ? toPercent(fc) : null,
      r2,
    };
  });

  const completeRows = rows.filter(
    (r) => r.complete && r.estimatedFcPercent != null
  );
  const fcs = completeRows.map((r) => r.estimatedFcPercent!);
  const averageCc =
    fcs.length > 0
      ? Math.round((fcs.reduce((a, b) => a + b, 0) / fcs.length) * 100) / 100
      : null;
  const lastRow = completeRows.length
    ? completeRows.reduce((a, b) =>
        new Date(a.timeB) > new Date(b.timeB) ? a : b
      )
    : null;
  const bestIdx = pickBestCycleIndex(rows, params.method);
  const bestCycle = bestIdx != null ? detected[bestIdx] : null;

  let bestFitR2: number | null = null;
  let bestEstimatedFcPercent: number | null = null;
  let bestDryingLimb: { t: number; thetaPercent: number }[] = [];
  let bestOvernight: { t: number; thetaPercent: number }[] = [];

  if (bestCycle) {
    const limb = dryingLimb(readings, bestCycle);
    const night = overnight(readings, bestCycle);
    bestDryingLimb = limb.map((p) => ({
      t: p.t,
      thetaPercent: toPercent(p.theta),
    }));
    bestOvernight = night.map((p) => ({
      t: p.t,
      thetaPercent: toPercent(p.theta),
    }));
    if (params.method === 'swdp-k') {
      bestEstimatedFcPercent = toPercent(swdpK(limb).thetaFc);
    } else {
      const pts = night.length >= 6 ? night : limb;
      const fit = swdpR(pts);
      bestEstimatedFcPercent = toPercent(fit.intercept);
      bestFitR2 = fit.r2;
    }
    if (bestIdx != null && params.method !== 'swdp-k') {
      bestFitR2 = rows[bestIdx].r2;
      bestEstimatedFcPercent = rows[bestIdx].estimatedFcPercent;
    }
    const exp = nlsExponential(limb);
    if (bestFitR2 == null && exp.r2 > 0) {
      bestFitR2 = exp.r2;
    }
  }

  return {
    method: params.method,
    methodLabel: params.methodLabel,
    sensorLabel: params.sensorLabel,
    channel: params.channel,
    studyStart: params.studyStart,
    studyEnd: params.studyEnd,
    pointsUsed: readings.length,
    seriesFound: detected.length,
    completeSeries: completeRows.length,
    lastEstimatedCc: lastRow?.estimatedFcPercent ?? null,
    averageCc,
    rows,
    bestCycleIndex: bestIdx,
    bestCycle,
    bestReadings: readings,
    bestDryingLimb,
    bestOvernight,
    bestEstimatedFcPercent,
    bestFitR2,
  };
}
