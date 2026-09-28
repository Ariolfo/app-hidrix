import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  HistoryPoint,
  HistoryRange,
  Sensor,
  SensorWithHistory,
} from '../Models/sensor';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { SensorDataCacheService } from './sensor-data-cache.service';

/**
 * Detalle e histórico de sensores de humedad.
 * Preferir getWithHistory() / prefetchWithHistory() para badge + gráfica.
 */
@Injectable({ providedIn: 'root' })
export class SensorService {
  /** Promesas en vuelo para deduplicar prefetch y carga del detalle. */
  private readonly inFlight = new Map<string, Promise<SensorWithHistory>>();

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly cache: SensorDataCacheService
  ) {}

  /**
   * Obtiene el detalle de un sensor (físico o lógico) con última lectura.
   * @param id Identificador (p. ej. `M316` o `M316-1`).
   */
  async getById(id: string): Promise<Sensor> {
    const cached = this.cache.getSensor(id);
    if (cached) {
      return cached;
    }

    const token = await this.auth.getAccessToken();
    const sensor = await firstValueFrom(
      this.api.get<Sensor>(`/sensors/${encodeURIComponent(id)}`, { token })
    );
    this.cache.setSensor(sensor);
    return sensor;
  }

  /**
   * Obtiene detalle + histórico en una sola llamada API (un viaje Visualiti).
   * Reutiliza caché local y deduplica peticiones concurrentes.
   * @param id Identificador del sensor.
   * @param range `7d` | `30d` | `6m`.
   */
  async getWithHistory(
    id: string,
    range: HistoryRange
  ): Promise<SensorWithHistory> {
    const cached = this.readCachedBundle(id, range);
    if (cached) {
      return cached;
    }

    const key = this.flightKey(id, range);
    const pending = this.inFlight.get(key);
    if (pending) {
      return pending;
    }

    const request = this.fetchWithHistory(id, range).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, request);
    return request;
  }

  /**
   * Lanza en segundo plano la carga de detalle+histórico (p. ej. al tocar un pin).
   * No bloquea la navegación; alimenta la caché para cuando abra el detalle.
   * @param id Identificador del sensor.
   * @param range Rango por defecto `7d`.
   */
  prefetchWithHistory(id: string, range: HistoryRange = '7d'): void {
    if (this.readCachedBundle(id, range)) {
      return;
    }
    void this.getWithHistory(id, range).catch(() => {
      // El detalle reintentará; el prefetch no debe mostrar error al usuario.
    });
  }

  /**
   * Obtiene solo el histórico de humedad para un rango temporal.
   * @param id Identificador del sensor.
   * @param range `7d` | `30d` | `6m`.
   */
  async getHistory(id: string, range: HistoryRange): Promise<HistoryPoint[]> {
    const cached = this.cache.getHistory(id, range);
    if (cached) {
      return cached;
    }

    const bundle = await this.getWithHistory(id, range);
    return bundle.history;
  }

  private readCachedBundle(
    id: string,
    range: HistoryRange
  ): SensorWithHistory | null {
    const cachedHistory = this.cache.getHistory(id, range);
    const cachedSensor = this.cache.getSensor(id);
    if (cachedHistory && cachedSensor) {
      return { sensor: cachedSensor, history: cachedHistory, range };
    }
    return null;
  }

  private async fetchWithHistory(
    id: string,
    range: HistoryRange
  ): Promise<SensorWithHistory> {
    const token = await this.auth.getAccessToken();
    const data = await firstValueFrom(
      this.api.get<SensorWithHistory>(
        `/sensors/${encodeURIComponent(id)}/with-history`,
        { token, params: { range } }
      )
    );

    this.cache.setSensor(data.sensor);
    this.cache.setHistory(id, range, data.history);
    return data;
  }

  private flightKey(id: string, range: HistoryRange): string {
    return `${id}|${range}`;
  }
}
