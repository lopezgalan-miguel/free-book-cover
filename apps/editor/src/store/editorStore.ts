import {
  checkAssetLimits, canRedo, canUndo, createHistory, createProject, execute, redo as redoHistory, undo as undoHistory,
  isResolvedTarget, variantDocument,
  type Asset, type AssetCandidate, type Command, type LimitError, type CommandError, type ElementOverride, type History, type Project,
  type ResolvedTarget,
} from "@free-book-cover/core";
import type { ProjectStorage, StoredAsset } from "../storage/projectStorage";
import { createBackupParts, type BackupPart } from "../storage/backup";

export type EditorError =
  | { kind: "quota" }
  | { kind: "save" }
  | { kind: "unsupported_version" }
  | { kind: "load" }
  | { kind: "storage_unavailable" }
  | { kind: "unsupported_image" }
  | { kind: "unsupported_font" }
  | { kind: "font_load_failed"; family: string }
  | { kind: "limit"; error: LimitError }
  | { kind: "command"; error: CommandError };

export interface EditorState {
  ready: boolean;
  history: History;
  assets: StoredAsset[];
  savedRevision: number | null;
  status: "idle" | "saving" | "saved";
  error: EditorError | null;
  backupParts: number | null;
  // Aviso no bloqueante: el proyecto se acerca al límite de tamaño.
  nearLimit: boolean;
  // Estado de vista, fuera del documento y del historial.
  selectedId: string | null;
  zoom: number;
  stageTone: StageTone;
  // Variante digital que se está viendo/editando (vista, no documento); null = diseño base.
  activeVariantId: string | null;
  // Guías de la cubierta KDP (vista; nunca se exportan).
  guidesVisible: boolean;
}

// Propiedades geométricas que se editan en el base o, con una variante activa, solo en ella.
export type GeometryEdit = Pick<ElementOverride, "x" | "y" | "width" | "height" | "rotation" | "crop" | "fit">;

export type StageTone = "charcoal" | "stone" | "linen";
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;

export interface EditorDeps {
  storage: ProjectStorage;
  // false si IndexedDB no se pudo abrir (modo memoria con aviso).
  storageAvailable?: boolean;
  newId: () => string;
  downloadParts: (parts: BackupPart[]) => void;
  maxBackupPartBytes?: number;
}

