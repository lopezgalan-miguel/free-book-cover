import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { EditorState, EditorStore } from "./editorStore";

const Ctx = createContext<EditorStore | null>(null);

export function StoreProvider({ store, children }: { store: EditorStore; children: ReactNode }) {
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): EditorStore {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore fuera de StoreProvider");
  return s;
}

export function useEditorState(): EditorState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}
