import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { type FontProblem } from "@free-book-cover/core";
import { useEditorState } from "../store/react";
import { getFontRegistry, type FontRegistry } from "./fontRegistry";

const Ctx = createContext<FontRegistry | null>(null);

export function FontsProvider({ registry, children }: { registry?: FontRegistry; children: ReactNode }) {
  return <Ctx.Provider value={registry ?? getFontRegistry()}>{children}</Ctx.Provider>;
}

export function useFonts(): FontRegistry {
  return useContext(Ctx) ?? getFontRegistry();
}

// Re-renderiza cuando cambia el estado de alguna fuente.
export function useFontVersion(): number {
  const r = useFonts();
  return useSyncExternalStore(r.subscribe, () => r.version);
}

// Mantiene el registro sincronizado con el documento: fuentes subidas y fuentes del catálogo usadas.
export function useFontSync(): void {
  const r = useFonts();
  const { ready, history, assets } = useEditorState();
  const doc = history.present;
  useEffect(() => {
    if (!ready) return;
    void r.syncAssets(doc.assets, assets);
  }, [r, ready, doc.assets, assets]);
  useEffect(() => {
    r.ensureDoc(doc);
  }, [r, doc]);
}

// Fuentes usadas por el diseño que no están disponibles (fallidas o desconocidas); las "en carga" no son un aviso.
export function useFontProblems(): FontProblem[] {
  const r = useFonts();
  useFontVersion();
  const { history } = useEditorState();
  const report = r.checkFontsReady(history.present);
  return report.ok ? [] : report.problems.filter((p) => p.reason === "failed" || p.reason === "missing" || p.reason === "face_missing");
}
