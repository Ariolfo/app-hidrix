import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { GeoCity, GeoCountry, GeoDepartment } from '../Models/geo';
import { ApiService } from './api.service';

/** Mismo tope que autenticación: el catálogo se pide desde el registro. */
const GEO_TIMEOUT_MS = 20_000;

const GEO_TIMEOUT_MESSAGE =
  'El servidor tardó demasiado en responder (puede estar iniciando). Inténtalo de nuevo en unos segundos.';

const GEO_OPTIONS = {
  timeoutMs: GEO_TIMEOUT_MS,
  timeoutMessage: GEO_TIMEOUT_MESSAGE,
};

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
    return firstValueFrom(this.api.get<GeoCountry[]>('/geo/countries', GEO_OPTIONS));
  }

  /**
   * Obtiene departamentos de un país.
   * @param paisId Identificador del país.
   */
  async getDepartments(paisId: number): Promise<GeoDepartment[]> {
    return firstValueFrom(
      this.api.get<GeoDepartment[]>(
        `/geo/countries/${paisId}/departments`,
        GEO_OPTIONS
      )
    );
  }

  /**
   * Obtiene ciudades/municipios de un departamento.
   * @param depoId Identificador del departamento.
   */
  async getCities(depoId: number): Promise<GeoCity[]> {
    return firstValueFrom(
      this.api.get<GeoCity[]>(`/geo/departments/${depoId}/cities`, GEO_OPTIONS)
    );
  }
}
