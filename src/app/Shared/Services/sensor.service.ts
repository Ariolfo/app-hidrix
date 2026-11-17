import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  HistoryPoint,
  HistoryRange,
  Sensor,
  SensorWithHistory,
} from '../Models/sensor';
import { sensorBelongsToUserCountry } from '../Utils/country-station';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { SensorDataCacheService } from './sensor-data-cache.service';
import { SensorHistoryStoreService } from './sensor-history-store.service';

/**
 * Detalle e histórico de sensores de humedad.
 * Preferir getWithHistory() / prefetchWithHistory() para badge + gráfica.
 * Histórico 30d del país del usuario se persiste en disco para uso offline.
 */
@Injectable({ providedIn: 'root' })
export class SensorService {
  /** Promesas en vuelo para deduplicar prefetch y carga del detalle. */
  private readonly inFlight = new Map<string, Promise<SensorWithHistory>>();

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly cache: SensorDataCacheService,
    private readonly historyStore: SensorHistoryStoreService
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

    const disk = await this.historyStore.read(id, '30d');
    if (disk?.sensor) {
      this.cache.setSensor(disk.sensor);
      return disk.sensor;
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
   * Sin red: usa histórico 30d del país guardado en el celular (7d/30d).
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

    const request = this.fetchWithHistoryOrDisk(id, range).finally(() => {
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
   * Descarga y persiste el histórico 30d (país del usuario) para uso offline.
   */
  async prefetchPersist30d(
    id: string,
    sensorHint?: Sensor | null,
    countryId?: number | null
  ): Promise<void> {
    const bundle = await this.fetchWithHistory(id, '30d');
    await this.persistIfCountrySensor(
      id,
      bundle,
      countryId ?? undefined,
      sensorHint
    );
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

  private async fetchWithHistoryOrDisk(
    id: string,
    range: HistoryRange
  ): Promise<SensorWithHistory> {
    try {
      const data = await this.fetchWithHistory(id, range);
      await this.persistIfCountrySensor(id, data);
      return data;
    } catch (err) {
      const disk = await this.historyStore.read(id, range);
      if (disk?.history?.length) {
        const sensor =
          disk.sensor ??
          this.cache.getSensor(id) ??
          ({
            id,
            stationId: id,
            name: id,
            location: '',
            status: 'no_data',
            lastReadingAt: new Date(0).toISOString(),
            readings: [],
          } satisfies Sensor);
        this.cache.setSensor(sensor);
        this.cache.setHistory(id, range, disk.history);
        return { sensor, history: disk.history, range };
      }
      throw err;
    }
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

  private async persistIfCountrySensor(
    id: string,
    data: SensorWithHistory,
    countryIdHint?: number | null,
    sensorHint?: Sensor | null
  ): Promise<void> {
    const user = await this.auth.getUser();
    const countryId = countryIdHint ?? user?.countryId ?? null;
    const countryName = user?.country ?? null;
    const sensor = data.sensor ?? sensorHint ?? null;
    if (!sensor) {
      return;
    }
    if (!sensorBelongsToUserCountry(sensor, countryId, countryName)) {
      return;
    }

    // Solo el rango 30d alimenta la rotación en disco; 7d/6m quedan en memoria.
    if (data.range === '30d') {
      await this.historyStore.write(id, data.history, {
        sensor,
        countryId,
      });
    }
  }

  private flightKey(id: string, range: HistoryRange): string {
    return `${id}|${range}`;
  }
}
