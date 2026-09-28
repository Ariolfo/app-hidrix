/** Valor interno de la opción «Otro cultivo» en los selectores. */
export const OTHER_CROP_VALUE = '__other_crop__';

/** Etiqueta visible de la opción «Otro cultivo». */
export const OTHER_CROP_LABEL = 'Otro cultivo';

/** Perfil de cultivo para la calculadora de riego local. */
export interface IrrigationCropProfile {
  name: string;
  fieldCapacity: number;
  maxIrrigationLimit: number;
  irrigationDecision: number;
}

/** Recomendación de riego. */
export type IrrigationRecommendation = 'No regar' | 'Regar';
