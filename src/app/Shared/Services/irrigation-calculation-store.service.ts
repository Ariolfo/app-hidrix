import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { firstValueFrom } from 'rxjs';

import {
  CreateIrrigationCalculationPayload,
  IrrigationCalculationRecord,
} from '../Models/irrigation-calculation';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

const CACHE_PREFIX = 'reguemos_irrigation_calc_';
const OUTBOX_PREFIX = 'reguemos_irrigation_calc_outbox_';

/** Resultado de guardar (online o en cola offline). */
export interface IrrigationSaveResult {
  record: IrrigationCalculationRecord;
  synced: boolean;
}

interface PendingCalculation {
  localId: string;
  payload: CreateIrrigationCalculationPayload;
  record: IrrigationCalculationRecord;
}

/**
 * Persistencia de registros de la calculadora (API + caché local + outbox).
 */
@Injectable({ providedIn: 'root' })
export class IrrigationCalculationStoreService {
  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService
  ) {}

  /**
   * Lista registros del cultivo actual: API primero, caché + pendientes como respaldo.
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
      return this.mergeWithPending(name, remote);
    } catch {
      const cached = await this.readCache(name);
      return this.mergeWithPending(name, cached);
    }
  }

  /**
   * Guarda en API; si no hay red, deja el registro en el celular (outbox).
   */
  async save(
    payload: CreateIrrigationCalculationPayload
  ): Promise<IrrigationSaveResult> {
    try {
      const token = await this.auth.getAccessToken();
      const created = await firstValueFrom(
        this.api.post<IrrigationCalculationRecord>(
          '/irrigation-calculations',
          payload,
          token
        )
      );
      await this.prependCache(payload.cropName, created);
      return { record: created, synced: true };
    } catch (err) {
      if (!this.isLikelyNetworkError(err)) {
        throw err;
      }
      const pending = this.buildPending(payload);
      await this.enqueue(pending);
      await this.prependCache(payload.cropName, pending.record);
      return { record: pending.record, synced: false };
    }
  }

  /** Envía la cola offline al servidor. Devuelve cuántos se sincronizaron. */
  async flushOutbox(): Promise<number> {
    const pending = await this.readOutbox();
    if (!pending.length) {
      return 0;
    }

    const token = await this.auth.getValidAccessToken();
    if (!token) {
      return 0;
    }

    const remaining: PendingCalculation[] = [];
    let synced = 0;
    for (const item of pending) {
      try {
        const created = await firstValueFrom(
          this.api.post<IrrigationCalculationRecord>(
            '/irrigation-calculations',
            item.payload,
            token
          )
        );
        await this.replacePendingInCache(
          item.payload.cropName,
          item.record.id,
          created
        );
        synced += 1;
      } catch {
        remaining.push(item);
      }
    }
    await this.writeOutbox(remaining);
    return synced;
  }

  async pendingCount(): Promise<number> {
    return (await this.readOutbox()).length;
  }

  private buildPending(
    payload: CreateIrrigationCalculationPayload
  ): PendingCalculation {
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const record: IrrigationCalculationRecord = {
      id: -Math.abs(Date.now() % 1_000_000_000),
      cropName: payload.cropName,
      cropId: payload.cropId ?? null,
      fieldCapacity: payload.fieldCapacity,
      maxIrrigationLimit: payload.maxIrrigationLimit,
      irrigationDecision: payload.irrigationDecision,
      consultationDate: payload.consultationDate,
      morningMoisture: payload.morningMoisture,
      afternoonMoisture: payload.afternoonMoisture,
      recommendation: payload.recommendation,
      irrigationAction: payload.irrigationAction ?? null,
      observation: payload.observation ?? null,
    };
    return { localId, payload, record };
  }

  private async mergeWithPending(
    cropName: string,
    rows: IrrigationCalculationRecord[]
  ): Promise<IrrigationCalculationRecord[]> {
    const pending = (await this.readOutbox()).filter(
      (p) =>
        p.payload.cropName.trim().toLowerCase() ===
        cropName.trim().toLowerCase()
    );
    if (!pending.length) {
      return this.sortRows(rows);
    }
    const merged = [
      ...pending.map((p) => p.record),
      ...rows.filter((r) => r.id > 0),
    ];
    return this.sortRows(merged);
  }

  private async prependCache(
    cropName: string,
    created: IrrigationCalculationRecord
  ): Promise<void> {
    const cached = await this.readCache(cropName);
    const next = this.sortRows([
      created,
      ...cached.filter((r) => r.id !== created.id),
    ]);
    await this.writeCache(cropName, next);
  }

  private async replacePendingInCache(
    cropName: string,
    pendingId: number,
    created: IrrigationCalculationRecord
  ): Promise<void> {
    const cached = await this.readCache(cropName);
    const next = this.sortRows([
      created,
      ...cached.filter((r) => r.id !== pendingId && r.id !== created.id),
    ]);
    await this.writeCache(cropName, next);
  }

  private async cacheKey(cropName: string): Promise<string> {
    const user = await this.auth.getUser();
    const userPart = user?.id ?? 'anon';
    return `${CACHE_PREFIX}${userPart}_${cropName.trim().toLowerCase()}`;
  }

  private async outboxKey(): Promise<string> {
    const user = await this.auth.getUser();
    return `${OUTBOX_PREFIX}${user?.id ?? 'anon'}`;
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
      return this.sortRows(parsed);
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

  private async readOutbox(): Promise<PendingCalculation[]> {
    const raw = await Preferences.get({ key: await this.outboxKey() });
    if (!raw.value) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw.value) as PendingCalculation[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async writeOutbox(rows: PendingCalculation[]): Promise<void> {
    await Preferences.set({
      key: await this.outboxKey(),
      value: JSON.stringify(rows),
    });
  }

  private async enqueue(item: PendingCalculation): Promise<void> {
    const current = await this.readOutbox();
    current.push(item);
    await this.writeOutbox(current);
  }

  private sortRows(
    rows: IrrigationCalculationRecord[]
  ): IrrigationCalculationRecord[] {
    return [...rows].sort((a, b) =>
      a.consultationDate === b.consultationDate
        ? a.id - b.id
        : a.consultationDate.localeCompare(b.consultationDate)
    );
  }

  private isLikelyNetworkError(err: unknown): boolean {
    if (!err || typeof err !== 'object') {
      return true;
    }
    const status = (err as { status?: number }).status;
    if (status == null || status === 0) {
      return true;
    }
    return status >= 500;
  }
}
