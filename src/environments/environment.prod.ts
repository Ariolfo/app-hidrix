/**
 * Configuración de producción (Capacitor / APK).
 * El teléfono habla con la API pública del túnel Reguemos.
 * La PWA local usa environment.pwa.ts (apiBaseUrl '/api/v1').
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://reguemos.ngrok.app/api/v1',
  defaultLat: 4.5255,
  defaultLng: -76.0755,
  defaultRadiusKm: 50,
  fallbackRadiusKm: 150,
  appName: 'Reguemos',
};
