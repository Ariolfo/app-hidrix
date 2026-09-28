import { OlsFit, SwdpCycle } from './fc-estimate.models';

export const ALPHA = 0.006;
export const MIN_WETTING = 0.02;
export const MIN_DRYING_H = 24;

export interface Reading {
  t: Date;
  theta: number;
}

export function ols(xs: number[], ys: number[]): OlsFit {
  const n = xs.length;
  if (n === 0) {
    return { intercept: 0, slope: 0, r2: 0, n: 0 };
  }
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  let sst = 0;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    sst += (ys[i] - my) ** 2;
    const yhat = intercept + slope * xs[i];
    sse += (ys[i] - yhat) ** 2;
  }
  const r2 = sst > 0 ? 1 - sse / sst : 0;
  return { intercept, slope, r2, n };
}

export function peakIndices(theta: number[], alpha = ALPHA): number[] {
  const out: number[] = [];
  for (let i = 1; i < theta.length - 1; i++) {
    if (theta[i] > theta[i + 1] + alpha && theta[i] > theta[i - 1] + alpha) {
      out.push(i);
    }
  }
  return out;
}

function argminRange(theta: number[], lo: number, hi: number): number {
  let best = lo;
  for (let i = lo; i <= hi; i++) {
    if (theta[i] < theta[best]) {
      best = i;
    }
  }
  return best;
}

export function cycles(
  readings: Reading[],
  alpha = ALPHA,
  minWetting = MIN_WETTING,
  minDryingH = MIN_DRYING_H
): SwdpCycle[] {
  const theta = readings.map((r) => r.theta);
  const pks = peakIndices(theta, alpha);
  const out: SwdpCycle[] = [];
  for (let k = 0; k < pks.length; k++) {
    const iB = pks[k];
    const lo = k === 0 ? 0 : pks[k - 1];
    const hi = k === pks.length - 1 ? theta.length - 1 : pks[k + 1];
    const iA = argminRange(theta, lo, iB);
    const iC = argminRange(theta, iB, hi);
    const dryH =
      (readings[iC].t.getTime() - readings[iB].t.getTime()) / 3_600_000;
    const valid =
      theta[iB] - theta[iA] >= minWetting && dryH >= minDryingH;
    out.push({
      iA,
      iB,
      iC,
      thetaA: theta[iA],
      thetaB: theta[iB],
      thetaC: theta[iC],
      valid,
    });
  }
  return out;
}

export function dryingLimb(
  readings: Reading[],
  cyc: SwdpCycle
): { t: number; theta: number }[] {
  const tB = readings[cyc.iB].t.getTime();
  const pts: { t: number; theta: number }[] = [];
  for (let i = cyc.iB; i <= cyc.iC; i++) {
    pts.push({
      t: (readings[i].t.getTime() - tB) / 3_600_000,
      theta: readings[i].theta,
    });
  }
  return pts;
}

export function overnight(
  readings: Reading[],
  cyc: SwdpCycle
): { t: number; theta: number }[] {
  const tB = readings[cyc.iB].t.getTime();
  const pts: { t: number; theta: number }[] = [];
  for (let i = cyc.iB + 1; i <= cyc.iC; i++) {
    const r = readings[i];
    const dt = (r.t.getTime() - tB) / 3_600_000;
    if (dt > 30) {
      break;
    }
    const h = r.t.getHours();
    if (h >= 23 || h <= 6) {
      pts.push({ t: dt, theta: r.theta });
    } else if (pts.length) {
      break;
    }
  }
  return pts;
}

export function swdpR(pts: { t: number; theta: number }[]): OlsFit {
  const xs = pts.map((p) => 1 / p.t);
  const ys = pts.map((p) => p.theta);
  return ols(xs, ys);
}

export function swdpK(pts: { t: number; theta: number }[]): {
  index: number;
  thetaFc: number;
} {
  const n = pts.length;
  const t0 = pts[0].t;
  const y0 = pts[0].theta;
  const t1 = pts[n - 1].t;
  const y1 = pts[n - 1].theta;
  const dt = t1 - t0;
  const dy = y1 - y0;
  const norm = Math.hypot(dt, dy) || 1;
  let best = 0;
  let bestd = -1;
  for (let i = 0; i < n; i++) {
    const { t, theta: y } = pts[i];
    const d = Math.abs(dy * (t - t0) - dt * (y - y0)) / norm;
    if (d > bestd) {
      bestd = d;
      best = i;
    }
  }
  return { index: best, thetaFc: pts[best].theta };
}

export function distinctLevels(pts: { t: number; theta: number }[]): number {
  return new Set(pts.map((p) => Math.round(p.theta * 1000))).size;
}

export function isMonotone(pts: { t: number; theta: number }[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i + 1].theta > pts[i].theta + 1e-9) {
      return false;
    }
  }
  return true;
}

export function isHourly(pts: { t: number; theta: number }[]): boolean {
  if (!pts.length) {
    return false;
  }
  return pts[pts.length - 1].t === pts.length - 1;
}

export function nlsExponential(
  pts: { t: number; theta: number }[],
  lamLo = 0.01,
  lamHi = 3.0,
  steps = 3000
): { thetaFc: number; lam: number; r2: number; sse: number } {
  const ys = pts.map((p) => p.theta);
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sst = ys.reduce((a, y) => a + (y - my) ** 2, 0);
  let best: { thetaFc: number; lam: number; r2: number; sse: number } | null =
    null;
  for (let k = 0; k <= steps; k++) {
    const lam = lamLo + ((lamHi - lamLo) * k) / steps;
    const xs = pts.map((p) => Math.exp(-lam * p.t));
    const f = ols(xs, ys);
    let sse = 0;
    for (let i = 0; i < pts.length; i++) {
      const yhat = f.intercept + f.slope * xs[i];
      sse += (ys[i] - yhat) ** 2;
    }
    if (!best || sse < best.sse) {
      best = {
        thetaFc: f.intercept,
        lam,
        r2: sst > 0 ? 1 - sse / sst : 0,
        sse,
      };
    }
  }
  return best!;
}

/** Criterio de ciclo completo (fit_field_capacity.py / R-SAX proxy). */
export function isCompleteCycle(
  readings: Reading[],
  cyc: SwdpCycle,
  strictSax = false
): boolean {
  if (!cyc.valid) {
    return false;
  }
  const limb = dryingLimb(readings, cyc);
  const night = overnight(readings, cyc);
  const base =
    limb.length >= 24 &&
    night.length >= 6 &&
    isHourly(limb) &&
    isMonotone(limb) &&
    distinctLevels(limb) >= 10;
  if (!base) {
    return false;
  }
  if (!strictSax) {
    return true;
  }
  const fit = nlsExponential(limb);
  return fit.lam > 0.0101 && fit.lam < 2.99 && fit.r2 >= 0.5;
}

export function toPercent(theta: number): number {
  return Math.round(theta * 10000) / 100;
}

export function dedupeHourly(readings: Reading[]): Reading[] {
  const out: Reading[] = [];
  for (const r of readings) {
    const prev = out[out.length - 1];
    if (!prev || prev.t.getTime() !== r.t.getTime()) {
      out.push(r);
    }
  }
  return out;
}
