import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { firstValueFrom } from 'rxjs';

import {
  CreateIrrigationEventNotePayload,
  IRRIGATION_EVENT_TYPES,
  IrrigationEventNoteRecord,
} from '../Models/irrigation-event-note';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

const CACHE_KEY_PREFIX = 'reguemos_irrigation_event_notes_';
const OUTBOX_PREFIX = 'reguemos_irrigation_event_notes_outbox_';

/** Resultado de guardar nota (online o cola offline). */
export interface IrrigationNoteSaveResult {
  record: IrrigationEventNoteRecord;
  synced: boolean;
}

/** Metadatos locales para pintar la nota pendiente sin red. */
export interface IrrigationNoteSaveMeta {
  departmentName?: string | null;
  cityName?: string | null;
  durationMinutes?: number;
}

interface PendingNote {
  localId: string;
  payload: CreateIrrigationEventNotePayload;
  record: IrrigationEventNoteRecord;
}

/**
 * Persistencia de notas de evento de riego (API + caché local + outbox).
 */
@Injectable({ providedIn: 'root' })
export class IrrigationEventNoteStoreService {
  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService
  ) {}

  /** Lista todas las notas del usuario (remotas + pendientes offline). */
  async list(): Promise<IrrigationEventNoteRecord[]> {
    try {
      const token = await this.auth.getValidAccessToken();
      if (!token) {
        return this.mergeWithPending(await this.readCache());
      }
      const remote = await firstValueFrom(
        this.api.get<IrrigationEventNoteRecord[]>(
          '/irrigation-event-notes',
          { token }
        )
      );
      await this.writeCache(remote);
      return this.mergeWithPending(remote);
    } catch {
      return this.mergeWithPending(await this.readCache());
    }
  }

  /** Guarda en API; sin red deja la nota en el celular para sincronizar después. */
  async save(
    payload: CreateIrrigationEventNotePayload,
    meta?: IrrigationNoteSaveMeta
  ): Promise<IrrigationNoteSaveResult> {
    const token = await this.auth.getValidAccessToken();
    if (!token) {
      // Sin token no podemos sincronizar luego con seguridad; igual permitimos cola
      // si había sesión hidratada (token expirado se refrescará al volver la red).
      const pending = this.buildPending(payload, meta);
      await this.enqueue(pending);
      await this.prependCache(pending.record);
      return { record: pending.record, synced: false };
    }

    try {
      const created = await firstValueFrom(
        this.api.post<IrrigationEventNoteRecord>(
          '/irrigation-event-notes',
          payload,
          token
        )
      );
      await this.prependCache(created);
      return { record: created, synced: true };
    } catch (err) {
      if (!this.isLikelyNetworkError(err)) {
        throw err;
      }
      const pending = this.buildPending(payload, meta);
      await this.enqueue(pending);
      await this.prependCache(pending.record);
      return { record: pending.record, synced: false };
    }
  }

  /** Envía la cola offline al servidor. */
  async flushOutbox(): Promise<number> {
    const pending = await this.readOutbox();
    if (!pending.length) {
      return 0;
    }
    const token = await this.auth.getValidAccessToken();
    if (!token) {
      return 0;
    }

    const remaining: PendingNote[] = [];
    let synced = 0;
    for (const item of pending) {
      try {
        const created = await firstValueFrom(
          this.api.post<IrrigationEventNoteRecord>(
            '/irrigation-event-notes',
            item.payload,
            token
          )
        );
        await this.replacePendingInCache(item.record.id, created);
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
    payload: CreateIrrigationEventNotePayload,
    meta?: IrrigationNoteSaveMeta
  ): PendingNote {
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const typeLabel =
      IRRIGATION_EVENT_TYPES.find((t) => t.value === payload.irrigationType)
        ?.label ?? payload.irrigationType;
    const duration =
      meta?.durationMinutes ??
      this.estimateDurationMinutes(payload.startTime, payload.endTime) ??
      0;
    const record: IrrigationEventNoteRecord = {
      id: -Math.abs(Date.now() % 1_000_000_000),
      plotName: payload.plotName,
      cropName: payload.cropName,
      cropId: payload.cropId,
      eventDate: payload.eventDate,
      startTime: payload.startTime,
      endTime: payload.endTime,
      durationMinutes: duration,
      irrigationType: payload.irrigationType,
      irrigationTypeLabel: typeLabel,
      flowRateLph: payload.flowRateLph,
      soilType: payload.soilType,
      cityId: payload.cityId,
      departmentName: meta?.departmentName ?? null,
      cityName: meta?.cityName ?? null,
    };
    return { localId, payload, record };
  }

  private estimateDurationMinutes(
    startTime: string,
    endTime: string
  ): number | null {
    const start = this.parseTime(startTime);
    const end = this.parseTime(endTime);
    if (start == null || end == null) {
      return null;
    }
    if (end >= start) {
      return end - start;
    }
    return 24 * 60 - start + end;
  }

  private parseTime(raw: string): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
    if (!match) {
      return null;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }
    return hours * 60 + minutes;
  }

  private async mergeWithPending(
    rows: IrrigationEventNoteRecord[]
  ): Promise<IrrigationEventNoteRecord[]> {
    const pending = await this.readOutbox();
    if (!pending.length) {
      return this.sortNotes(rows);
    }
    return this.sortNotes([
      ...pending.map((p) => p.record),
      ...rows.filter((r) => r.id > 0),
    ]);
  }

  private async prependCache(created: IrrigationEventNoteRecord): Promise<void> {
    const cached = await this.readCache();
    const next = this.sortNotes([
      created,
      ...cached.filter((r) => r.id !== created.id),
    ]);
    await this.writeCache(next);
  }

  private async replacePendingInCache(
    pendingId: number,
    created: IrrigationEventNoteRecord
  ): Promise<void> {
    const cached = await this.readCache();
    const next = this.sortNotes([
      created,
      ...cached.filter((r) => r.id !== pendingId && r.id !== created.id),
    ]);
    await this.writeCache(next);
  }

  private async cacheKey(): Promise<string> {
    const user = await this.auth.getUser();
    const userPart = user?.id ?? 'anon';
    return `${CACHE_KEY_PREFIX}${userPart}`;
  }

  private async outboxKey(): Promise<string> {
    const user = await this.auth.getUser();
    return `${OUTBOX_PREFIX}${user?.id ?? 'anon'}`;
  }

  private async readCache(): Promise<IrrigationEventNoteRecord[]> {
    const key = await this.cacheKey();
    const raw = await Preferences.get({ key });
    if (!raw.value) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw.value) as IrrigationEventNoteRecord[];
      if (!Array.isArray(parsed)) {
        return [];
      }
      return this.sortNotes(parsed);
    } catch {
      return [];
    }
  }

  private async writeCache(rows: IrrigationEventNoteRecord[]): Promise<void> {
    const key = await this.cacheKey();
    await Preferences.set({ key, value: JSON.stringify(rows) });
  }

  private async readOutbox(): Promise<PendingNote[]> {
    const raw = await Preferences.get({ key: await this.outboxKey() });
    if (!raw.value) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw.value) as PendingNote[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async writeOutbox(rows: PendingNote[]): Promise<void> {
    await Preferences.set({
      key: await this.outboxKey(),
      value: JSON.stringify(rows),
    });
  }

  private async enqueue(item: PendingNote): Promise<void> {
    const current = await this.readOutbox();
    current.push(item);
    await this.writeOutbox(current);
  }

  private sortNotes(
    rows: IrrigationEventNoteRecord[]
  ): IrrigationEventNoteRecord[] {
    return [...rows].sort((a, b) => {
      if (a.eventDate === b.eventDate) {
        return b.startTime.localeCompare(a.startTime) || b.id - a.id;
      }
      return b.eventDate.localeCompare(a.eventDate);
    });
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
