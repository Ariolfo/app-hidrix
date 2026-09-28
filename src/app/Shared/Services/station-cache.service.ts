import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { Station } from '../Models/station';

const CACHE_KEY = 'hidrix_stations_catalog_v1';

/** Ventana para considerar el inventario de estaciones “fresco” (1 día). */
const INVENTORY_TTL_MS = 24 * 60 * 60 * 1000;

/** Snapshot local del catálogo de estaciones. */
export interface StationsCacheSnapshot {
  savedAt: number;
  stations: Station[];
}

/**
 * Caché persistente del catálogo de estaciones/sensores en el dispositivo.
 * Sirve para pintar el mapa al instante (stale-while-revalidate).
 */
@Injectable({ providedIn: 'root' })
export class StationCacheService {
  private memory: StationsCacheSnapshot | null = null;

  /** Lee el último catálogo guardado (memoria → Preferences). */
  async read(): Promise<StationsCacheSnapshot | null> {
    if (this.memory?.stations?.length) {
      return this.memory;
    }
    try {
      const raw = await Preferences.get({ key: CACHE_KEY });
      if (!raw.value) {
        return null;
      }
      const parsed = JSON.parse(raw.value) as StationsCacheSnapshot;
      if (!parsed?.stations?.length || typeof parsed.savedAt !== 'number') {
        return null;
      }
      this.memory = parsed;
      return parsed;
    } catch {
      return null;
    }
  }

  /** Guarda el catálogo (tras un fetch exitoso con sensores). */
  async write(stations: Station[]): Promise<void> {
    if (!stations?.length) {
      return;
    }
    const snapshot: StationsCacheSnapshot = {
      savedAt: Date.now(),
      stations,
    };
    this.memory = snapshot;
    try {
      await Preferences.set({
        key: CACHE_KEY,
        value: JSON.stringify(snapshot),
      });
    } catch {
      // Sin persistencia: al menos queda en memoria de la sesión.
    }
  }

  /** True si el inventario tiene más de 1 día (o no hay caché). */
  isInventoryStale(snapshot: StationsCacheSnapshot | null): boolean {
    if (!snapshot?.stations?.length) {
      return true;
    }
    return Date.now() - snapshot.savedAt > INVENTORY_TTL_MS;
  }

  /** Edad de la caché en ms; null si no hay. */
  ageMs(snapshot: StationsCacheSnapshot | null): number | null {
    if (!snapshot) {
      return null;
    }
    return Math.max(0, Date.now() - snapshot.savedAt);
  }
}
