/** Registro guardado de la calculadora de riego. */
export interface IrrigationCalculationRecord {
  id: number;
  cropName: string;
  cropId?: number | null;
  fieldCapacity: number;
  maxIrrigationLimit: number;
  irrigationDecision: number;
  consultationDate: string;
  morningMoisture: number;
  afternoonMoisture: number;
  recommendation: string;
  irrigationAction?: string | null;
  observation?: string | null;
}

export interface CreateIrrigationCalculationPayload {
  cropName: string;
  cropId?: number | null;
  fieldCapacity: number;
  maxIrrigationLimit: number;
  irrigationDecision: number;
  consultationDate: string;
  morningMoisture: number;
  afternoonMoisture: number;
  recommendation: string;
  irrigationAction?: string | null;
  observation?: string | null;
}
