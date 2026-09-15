import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  AssignSensorCropPayload,
  CatalogSensor,
  Network,
  SaveEstimatedFieldCapacityPayload,
} from '../Models/catalog';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

/**
 * Metadatos de sensores Visualiti (cultivo / CC) desde la API Hidrix.
 */
@Injectable({ providedIn: 'root' })
export class CatalogSensorService {
  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService
  ) {}

  async listSensors(): Promise<CatalogSensor[]> {
    const token = await this.auth.getAccessToken();
    return firstValueFrom(
      this.api.get<CatalogSensor[]>('/catalog/sensors', { token })
    );
  }

  async getById(id: number): Promise<CatalogSensor> {
    const token = await this.auth.getAccessToken();
    return firstValueFrom(
      this.api.get<CatalogSensor>(`/catalog/sensors/${id}`, { token })
    );
  }

  async listNetworks(): Promise<Network[]> {
    const token = await this.auth.getAccessToken();
    return firstValueFrom(
      this.api.get<Network[]>('/catalog/networks', { token })
    );
  }

  async assignCrop(payload: AssignSensorCropPayload): Promise<CatalogSensor> {
    const token = await this.auth.getAccessToken();
    return firstValueFrom(
      this.api.post<CatalogSensor>('/catalog/sensors', payload, token)
    );
  }

  async updateCrop(
    id: number,
    payload: AssignSensorCropPayload
  ): Promise<CatalogSensor> {
    const token = await this.auth.getAccessToken();
    return firstValueFrom(
      this.api.put<CatalogSensor>(`/catalog/sensors/${id}`, payload, token)
    );
  }

  /** Quita cultivo/finca; conserva CC estimada. */
  async clearCrop(id: number): Promise<void> {
    const token = await this.auth.getAccessToken();
    await firstValueFrom(
      this.api.delete<{ ok: boolean }>(`/catalog/sensors/${id}`, token)
    );
  }

  async saveEstimatedFieldCapacity(
    id: number,
    payload: SaveEstimatedFieldCapacityPayload
  ): Promise<CatalogSensor> {
    const token = await this.auth.getAccessToken();
    return firstValueFrom(
      this.api.patch<CatalogSensor>(
        `/catalog/sensors/${id}/estimated-field-capacity`,
        payload,
        { token }
      )
    );
  }
}
