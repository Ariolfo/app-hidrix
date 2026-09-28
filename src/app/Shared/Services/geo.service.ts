import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { GeoCity, GeoCountry, GeoDepartment } from '../Models/geo';
import { ApiService } from './api.service';

/**
 * Catálogo geográfico cascada: país → departamento → ciudad.
 */
@Injectable({ providedIn: 'root' })
export class GeoService {
  constructor(private readonly api: ApiService) {}

  /**
   * Obtiene la lista de países disponibles.
   */
  async getCountries(): Promise<GeoCountry[]> {
    return firstValueFrom(this.api.get<GeoCountry[]>('/geo/countries'));
  }

  /**
   * Obtiene departamentos de un país.
   * @param paisId Identificador del país.
   */
  async getDepartments(paisId: number): Promise<GeoDepartment[]> {
    return firstValueFrom(
      this.api.get<GeoDepartment[]>(`/geo/countries/${paisId}/departments`)
    );
  }

  /**
   * Obtiene ciudades/municipios de un departamento.
   * @param depoId Identificador del departamento.
   */
  async getCities(depoId: number): Promise<GeoCity[]> {
    return firstValueFrom(
      this.api.get<GeoCity[]>(`/geo/departments/${depoId}/cities`)
    );
  }
}
