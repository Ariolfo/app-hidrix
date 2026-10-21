/** Sobre uniforme de respuesta de la API Reguemos. */
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
}
