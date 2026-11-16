/**
 * URLs públicas de las páginas legales (servidas por la PWA en hidrix.com.co).
 * Son las mismas que se registran en App Store Connect y Google Play.
 */
export const LEGAL_URLS = {
  privacy: 'https://hidrix.com.co/privacidad',
  support: 'https://hidrix.com.co/soporte',
} as const;

/** Abre una URL externa (en móvil, Capacitor la abre en el navegador del sistema). */
export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener');
}
