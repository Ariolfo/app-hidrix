/** Usuario autenticado. */
export interface User {
  id: string;
  name: string;
  email: string;
  roles: string[];
  country?: string;
  department?: string;
  city?: string;
  countryId?: number | null;
  departmentId?: number | null;
  cityId?: number | null;
}

/** Cuerpo de registro. */
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  country: string;
  department: string;
  city: string;
  deviceId?: string;
  platform: string;
}

/** Cuerpo de login. */
export interface LoginRequest {
  email: string;
  password: string;
  deviceId?: string;
  platform: string;
}

/** Respuesta de registro / login. */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  emailConfirmationRequired?: boolean;
}

/** Respuesta de refresh. */
export interface RefreshResponse {
  accessToken: string;
  refreshToken?: string | null;
}
