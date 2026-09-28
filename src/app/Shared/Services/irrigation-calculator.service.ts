import { Injectable } from '@angular/core';

import { IrrigationCropProfile, IrrigationRecommendation } from '../Models/irrigation';
import { CropService } from './crop.service';

/**
 * Calculadora de riego: perfiles desde tabla de cultivos (API).
 */
@Injectable({ providedIn: 'root' })
export class IrrigationCalculatorService {
  private profiles: IrrigationCropProfile[] = [];

  constructor(private readonly crops: CropService) {}

  /** Perfiles cargados (vacío hasta loadProfiles). */
  get cropProfiles(): readonly IrrigationCropProfile[] {
    return this.profiles;
  }

  /** Carga perfiles desde HidrtbCultivo. */
  async loadProfiles(force = false): Promise<readonly IrrigationCropProfile[]> {
    if (force) {
      this.crops.invalidate();
    }
    this.profiles = await this.crops.asIrrigationProfiles();
    return this.profiles;
  }

  recommendation(
    morningMoisture: number,
    afternoonMoisture: number,
    irrigationDecision: number
  ): IrrigationRecommendation {
    return morningMoisture >= irrigationDecision &&
      afternoonMoisture >= irrigationDecision
      ? 'No regar'
      : 'Regar';
  }

  getProfile(name: string): IrrigationCropProfile | undefined {
    return this.profiles.find((c) => c.name === name);
  }

  resolveProfileFromText(text: string): IrrigationCropProfile {
    const normalized = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');

    for (const profile of this.profiles) {
      const n = profile.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '');
      if (normalized.includes(n) || n.includes(normalized)) {
        return profile;
      }
    }

    if (normalized.includes('aguacate')) {
      return this.getProfile('Aguacate') ?? this.fallback();
    }
    if (normalized.includes('cacao')) {
      return this.getProfile('Cacao') ?? this.fallback();
    }
    if (normalized.includes('papaya')) {
      return this.getProfile('Papaya') ?? this.fallback();
    }
    if (normalized.includes('lima') || normalized.includes('tahiti')) {
      return this.getProfile('Lima') ?? this.fallback();
    }

    return this.getProfile('Cacao') ?? this.fallback();
  }

  private fallback(): IrrigationCropProfile {
    return (
      this.profiles[0] ?? {
        name: 'Cacao',
        fieldCapacity: 34,
        maxIrrigationLimit: 27.2,
        irrigationDecision: 21.76,
      }
    );
  }
}
