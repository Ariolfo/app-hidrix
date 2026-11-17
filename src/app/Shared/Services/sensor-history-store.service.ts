import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { HistoryPoint, HistoryRange, Sensor } from '../Models/sensor';
import {
  pruneHistoryToDays,
  sliceHistoryForRange,
} from '../Utils/country-station';
import { AuthService } from './auth.service';

const INDEX_PREFIX = 'reguemos_hist30_index_';
const ENTRY_PREFIX = 'reguemos_hist30_';

/** Entrada persistente de histórico 30 días por sensor. */
export interface SensorHistoryDiskEntry {
  sensorId: string;
  savedAt: number;
  countryId: number | null;
  sensor: Sensor | null;
  history: HistoryPoint[];
}

/**
 * Caché en disco del histórico agroclimático (30 días, rotativo)
 * para estaciones del país del usuario.
 */
@Injectable({ providedIn: 'root' })
export class SensorHistoryStoreService {
  constructor(private readonly auth: AuthService) {}

  /** Guarda/reemplaza el histórico 30d de un sensor (poda puntos viejos). */
  async write(
    sensorId: string,
    history: HistoryPoint[],
    options?: {
      sensor?: Sensor | null;
      countryId?: number | null;
    }
  ): Promise<void> {
    const id = sensorId.trim();
    if (!id) {
      return;
    }
    const pruned = pruneHistoryToDays(history, 30);
    const entry: SensorHistoryDiskEntry = {
      sensorId: id,
      savedAt: Date.now(),
      countryId: options?.countryId ?? null,
      sensor: options?.sensor ?? null,
      history: pruned,
    };
    const key = await this.entryKey(id);
    await Preferences.set({ key, value: JSON.stringify(entry) });
    await this.addToIndex(id);
  }

  /** Lee histórico en disco; opcionalmente recorta al rango pedido. */
  async read(
    sensorId: string,
    range: HistoryRange = '30d'
  ): Promise<SensorHistoryDiskEntry | null> {
    const id = sensorId.trim();
    if (!id) {
      return null;
    }
    try {
      const raw = await Preferences.get({ key: await this.entryKey(id) });
      if (!raw.value) {
        return null;
      }
      const parsed = JSON.parse(raw.value) as SensorHistoryDiskEntry;
      if (!parsed?.history || !Array.isArray(parsed.history)) {
        return null;
      }
      const sliced = sliceHistoryForRange(parsed.history, range);
      if (range === '6m') {
        return null;
      }
      return {
        ...parsed,
        history: pruneHistoryToDays(sliced, range === '7d' ? 7 : 30),
      };
    } catch {
      return null;
    }
  }

  /** Ids de sensores con histórico local. */
  async listSensorIds(): Promise<string[]> {
    try {
      const raw = await Preferences.get({ key: await this.indexKey() });
      if (!raw.value) {
        return [];
      }
      const parsed = JSON.parse(raw.value) as string[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** Elimina históricos que ya no pertenecen al país (cambio de perfil). */
  async retainOnly(sensorIds: string[]): Promise<void> {
    const keep = new Set(sensorIds.map((s) => s.trim()).filter(Boolean));
    const current = await this.listSensorIds();
    const next: string[] = [];
    for (const id of current) {
      if (keep.has(id)) {
        next.push(id);
        continue;
      }
      await Preferences.remove({ key: await this.entryKey(id) });
    }
    await Preferences.set({
      key: await this.indexKey(),
      value: JSON.stringify(next),
    });
  }

  private async addToIndex(sensorId: string): Promise<void> {
    const ids = await this.listSensorIds();
    if (ids.includes(sensorId)) {
      return;
    }
    ids.push(sensorId);
    await Preferences.set({
      key: await this.indexKey(),
      value: JSON.stringify(ids),
    });
  }

  private async indexKey(): Promise<string> {
    const user = await this.auth.getUser();
    return `${INDEX_PREFIX}${user?.id ?? 'anon'}`;
  }

  private async entryKey(sensorId: string): Promise<string> {
    const user = await this.auth.getUser();
    return `${ENTRY_PREFIX}${user?.id ?? 'anon'}_${sensorId}`;
  }
}
