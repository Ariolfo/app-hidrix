import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Station } from '../Models/station';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

/**
 * Consulta estaciones cercanas al punto del usuario.
 */
@Injectable({ providedIn: 'root' })
export class StationService {
  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService
  ) {}

  /**
   * Lista estaciones dentro del radio (km) alrededor de lat/lng.
   * @param all Si true, incluye todo el catálogo geolocalizado (CO/EC/HN).
   */
  async getNearby(
    lat: number,
    lng: number,
    radius: number = environment.defaultRadiusKm,
    includeSensors = true,
    all = false
  ): Promise<Station[]> {
    const token = await this.auth.getAccessToken();
    return firstValueFrom(
      this.api.get<Station[]>('/stations', {
        token,
        params: {
          lat,
          lng,
          radius,
          includeSensors,
          all,
        },
      })
    );
  }
}
