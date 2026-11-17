import { Sensor } from '../Models/sensor';

/** Mapa país (HidrtbPais) → zona IANA, alineado con el backend. */
export const TIME_ZONE_BY_COUNTRY_ID: Readonly<Record<number, string>> = {
  170: 'America/Bogota',
  218: 'America/Guayaquil',
  340: 'America/Tegucigalpa',
};

const COUNTRY_BY_STATION_NUM: ReadonlyArray<{
  min: number;
  max: number;
  extra?: number[];
  name: string;
  countryId: number;
}> = [
  { min: 312, max: 323, extra: [336], name: 'Colombia', countryId: 170 },
  { min: 333, max: 335, name: 'Ecuador', countryId: 218 },
  { min: 324, max: 332, name: 'Honduras', countryId: 340 },
];

/** Extrae el número Visualiti (M316 / M316-1 / sn-316 / fin-…). */
export function parseVisualitiStationNum(
  sensorIdOrStationId: string | null | undefined
): number | null {
  if (!sensorIdOrStationId) {
    return null;
  }
  const text = sensorIdOrStationId.trim().toUpperCase();
  const m = /(?:^|[^0-9])(?:M|SN-?)?(\d{3,4})(?:-\d+)?(?:$|[^0-9])/i.exec(
    text
  );
  if (!m) {
    const digits = text.match(/(\d{3,4})/);
    if (!digits) {
      return null;
    }
    return Number(digits[1]);
  }
  return Number(m[1]);
}

/** País inferido desde el número de estación Visualiti. */
export function inferCountryFromStationNum(
  stationNum: number | null
): { countryId: number; name: string } | null {
  if (stationNum == null || Number.isNaN(stationNum)) {
    return null;
  }
  for (const row of COUNTRY_BY_STATION_NUM) {
    if (
      (stationNum >= row.min && stationNum <= row.max) ||
      row.extra?.includes(stationNum)
    ) {
      return { countryId: row.countryId, name: row.name };
    }
  }
  return null;
}

/**
 * True si el sensor pertenece al país del usuario (tz o id Visualiti).
 */
export function sensorBelongsToUserCountry(
  sensor: Pick<Sensor, 'id' | 'stationId' | 'timeZoneId'>,
  countryId: number | null | undefined,
  countryName?: string | null
): boolean {
  if (countryId == null && !countryName?.trim()) {
    return false;
  }

  if (countryId != null) {
    const expectedTz = TIME_ZONE_BY_COUNTRY_ID[countryId];
    if (expectedTz && sensor.timeZoneId === expectedTz) {
      return true;
    }
  }

  const num = parseVisualitiStationNum(sensor.id) ??
    parseVisualitiStationNum(sensor.stationId);
  const inferred = inferCountryFromStationNum(num);
  if (!inferred) {
    return false;
  }
  if (countryId != null && inferred.countryId === countryId) {
    return true;
  }
  if (
    countryName &&
    inferred.name.localeCompare(countryName.trim(), undefined, {
      sensitivity: 'accent',
    }) === 0
  ) {
    return true;
  }
  return false;
}

/** Recorta puntos a los últimos `days` días (rotación). */
export function pruneHistoryToDays<T extends { timestamp: string }>(
  points: T[],
  days = 30,
  nowMs = Date.now()
): T[] {
  const cutoff = nowMs - days * 24 * 60 * 60 * 1000;
  return points.filter((p) => {
    const t = Date.parse(p.timestamp);
    return !Number.isNaN(t) && t >= cutoff;
  });
}

/** Filtra un histórico 30d a una ventana más corta (p. ej. 7d). */
export function sliceHistoryForRange<T extends { timestamp: string }>(
  points: T[],
  range: '7d' | '30d' | '6m',
  nowMs = Date.now()
): T[] {
  if (range === '30d' || range === '6m') {
    // Offline solo persistimos 30d; 6m sin red no se inventa.
    return range === '30d' ? pruneHistoryToDays(points, 30, nowMs) : [];
  }
  return pruneHistoryToDays(points, 7, nowMs);
}
