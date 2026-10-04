// Estado observable mínimo: un valor inmutable, parches y oyentes. normalize corrige invariantes tras cada parche.
export interface StateCell<S> {
  get(): S;
  set(patch: Partial<S>): void;
  subscribe(l: () => void): () => void;
}

export function createStateCell<S>(initial: S, normalize: (s: S) => S = (s) => s): StateCell<S> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      state = normalize({ ...state, ...patch });
      listeners.forEach((l) => l());
    },
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}
