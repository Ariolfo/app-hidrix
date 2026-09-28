import { Injectable } from '@angular/core';

import { HistoryPoint, HistoryRange, Sensor } from '../Models/sensor';

/** Entrada de caché con expiración. */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Caché en memoria del dispositivo para detalle e histórico de sensores.
 * Reduce round-trips al reabrir el mismo sensor/rango (TTL corto).
 */
@Injectable({ providedIn: 'root' })
export class SensorDataCacheService {
  /** TTL de histórico en cliente (2 min). */
  private readonly historyTtlMs = 120_000;

  /** TTL de snapshot de sensor (2 min). */
  private readonly sensorTtlMs = 120_000;

  private readonly history = new Map<string, CacheEntry<HistoryPoint[]>>();
  private readonly sensors = new Map<string, CacheEntry<Sensor>>();

  /**
   * Obtiene histórico cacheado si no ha expirado.
   * @param sensorId Id lógico o físico.
   * @param range Rango temporal.
   */
  getHistory(sensorId: string, range: HistoryRange): HistoryPoint[] | null {
    return this.read(this.history, this.key(sensorId, range));
  }

  /**
   * Guarda histórico en caché.
   * @param sensorId Id del sensor.
   * @param range Rango temporal.
   * @param points Serie histórica.
   */
  setHistory(
    sensorId: string,
    range: HistoryRange,
    points: HistoryPoint[]
  ): void {
    this.history.set(this.key(sensorId, range), {
      value: points,
      expiresAt: Date.now() + this.historyTtlMs,
    });
  }

  /**
   * Obtiene snapshot de sensor cacheado.
   * @param sensorId Id del sensor.
   */
  getSensor(sensorId: string): Sensor | null {
    return this.read(this.sensors, sensorId);
  }

  /**
   * Guarda snapshot de sensor.
   * @param sensor Sensor completo.
   */
  setSensor(sensor: Sensor): void {
    this.sensors.set(sensor.id, {
      value: sensor,
      expiresAt: Date.now() + this.sensorTtlMs,
    });
  }

  /**
   * Invalida entradas de un sensor (todos los rangos).
   * @param sensorId Id del sensor.
   */
  invalidate(sensorId: string): void {
    this.sensors.delete(sensorId);
    for (const key of [...this.history.keys()]) {
      if (key.startsWith(`${sensorId}|`)) {
        this.history.delete(key);
      }
    }
  }

  private key(sensorId: string, range: HistoryRange): string {
    return `${sensorId}|${range}`;
  }

  private read<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = map.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      map.delete(key);
      return null;
    }
    return entry.value;
  }
}
