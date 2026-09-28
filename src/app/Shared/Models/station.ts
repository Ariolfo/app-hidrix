import { Sensor } from './sensor';

/** Estación (finca o sensor suelto) en el mapa. */
export interface Station {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  sensorCount: number;
  distanceKm?: number | null;
  online?: boolean | null;
  connectivity?: string | null;
  hardwareStatus?: string | null;
  sensors: Sensor[];
}
