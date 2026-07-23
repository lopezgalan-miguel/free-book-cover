/**
 * CONTRATO · useMediaQuery
 * ------------------------
 * Hook que devuelve si una media query CSS se cumple, reactivo a sus cambios
 * (redimensionar, rotar el dispositivo…). La Home lo usa para montar UNA sola
 * variante del layout (móvil o escritorio) en lugar de ocultar con CSS, así
 * los paneles del editor nunca se montan duplicados en el DOM.
 *
 * Cómo lo hace: se suscribe a `matchMedia` con `useSyncExternalStore`, sin
 * estado propio ni dependencias externas. En SSR devuelve `false`.
 */

import { useSyncExternalStore } from 'react';

export const useMediaQuery = (query: string): boolean => {
  const subscribe = (onStoreChange: () => void) => {
    const mediaQueryList = window.matchMedia(query);
    mediaQueryList.addEventListener('change', onStoreChange);
    return () => mediaQueryList.removeEventListener('change', onStoreChange);
  };
  const getSnapshot = () => window.matchMedia(query).matches;
  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};
