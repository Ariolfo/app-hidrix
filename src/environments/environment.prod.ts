/**
 * Configuración de producción (Capacitor).
 * El host de producción de Reguemos todavía no existe; esta rama apunta
 * al API local para no llamar al servicio anterior.
 * La PWA servida en local usa environment.pwa.ts (apiBaseUrl '/api/v1').
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://api.hidrix.com.co/api/v1',
  defaultLat: 4.5255,
  defaultLng: -76.0755,
  defaultRadiusKm: 50,
  fallbackRadiusKm: 150,
  appName: 'Reguemos',
};
