import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.agrosavia.hidrix',
  appName: 'Hidrix',
  webDir: 'www',
  server: {
    // Capacitor sirve la app como https://localhost; las llamadas HTTP a la API
    // se hacen vía CapacitorHttp nativo (evita mixed-content / CORS del WebView).
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    Preferences: {},
    Geolocation: {},
    StatusBar: {
      overlaysWebView: false,
      style: 'LIGHT',
      backgroundColor: '#ffffff',
    },
    SystemBars: {
      insetsHandling: 'css',
      style: 'LIGHT',
    },
  },
};

export default config;