export function createEditorStore(deps: EditorDeps) {
  const fresh = () => createHistory(createProject({ id: deps.newId() }));
  let state: EditorState = {
    ready: false, history: fresh(), assets: [], savedRevision: null, status: "idle", error: null, backupParts: null, nearLimit: false,
    selectedId: null, zoom: 1, stageTone: "charcoal", activeVariantId: null, guidesVisible: true,
  };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<EditorState>) => {
    state = { ...state, ...patch };
    // Una variante que ya no existe (borrada, deshacer, otro proyecto) deja de estar activa.
    if (state.activeVariantId && !state.history.present.digitalTargets?.some((t) => t.id === state.activeVariantId)) {
      state = { ...state, activeVariantId: null };
    }
    listeners.forEach((l) => l());
  };
  const doc = (): Project => state.history.present;
  const activeTarget = (): ResolvedTarget | null => {
    const t = state.history.present.digitalTargets?.find((x) => x.id === state.activeVariantId);
    return t && isResolvedTarget(t) ? t : null;
  };
  let displayCache: { base: Project; target: ResolvedTarget; doc: Project } | null = null;
  let initPromise: Promise<void> | null = null;
  const projectBytes = () =>
    state.assets.reduce((n, a) => n + a.blob.size, 0) + JSON.stringify(doc()).length;

  return {
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    isDirty: () => state.savedRevision !== doc().revision,
    canUndo: () => canUndo(state.history),
    canRedo: () => canRedo(state.history),
    newId: deps.newId,

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
      if (state.activeVariantId === id) return;
      if (id !== null && !doc().digitalTargets?.some((t) => t.id === id)) return;
      set({ activeVariantId: id });
    },
    // Geometría: con una variante activa solo cambia esa variante; si no, el elemento del base.
    editGeometry(id: string, props: GeometryEdit): boolean {
      const target = activeTarget();
      if (target) return this.dispatch({ type: "setVariantElement", targetId: target.id, elementId: id, props });
      return this.dispatch({ type: "updateElement", id, props: props as never });
    },
    editBackgroundLayout(props: { fit?: "cover" | "contain" | "fill"; pos?: { x: number; y: number } }): boolean {
      const target = activeTarget();
      if (target) return this.dispatch({ type: "setVariantBackground", targetId: target.id, props });
      return this.dispatch({ type: "setBackgroundLayout", ...props });
    },

    // Recupera el último proyecto; si no es legible se abre uno nuevo sin tocar el guardado.
    // Idempotente: StrictMode u otras llamadas repetidas no pisan ediciones.
    init(): Promise<void> {
      initPromise ??= this.runInit();
      return initPromise;
    },
    async runInit() {
      if (deps.storageAvailable === false) {
        set({ ready: true, error: { kind: "storage_unavailable" } });
        return;
      }
      try {
        const r = await deps.storage.loadLastProject();
        if (r.ok) {
          set({ ready: true, history: createHistory(r.project), assets: r.assets, savedRevision: r.project.revision });
        } else if (r.error.kind === "unsupported_version") {
          set({ ready: true, error: { kind: "unsupported_version" } });
        } else if (r.error.kind === "not_found") {
          set({ ready: true });
        } else {
          set({ ready: true, error: { kind: "load" } });
        }
      } catch {
        set({ ready: true, error: { kind: "load" } });
      }
    },

    select(id: string | null) {
      if (state.selectedId !== id) set({ selectedId: id });
    },
    setZoom(zoom: number) {
      const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
      if (Number.isFinite(z) && z !== state.zoom) set({ zoom: z });
    },
    setGuidesVisible(guidesVisible: boolean) {
      if (state.guidesVisible !== guidesVisible) set({ guidesVisible });
    },
    setStageTone(stageTone: StageTone) {
      set({ stageTone });
    },
    reportError(error: EditorError) {
      set({ error });
    },

    // Única entrada de mutación de la UI: siempre pasa por los comandos de core.
    dispatch(cmd: Command): boolean {
      const r = execute(state.history, cmd, doc().revision);
      if (!r.ok) {
        set({ error: { kind: "command", error: r.error } });
        return false;
      }
      set({ history: r.history, error: state.error?.kind === "command" ? null : state.error, status: "idle" });
      return true;
    },
    // Mutación pedida desde fuera (MCP): misma vía de comandos, pero con la revisión que el cliente leyó
    // y sin tocar el aviso de error de la interfaz. Un conflicto o un fallo no cambia nada.
    applyRemote(cmd: Command, expectedRevision: number): { ok: true; revision: number } | { ok: false; error: CommandError } {
      const r = execute(state.history, cmd, expectedRevision);
      if (!r.ok) return r;
      set({ history: r.history, status: "idle" });
      return { ok: true, revision: r.history.present.revision };
    },
    undo() {
      const r = undoHistory(state.history, doc().revision);
      if (r.ok) set({ history: r.history, status: "idle" });
    },
    redo() {
      const r = redoHistory(state.history, doc().revision);
      if (r.ok) set({ history: r.history, status: "idle" });
    },

    // meta: dimensiones decodificadas de la imagen, si se conocen, para el límite de megapíxeles.
    async addAsset(asset: Asset, blob: Blob, meta: { widthPx?: number; heightPx?: number; expectedRevision?: number } = {}): Promise<boolean> {
      const { expectedRevision, ...dims } = meta;
      const candidate: AssetCandidate = { kind: asset.kind, sizeBytes: blob.size, ...dims };
      const limit = checkAssetLimits(candidate, projectBytes());
      if (!limit.ok) {
        set({ error: { kind: "limit", error: limit.error } });
        return false;
      }
      const put = await deps.storage.putAsset(doc().id, asset.id, blob);
      if (!put.ok) {
        set({ error: { kind: put.kind === "quota" ? "quota" : "save" } });
        return false;
      }
      const previous = state.assets;
      set({ assets: [...previous.filter((a) => a.id !== asset.id), { id: asset.id, blob }], nearLimit: limit.warning === "project_near_limit" });
      // Con revisión esperada (MCP) el comando falla si el documento cambió durante la importación.
      if (expectedRevision !== undefined ? this.applyRemote({ type: "addAsset", asset }, expectedRevision).ok : this.dispatch({ type: "addAsset", asset })) return true;
      // El comando falló: no se deja un blob huérfano ni en memoria ni en disco.
      set({ assets: previous, nearLimit: false });
      await deps.storage.deleteAsset(doc().id, asset.id).catch(() => undefined);
      return false;
    },

    // Derivado (p. ej. miniatura): se guarda como blob aparte y nunca sustituye al original.
    async addDerivedBlob(id: string, blob: Blob): Promise<boolean> {
      // También los derivados cuentan para el máximo del proyecto (SDD §6).
      const replaced = state.assets.find((a) => a.id === id)?.blob.size ?? 0;
      const limit = checkAssetLimits({ kind: "font", sizeBytes: blob.size }, projectBytes() - replaced);
      if (!limit.ok && limit.error.kind === "project_too_large") return false;
      const put = await deps.storage.putAsset(doc().id, id, blob);
      if (!put.ok) return false;
      set({ assets: [...state.assets.filter((a) => a.id !== id), { id, blob }] });
      return true;
    },

    async save(): Promise<boolean> {
      const snapshot = doc();
      set({ status: "saving" });
      let r;
      try {
        r = await deps.storage.saveProject(snapshot);
      } catch {
        r = { ok: false as const, kind: "error" as const, message: "" };
      }
      if (r.ok) {
        set({ status: "saved", savedRevision: snapshot.revision, error: null, backupParts: null });
        return true;
      }
      // El estado en memoria no se toca; se ofrece copia de seguridad.
      set({ status: "idle", error: { kind: r.kind === "quota" ? "quota" : "save" } });
      return false;
    },

    async downloadBackup(): Promise<number> {
      const parts = await createBackupParts(doc(), state.assets, deps.maxBackupPartBytes);
      deps.downloadParts(parts);
      set({ backupParts: parts.length });
      return parts.length;
    },
    dismissError() {
      set({ error: null });
    },
  };
}

export type EditorStore = ReturnType<typeof createEditorStore>;
