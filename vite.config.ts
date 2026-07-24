import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// Configuración de Vite: React + Tailwind v4 + PWA.
// El alias "@" apunta a /src para imports absolutos y legibles.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // La app es instalable en Android/iOS como PWA y, más adelante,
      // empaquetable como app nativa con Capacitor (ver /platform).
      includeAssets: ['favicon.svg'],
      workbox: {
        // Precaché también de las fuentes autoalojadas: la tipografía de la
        // interfaz (woff2) debe funcionar offline, sin depender de ningún CDN.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      manifest: {
        name: 'Editor de portadas',
        short_name: 'Portadas',
        description: 'Añade texto de alta calidad a tus imágenes y expórtalas sin perder calidad.',
        theme_color: '#26231d',
        background_color: '#efece5',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
