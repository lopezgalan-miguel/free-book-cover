import { useSyncExternalStore } from "react";

export type LayoutKind = "mobile" | "desktop";

// Hasta este ancho (px CSS, inclusive) se usa el contenedor móvil; por encima, el de escritorio.
export const MOBILE_MAX_WIDTH = 767;
export const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;

export function layoutForWidth(widthPx: number): LayoutKind {
  return widthPx <= MOBILE_MAX_WIDTH ? "mobile" : "desktop";
}

// Sin matchMedia (p. ej. jsdom) se asume escritorio.
function query(): MediaQueryList | null {
  return typeof globalThis.matchMedia === "function" ? globalThis.matchMedia(MOBILE_QUERY) : null;
}

function subscribe(cb: () => void): () => void {
  const mq = query();
  mq?.addEventListener("change", cb);
  return () => mq?.removeEventListener("change", cb);
}

const snapshot = (): LayoutKind => (query()?.matches ? "mobile" : "desktop");

// Solo cambia el contenedor: los paneles son los mismos en ambos diseños.
export function useLayout(): LayoutKind {
  return useSyncExternalStore(subscribe, snapshot, () => "desktop");
}
