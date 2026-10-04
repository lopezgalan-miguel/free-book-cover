import { isResolvedTarget, variantDocument, type Project, type ResolvedTarget } from "@free-book-cover/core";
import type { EditorState } from "./editorStore";
import type { StateCell } from "./state";

export type StageTone = "charcoal" | "stone" | "linen";
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;

// Estado de vista: fuera del documento y del historial.
export function createViewActions(cell: StateCell<EditorState>) {
  const doc = (): Project => cell.get().history.present;
  let displayCache: { base: Project; target: ResolvedTarget; doc: Project } | null = null;
  const activeTarget = (): ResolvedTarget | null => {
    const t = doc().digitalTargets?.find((x) => x.id === cell.get().activeVariantId);
    return t && isResolvedTarget(t) ? t : null;
  };
  return {
    activeTarget,
    resetDisplayCache() {
      displayCache = null;
    },
    // Documento que se muestra: el base o la variante derivada (memoizado por base y destino).
    displayDoc(): Project {
      const target = activeTarget();
      const base = doc();
      if (!target) return base;
      if (displayCache && displayCache.base === base && displayCache.target === target) return displayCache.doc;
      displayCache = { base, target, doc: variantDocument(base, target) };
      return displayCache.doc;
    },
    setActiveVariant(id: string | null) {
      if (cell.get().activeVariantId === id) return;
      if (id !== null && !doc().digitalTargets?.some((t) => t.id === id)) return;
      cell.set({ activeVariantId: id });
    },
    select(id: string | null) {
      if (cell.get().selectedId !== id) cell.set({ selectedId: id });
    },
    setZoom(zoom: number) {
      const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
      if (Number.isFinite(z) && z !== cell.get().zoom) cell.set({ zoom: z });
    },
    setGuidesVisible(guidesVisible: boolean) {
      if (cell.get().guidesVisible !== guidesVisible) cell.set({ guidesVisible });
    },
    setStageTone(stageTone: StageTone) {
      cell.set({ stageTone });
    },
  };
}
