/** Nota de evento de riego guardada en la API. */
export interface IrrigationEventNoteRecord {
  id: number;
  plotName: string;
  cropName: string;
  cropId: number | null;
  eventDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  irrigationType: string;
  irrigationTypeLabel: string;
  flowRateLph: number | null;
  soilType: string | null;
  cityId: number | null;
  departmentName: string | null;
  cityName: string | null;
}

/** Payload para crear una nota de evento de riego. */
export interface CreateIrrigationEventNotePayload {
  plotName: string;
  cropName: string;
  cropId: number | null;
  eventDate: string;
  startTime: string;
  endTime: string;
  irrigationType: string;
  flowRateLph: number | null;
  soilType: string | null;
  cityId: number;
}

/** Opciones de tipo de riego en el formulario. */
export const IRRIGATION_EVENT_TYPES = [
  { value: 'goteo_terrestre', label: 'Goteo terrestre' },
  { value: 'subterraneo', label: 'Subterráneo' },
  { value: 'microaspersion', label: 'Microaspersión' },
  { value: 'aspersion', label: 'Aspersión' },
  { value: 'manual', label: 'Manual' },
] as const;
