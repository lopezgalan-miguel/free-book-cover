import type { CapacitorConfig } from '@capacitor/cli';

// Configuración de Capacitor para empaquetar la PWA como app nativa.
// `webDir` apunta al build de Vite. Se sincroniza con `npm run cap:sync`
// tras cada `npm run build`. Android primero; iOS cuando el flujo esté validado.
const config: CapacitorConfig = {
  appId: 'com.freebookcover.app',
  appName: 'Editor de portadas',
  webDir: 'dist',
};

export default config;
