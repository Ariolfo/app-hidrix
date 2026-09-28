import { CatalogSensor } from '../../Shared/Models/catalog';
import {
  CatalogSensorOption,
  CropSensorGroup,
  MoistureChannel,
} from './fc-estimate.models';

/** Canal de humedad según id lógico (M316-1 → 10 cm, M316-2 → 30 cm). */
export function moistureChannelFromSensorId(sensorId: string): MoistureChannel {
  const match = sensorId.trim().match(/-(\d+)$/);
  if (match?.[1] === '2') {
    return '30cm';
  }
  return '10cm';
}

/** Etiqueta visible: M316-1-Colombia */
export function sensorDisplayLabel(
  sensorId: string,
  countryName?: string | null
): string {
  const id = sensorId.trim();
  const country = (countryName || 'Sin país').trim();
  return `${id}-${country}`;
}

/** Expande sensores físicos del catálogo a ids lógicos M###-1, M###-2. */
export function expandCatalogSensors(
  sensors: CatalogSensor[]
): CatalogSensorOption[] {
  const options: CatalogSensorOption[] = [];

  for (const s of sensors) {
    const name = s.name.trim();
    const base = {
      catalogId: s.id,
      countryName: s.countryName,
      cropName: s.cropName ?? null,
    };

    if (/-\d+$/.test(name)) {
      options.push({
        ...base,
        sensorId: name,
        label: sensorDisplayLabel(name, s.countryName),
      });
      continue;
    }

    const id1 = `${name}-1`;
    const id2 = `${name}-2`;
    options.push(
      {
        ...base,
        sensorId: id1,
        label: sensorDisplayLabel(id1, s.countryName),
      },
      {
        ...base,
        sensorId: id2,
        label: sensorDisplayLabel(id2, s.countryName),
      }
    );
  }

  return options.sort((a, b) =>
    a.label.localeCompare(b.label, 'es', { numeric: true })
  );
}

/** Agrupa sensores lógicos por cultivo (orden alfabético). */
export function groupSensorsByCrop(sensors: CatalogSensor[]): CropSensorGroup[] {
  const byCrop = new Map<string, CatalogSensorOption[]>();

  for (const option of expandCatalogSensors(sensors)) {
    const crop = (option.cropName || 'Sin cultivo').trim();
    if (!byCrop.has(crop)) {
      byCrop.set(crop, []);
    }
    byCrop.get(crop)!.push(option);
  }

  return [...byCrop.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([cropName, list]) => ({
      cropName,
      sensors: list.sort((a, b) =>
        a.label.localeCompare(b.label, 'es', { numeric: true })
      ),
    }));
}

/** Fechas por defecto: últimos 6 meses (máximo histórico API). */
export function defaultStudyRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 6);
  return {
    start: toIsoDate(start),
    end: toIsoDate(end),
  };
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
