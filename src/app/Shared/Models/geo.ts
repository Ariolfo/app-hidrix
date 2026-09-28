/** País del catálogo geográfico. */
export interface GeoCountry {
  id: number;
  name: string;
}

/** Departamento / provincia. */
export interface GeoDepartment {
  id: number;
  code: string;
  name: string;
  paisId: number;
}

/** Ciudad / municipio. */
export interface GeoCity {
  id: number;
  code: string;
  name: string;
  depoId: number;
}

/** Ubicación del usuario autenticado (ids del catálogo). */
export interface UserLocation {
  countryId: number | null;
  departmentId: number | null;
  cityId: number | null;
  countryName: string | null;
  departmentName: string | null;
  cityName: string | null;
}
