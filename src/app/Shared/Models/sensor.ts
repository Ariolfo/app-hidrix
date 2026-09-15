/** Lectura de humedad por canal (sensor_1 / sensor_2). */
export interface Reading {
  depthCm: number;
  value: number;
  timestamp: string;
  unit: string;
}

/** Sensor físico (M316) o lógico (M316-1). */
export interface Sensor {
  id: string;
  stationId: string;
  name: string;
  location: string;
  /** normal | drain | irrigate_deficit | no_data */
  status: string;
  /** online | offline (Visualiti hardware-status) */
  connectivity?: string | null;
  online?: boolean | null;
  /** bueno | aceptable | desconocido… */
  hardwareStatus?: string | null;
  lastReadingAt: string;
  readings: Reading[];
  alertMessage?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Zona horaria IANA del país de la red (America/Bogota, …). */
  timeZoneId?: string;
}

/** Punto de histórico de humedad. */
export interface HistoryPoint {
  timestamp: string;
  depth10cm: number;
  depth30cm: number;
}

/** Rangos de histórico soportados por la API. */
export type HistoryRange = '7d' | '30d' | '6m';

/**
 * Respuesta unificada detalle + histórico
 * (`GET /api/v1/sensors/{id}/with-history`).
 */
export interface SensorWithHistory {
  sensor: Sensor;
  history: HistoryPoint[];
  range: string;
}

/** Estado de navegación opcional desde el mapa hacia el detalle. */
export interface SensorNavState {
  sensor?: Sensor;
}

/** True si la estación está offline o sin snapshot Visualiti. */
export function isSensorOffline(sensor: Sensor): boolean {
  if (sensor.online === false) {
    return true;
  }
  const c = (sensor.connectivity || '').trim().toLowerCase();
  return c === 'offline';
}

/** Color de pin: offline gris; si no, estado de humedad. */
export function mapPinStatus(sensor: Sensor): string {
  if (isSensorOffline(sensor)) {
    return 'offline';
  }
  return normalizeMoistureStatus(sensor.status);
}

/** Normaliza estados legacy del API a los 3 tonos actuales (+ no_data). */
export function normalizeMoistureStatus(status: string): string {
  switch (status) {
    case 'excess':
    case 'attention_high':
    case 'saturation':
      return 'drain';
    case 'irrigate':
    case 'attention_low':
    case 'attention':
    case 'deficit':
      return 'irrigate_deficit';
    case 'normal':
    case 'drain':
    case 'irrigate_deficit':
    case 'no_data':
      return status;
    default:
      return status;
  }
}
