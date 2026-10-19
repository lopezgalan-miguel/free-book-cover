// Contexto 2D falso: registra métodos llamados y propiedades asignadas, en orden.
// Vitest corre en "node" (sin canvas), así que el pintor se prueba por sus llamadas.
export function recordingContext(): { ctx: CanvasRenderingContext2D; calls: Array<[string, ...unknown[]]> } {
  const calls: Array<[string, ...unknown[]]> = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy({} as Record<string, unknown>, {
    // Como un contexto moderno: cualquier propiedad existe (p. ej. letterSpacing).
    has: () => true,
    get: (_t, k: string) => (k in props ? props[k] : (...args: unknown[]) => void calls.push([k, ...args])),
    set: (_t, k: string, v: unknown) => {
      props[k] = v;
      calls.push([`set:${k}`, v]);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
