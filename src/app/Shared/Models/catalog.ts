/** Cultivo del catálogo Hidrix. */
export interface Crop {
  id: number;
  name: string;
  fieldCapacity: number;
  maxIrrigationLimit: number;
  irrigationDecision: number;
}

/** Red de sensores con país. */
export interface Network {
  id: number;
  name: string;
  countryId: number;
  countryName: string;
}

/** Sensor Visualiti + metadatos Hidrix (cultivo / CC). */
export interface CatalogSensor {
  id: number;
  name: string;
  deviceName?: string | null;
  networkId: number;
  networkName: string;
  countryId: number;
  countryName: string;
  cropId?: number | null;
  cropName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  sensorStatus?: string | null;
  connectivity?: string | null;
  farm?: string | null;
  estimatedFieldCapacity?: number | null;
  estimationMethod?: string | null;
  estimationDate?: string | null;
}

export interface SaveEstimatedFieldCapacityPayload {
  fieldCapacity: number;
  method: string;
  estimatedAt?: string;
}

export interface CreateCropPayload {
  name: string;
  fieldCapacity: number;
  maxIrrigationLimit: number;
  irrigationDecision: number;
}

/** Asigna o actualiza cultivo/finca de un sensor Visualiti. */
export interface AssignSensorCropPayload {
  name: string;
  cropId?: number | null;
  farm?: string | null;
}
