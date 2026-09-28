/** Sobre uniforme de respuesta de la API Hidrix. */
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
}
