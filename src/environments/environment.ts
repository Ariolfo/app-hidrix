/**
 * Desarrollo + emulador Android.
 * Preferir `adb reverse tcp:5080 tcp:5080` y esta URL (127.0.0.1).
 * Alternativa: http://10.0.2.2:5080/api/v1 si la API escucha en 0.0.0.0.
 */
export const environment = {
  production: false,
  apiBaseUrl: 'http://api.hidrix.com.co/api/v1',
  defaultLat: 4.5255,
  defaultLng: -76.0755,
  /** Radio inicial alrededor del GPS del usuario. */
  defaultRadiusKm: 50,
  /** Radio ampliado al clúster operativo (Roldanillo) si no hay sensores cerca. */
  fallbackRadiusKm: 150,
  appName: 'Yarqua',
};
