/** Métodos automatizados soportados en el módulo. */
export type FcMethodKey = 'swdp-r' | 'swdp-k' | 'r-sax';

export type MoistureChannel = '10cm' | '30cm';

/** Lectura horaria normalizada para SWDP (θ en fracción 0–1). */
export interface MoistureReading {
  t: Date;
  theta: number;
}

export interface OlsFit {
  intercept: number;
  slope: number;
  r2: number;
  n: number;
}

export interface SwdpCycle {
  iA: number;
  iB: number;
  iC: number;
  thetaA: number;
  thetaB: number;
  thetaC: number;
  valid: boolean;
}

/** Resultado por ciclo detectado. */
export interface CycleEstimateRow {
  cycleIndex: number;
  timeA: string;
  timeB: string;
  timeC: string;
  thetaAPercent: number;
  thetaBPercent: number;
  thetaCPercent: number;
  valid: boolean;
  complete: boolean;
  estimatedFcPercent: number | null;
  r2: number | null;
}

/** Resumen global de la estimación. */
export interface FcEstimationResult {
  method: FcMethodKey;
  methodLabel: string;
  sensorLabel: string;
  channel: MoistureChannel;
  studyStart: string;
  studyEnd: string;
  pointsUsed: number;
  seriesFound: number;
  completeSeries: number;
  lastEstimatedCc: number | null;
  averageCc: number | null;
  rows: CycleEstimateRow[];
  bestCycleIndex: number | null;
  bestCycle: SwdpCycle | null;
  bestReadings: MoistureReading[];
  bestDryingLimb: { t: number; thetaPercent: number }[];
  bestOvernight: { t: number; thetaPercent: number }[];
  bestEstimatedFcPercent: number | null;
  bestFitR2: number | null;
}

/** Sensor agrupado para el selector (cultivo → sensores). */
export interface CropSensorGroup {
  cropName: string;
  sensors: CatalogSensorOption[];
}

export interface CatalogSensorOption {
  catalogId: number;
  sensorId: string;
  label: string;
  countryName: string;
  cropName: string | null;
}
