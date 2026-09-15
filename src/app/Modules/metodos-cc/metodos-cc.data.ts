/** Método de estimación de capacidad de campo (catálogo local del módulo). */
export interface MetodoCCEntry {
  name: string;
  description: string;
  reference: string;
  key: FcMethodKey;
}

export type FcMethodKey = 'swdp-r' | 'swdp-k' | 'r-sax';

/** Métodos automatizados Bean et al. (2018) / SWDP_Cesar. */
export const METODOS_CC_AUTOMATIZADOS: readonly MetodoCCEntry[] = [
  {
    key: 'swdp-r',
    name: 'SWDP-R',
    description:
      'Regresión OLS de θ sobre 1/t en el miembro de secado tras un pico SWDP; la intersección estima θ_FC.',
    reference: 'Bean, Huffaker & Migliaccio (2018), Vadose Zone J. 17:180073',
  },
  {
    key: 'swdp-k',
    name: 'SWDP-K',
    description:
      'Estimación de θ_FC en la "rodilla" de la curva de secado: punto de máximo desplazamiento perpendicular a la cuerda entre extremos.',
    reference: 'Bean, Huffaker & Migliaccio (2018), Vadose Zone J. 17:180073',
  },
  {
    key: 'r-sax',
    name: 'R-SAX',
    description:
      'Identificación estricta de ciclos válidos (patrón SAX); la θ_FC se estima con SWDP-R sobre el mejor ciclo validado.',
    reference: 'Bean, Huffaker & Migliaccio (2018), Vadose Zone J. 17:180073',
  },
];

export function findMetodoByKey(key: string | null): MetodoCCEntry | null {
  if (!key) {
    return null;
  }
  return METODOS_CC_AUTOMATIZADOS.find((m) => m.key === key) ?? null;
}
