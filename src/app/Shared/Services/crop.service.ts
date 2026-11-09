import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Crop, CreateCropPayload } from '../Models/catalog';
import { IrrigationCropProfile } from '../Models/irrigation';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

/**
 * Catálogo de cultivos desde la API (tabla HidrtbCultivo).
 */
@Injectable({ providedIn: 'root' })
export class CropService {
  private cache: Crop[] | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService
  ) {}

  /** Lista cultivos (con caché en memoria de sesión). */
  async list(force = false): Promise<Crop[]> {
    if (!force && this.cache) {
      return this.cache;
    }
    const token = await this.auth.getAccessToken();
    this.cache = await firstValueFrom(this.api.get<Crop[]>('/crops', { token }));
    return this.cache;
  }

  /** Obtiene un cultivo por id. */
  async getById(id: number): Promise<Crop> {
    const token = await this.auth.getAccessToken();
    return firstValueFrom(this.api.get<Crop>(`/crops/${id}`, { token }));
  }

  /** Crea un cultivo y limpia caché. */
  async create(payload: CreateCropPayload): Promise<Crop> {
    const token = await this.auth.getAccessToken();
    const created = await firstValueFrom(
      this.api.post<Crop>('/crops', payload, token)
    );
    this.cache = null;
    return created;
  }

  /** Actualiza un cultivo y limpia caché. */
  async update(id: number, payload: CreateCropPayload): Promise<Crop> {
    const token = await this.auth.getAccessToken();
    const updated = await firstValueFrom(
      this.api.put<Crop>(`/crops/${id}`, payload, token)
    );
    this.cache = null;
    return updated;
  }

  /** Inactiva un cultivo y limpia caché. */
  async remove(id: number): Promise<void> {
    const token = await this.auth.getAccessToken();
    await firstValueFrom(this.api.delete<{ ok: boolean }>(`/crops/${id}`, token));
    this.cache = null;
  }

  /** Perfiles para la calculadora. */
  async asIrrigationProfiles(): Promise<IrrigationCropProfile[]> {
    const crops = await this.list();
    return crops.map((c) => ({
      name: c.name,
      fieldCapacity: c.fieldCapacity,
      maxIrrigationLimit: c.maxIrrigationLimit,
      irrigationDecision: c.irrigationDecision,
    }));
  }

  /** Invalida caché. */
  invalidate(): void {
    this.cache = null;
  }
}
