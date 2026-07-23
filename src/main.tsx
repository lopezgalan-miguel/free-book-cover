/**
 * CONTRATO · Punto de entrada de la aplicación
 * --------------------------------------------
 * Monta React sobre <div id="root">, carga los estilos globales y renderiza
 * <App />. No contiene lógica de negocio: solo arranque. El registro del
 * service worker de la PWA lo inyecta `vite-plugin-pwa` (registerType auto).
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No se encontró el elemento #root en index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
