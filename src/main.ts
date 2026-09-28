import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Capacitor } from '@capacitor/core';

import { AppModule } from './app/app.module';

/**
 * En Capacitor (APK/IPA) se desregistra cualquier SW residual del bundle web,
 * para no mezclar caché PWA con la app nativa.
 */
async function clearNativeServiceWorkers(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) {
    return;
  }
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
}

void clearNativeServiceWorkers()
  .catch(() => undefined)
  .finally(() => {
    platformBrowserDynamic()
      .bootstrapModule(AppModule)
      .catch((err) => console.log(err));
  });
