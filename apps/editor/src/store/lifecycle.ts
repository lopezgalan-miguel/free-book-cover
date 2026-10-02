import type { EditorStore } from "./editorStore";

export const AUTOSAVE_DELAY_MS = 2500;

interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
}
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) };

// Autoguardado con debounce (SDD R-06): se guarda cuando hay una pausa en las ediciones. Cada cambio
// reinicia la espera; un guardado fallido (cuota, error) no se reintenta solo hasta el siguiente cambio,
// para no repetir el aviso en bucle. Devuelve la función que lo detiene.
export function attachAutosave(store: EditorStore, opts: { delayMs?: number; timers?: Timers } = {}): () => void {
  const delay = opts.delayMs ?? AUTOSAVE_DELAY_MS;
  const timers = opts.timers ?? realTimers;
  let timer: unknown = null;
  let lastTried = -1;
  const cancel = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };
  const off = store.subscribe(() => {
    const s = store.getState();
    const rev = s.history.present.revision;
    if (!s.ready || !store.hasUnsavedChanges() || s.status === "saving" || rev === lastTried) return;
    cancel();
    timer = timers.set(() => {
      timer = null;
      if (!store.hasUnsavedChanges()) return;
      lastTried = store.getState().history.present.revision;
      void store.save();
    }, delay);
  });
  return () => {
    off();
    cancel();
  };
}

// Avisa al cerrar o recargar con cambios sin guardar y, al ocultarse la pestaña, intenta guardarlos.
export function attachUnloadGuard(store: EditorStore, win: EventTarget = window, doc: EventTarget & { visibilityState?: string } = document): () => void {
  const onBeforeUnload = (e: Event) => {
    if (!store.hasUnsavedChanges()) return;
    e.preventDefault();
    (e as unknown as { returnValue: string }).returnValue = "";
  };
  const onVisibility = () => {
    if (doc.visibilityState === "hidden" && store.hasUnsavedChanges() && store.getState().status !== "saving") void store.save();
  };
  win.addEventListener("beforeunload", onBeforeUnload);
  doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    win.removeEventListener("beforeunload", onBeforeUnload);
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
