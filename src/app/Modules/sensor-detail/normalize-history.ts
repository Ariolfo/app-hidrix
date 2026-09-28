import { HistoryPoint } from '../../Shared/Models/sensor';

/** Normaliza la respuesta del API (camelCase / PascalCase). */
export function normalizeHistoryPoints(raw: unknown): HistoryPoint[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const p = item as Record<string, unknown>;
      const timestamp = String(p['timestamp'] ?? p['Timestamp'] ?? '');
      const depth10cm = Number(p['depth10cm'] ?? p['Depth10cm'] ?? NaN);
      const depth30cm = Number(p['depth30cm'] ?? p['Depth30cm'] ?? NaN);
      if (!timestamp || Number.isNaN(depth10cm) || Number.isNaN(depth30cm)) {
        return null;
      }
      return { timestamp, depth10cm, depth30cm };
    })
    .filter((p): p is HistoryPoint => p !== null);
}
