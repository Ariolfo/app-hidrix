import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';

import { Sensor } from '../Models/sensor';
import { Station } from '../Models/station';
import { sensorBelongsToUserCountry } from '../Utils/country-station';
import { AuthService } from './auth.service';
import { SensorHistoryStoreService } from './sensor-history-store.service';
import { SensorService } from './sensor.service';

/**
 * Descarga en segundo plano el histórico 30d de sensores del país del usuario.
 * El catálogo de estaciones (snapshot) sigue a cargo de StationCacheService.
 */
@Injectable({ providedIn: 'root' })
export class CountryHistorySyncService {
  private running = false;
  private lastStartedAt = 0;

  constructor(
    private readonly auth: AuthService,
    private readonly sensorService: SensorService,
    private readonly historyStore: SensorHistoryStoreService
  ) {}

  /**
   * Lanza la descarga (no bloquea). Ignora si ya hay una en curso o fue hace <5 min.
   */
  scheduleFromStations(stations: Station[]): void {
    void this.syncFromStations(stations).catch(() => {
      // Silencioso: el detalle reintentará al abrir el sensor.
    });
  }

  /** Descarga secuencial (lotes) del histórico 30d del país. */
  async syncFromStations(stations: Station[]): Promise<void> {
    if (this.running) {
      return;
    }
    if (Date.now() - this.lastStartedAt < 5 * 60 * 1000) {
      return;
    }

    const status = await Network.getStatus().catch(() => ({
      connected: true,
    }));
    if (!status.connected) {
      return;
    }

    const user = await this.auth.getUser();
    const countryId = user?.countryId ?? null;
    const countryName = user?.country ?? null;
    if (countryId == null && !countryName) {
      return;
    }

    const sensors = this.collectCountrySensors(stations, countryId, countryName);
    if (!sensors.length) {
      return;
    }

    this.running = true;
    this.lastStartedAt = Date.now();
    try {
      await this.historyStore.retainOnly(sensors.map((s) => s.id));

      // Parallelismo bajo para no saturar Visualiti vía API.
      const concurrency = 2;
      for (let i = 0; i < sensors.length; i += concurrency) {
        const batch = sensors.slice(i, i + concurrency);
        await Promise.all(
          batch.map((sensor) =>
            this.sensorService
              .prefetchPersist30d(sensor.id, sensor, countryId)
              .catch(() => undefined)
          )
        );
      }
    } finally {
      this.running = false;
    }
  }

  private collectCountrySensors(
    stations: Station[],
    countryId: number | null,
    countryName: string | null
  ): Sensor[] {
    const byId = new Map<string, Sensor>();
    for (const st of stations) {
      for (const sensor of st.sensors ?? []) {
        if (!sensor?.id) {
          continue;
        }
        if (
          !sensorBelongsToUserCountry(
            {
              id: sensor.id,
              stationId: sensor.stationId || st.id,
              timeZoneId: sensor.timeZoneId,
            },
            countryId,
            countryName
          )
        ) {
          continue;
        }
        byId.set(sensor.id, {
          ...sensor,
          stationId: sensor.stationId || st.id,
        });
      }
    }
    return [...byId.values()];
  }
}
