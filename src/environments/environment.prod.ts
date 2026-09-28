/**
 * Configuración de producción (PWA / Capacitor APK).
 * API pública vía túnel ngrok.
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://api.hidrix.com.co/api/v1',
  defaultLat: 4.5255,
  defaultLng: -76.0755,
  defaultRadiusKm: 50,
  fallbackRadiusKm: 150,
  appName: 'Hidrix',
};
