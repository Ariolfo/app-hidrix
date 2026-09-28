import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { firstValueFrom } from 'rxjs';

import {
  CreateIrrigationCalculationPayload,
  IrrigationCalculationRecord,
} from '../Models/irrigation-calculation';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

const CACHE_PREFIX = 'hidrix_irrigation_calc_';

/**
 * Persistencia de registros de la calculadora (API + caché local).
 */
@Injectable({ providedIn: 'root' })
export class IrrigationCalculationStoreService {
  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService
  ) {}

  /**
   * Lista registros del cultivo actual: API primero, caché como respaldo.
   */
  async listByCrop(cropName: string): Promise<IrrigationCalculationRecord[]> {
    const name = cropName.trim();
    if (!name) {
      return [];
    }

    try {
      const token = await this.auth.getAccessToken();
      const remote = await firstValueFrom(
        this.api.get<IrrigationCalculationRecord[]>(
          '/irrigation-calculations',
          { token, params: { crop: name } }
        )
      );
      await this.writeCache(name, remote);
      return [...remote].sort((a, b) =>
        a.consultationDate === b.consultationDate
          ? a.id - b.id
          : a.consultationDate.localeCompare(b.consultationDate)
      );
    } catch {
      return this.readCache(name);
    }
  }

  /**
   * Guarda en API y actualiza caché local del celular.
   */
  async save(
    payload: CreateIrrigationCalculationPayload
  ): Promise<IrrigationCalculationRecord> {
    const token = await this.auth.getAccessToken();
    const created = await firstValueFrom(
      this.api.post<IrrigationCalculationRecord>(
        '/irrigation-calculations',
        payload,
        token
      )
    );

    const cached = await this.readCache(payload.cropName);
    const next = [
      created,
      ...cached.filter((r) => r.id !== created.id),
    ].sort((a, b) =>
      a.consultationDate === b.consultationDate
        ? a.id - b.id
        : a.consultationDate.localeCompare(b.consultationDate)
    );
    await this.writeCache(payload.cropName, next);
    return created;
  }

  private async cacheKey(cropName: string): Promise<string> {
    const user = await this.auth.getUser();
    const userPart = user?.id ?? 'anon';
    return `${CACHE_PREFIX}${userPart}_${cropName.trim().toLowerCase()}`;
  }

  private async readCache(
    cropName: string
  ): Promise<IrrigationCalculationRecord[]> {
    const key = await this.cacheKey(cropName);
    const raw = await Preferences.get({ key });
    if (!raw.value) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw.value) as IrrigationCalculationRecord[];
      if (!Array.isArray(parsed)) {
        return [];
      }
      return [...parsed].sort((a, b) =>
        a.consultationDate === b.consultationDate
          ? a.id - b.id
          : a.consultationDate.localeCompare(b.consultationDate)
      );
    } catch {
      return [];
    }
  }

  private async writeCache(
    cropName: string,
    rows: IrrigationCalculationRecord[]
  ): Promise<void> {
    const key = await this.cacheKey(cropName);
    await Preferences.set({ key, value: JSON.stringify(rows) });
  }
}
