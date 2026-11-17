import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { firstValueFrom } from 'rxjs';

import { GeoCity, GeoCountry, GeoDepartment } from '../Models/geo';
import { ApiService } from './api.service';

const COUNTRIES_KEY = 'reguemos_geo_countries_v1';
const DEPTS_PREFIX = 'reguemos_geo_depts_';
const CITIES_PREFIX = 'reguemos_geo_cities_';

/**
 * Catálogo geográfico cascada: país → departamento → ciudad.
 * Con respaldo local para notas de riego offline.
 */
@Injectable({ providedIn: 'root' })
export class GeoService {
  constructor(private readonly api: ApiService) {}

  /**
   * Obtiene la lista de países disponibles.
   */
  async getCountries(): Promise<GeoCountry[]> {
    try {
      const rows = await firstValueFrom(
        this.api.get<GeoCountry[]>('/geo/countries')
      );
      await Preferences.set({
        key: COUNTRIES_KEY,
        value: JSON.stringify(rows),
      });
      return rows;
    } catch (err) {
      const disk = await this.readJson<GeoCountry[]>(COUNTRIES_KEY);
      if (disk?.length) {
        return disk;
      }
      throw err;
    }
  }

  /**
   * Obtiene departamentos de un país.
   * @param paisId Identificador del país.
   */
  async getDepartments(paisId: number): Promise<GeoDepartment[]> {
    const key = `${DEPTS_PREFIX}${paisId}`;
    try {
      const rows = await firstValueFrom(
        this.api.get<GeoDepartment[]>(`/geo/countries/${paisId}/departments`)
      );
      await Preferences.set({ key, value: JSON.stringify(rows) });
      return rows;
    } catch (err) {
      const disk = await this.readJson<GeoDepartment[]>(key);
      if (disk?.length) {
        return disk;
      }
      throw err;
    }
  }

  /**
   * Obtiene ciudades/municipios de un departamento.
   * @param depoId Identificador del departamento.
   */
  async getCities(depoId: number): Promise<GeoCity[]> {
    const key = `${CITIES_PREFIX}${depoId}`;
    try {
      const rows = await firstValueFrom(
        this.api.get<GeoCity[]>(`/geo/departments/${depoId}/cities`)
      );
      await Preferences.set({ key, value: JSON.stringify(rows) });
      return rows;
    } catch (err) {
      const disk = await this.readJson<GeoCity[]>(key);
      if (disk?.length) {
        return disk;
      }
      throw err;
    }
  }

  private async readJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await Preferences.get({ key });
      if (!raw.value) {
        return null;
      }
      return JSON.parse(raw.value) as T;
    } catch {
      return null;
    }
  }
}
