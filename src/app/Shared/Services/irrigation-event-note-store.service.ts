import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { firstValueFrom } from 'rxjs';

import {
  CreateIrrigationEventNotePayload,
  IrrigationEventNoteRecord,
} from '../Models/irrigation-event-note';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

const CACHE_KEY_PREFIX = 'hidrix_irrigation_event_notes_';

/**
 * Persistencia de notas de evento de riego (API + caché local).
 */
@Injectable({ providedIn: 'root' })
export class IrrigationEventNoteStoreService {
  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService
  ) {}

  /** Lista todas las notas del usuario. */
  async list(): Promise<IrrigationEventNoteRecord[]> {
    try {
      const token = await this.auth.getValidAccessToken();
      if (!token) {
        return this.readCache();
      }
      const remote = await firstValueFrom(
        this.api.get<IrrigationEventNoteRecord[]>(
          '/irrigation-event-notes',
          { token }
        )
      );
      await this.writeCache(remote);
      return this.sortNotes(remote);
    } catch {
      return this.readCache();
    }
  }

  /** Guarda una nota en la API y actualiza caché local. */
  async save(
    payload: CreateIrrigationEventNotePayload
  ): Promise<IrrigationEventNoteRecord> {
    const token = await this.auth.getValidAccessToken();
    if (!token) {
      throw new Error('Sesión expirada. Vuelva a iniciar sesión.');
    }
    const created = await firstValueFrom(
      this.api.post<IrrigationEventNoteRecord>(
        '/irrigation-event-notes',
        payload,
        token
      )
    );

    const cached = await this.readCache();
    const next = this.sortNotes([
      created,
      ...cached.filter((r) => r.id !== created.id),
    ]);
    await this.writeCache(next);
    return created;
  }

  private async cacheKey(): Promise<string> {
    const user = await this.auth.getUser();
    const userPart = user?.id ?? 'anon';
    return `${CACHE_KEY_PREFIX}${userPart}`;
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
}
