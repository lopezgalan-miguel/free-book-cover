import {
  checkAssetLimits, canRedo, canUndo, createHistory, createProject, execute, redo as redoHistory, undo as undoHistory,
  type Asset, type AssetCandidate, type Command, type LimitError, type CommandError, type History, type Project,
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
}

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
    selectedId: null, zoom: 1, stageTone: "charcoal",
  };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<EditorState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const doc = (): Project => state.history.present;
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
    undo() {
      const r = undoHistory(state.history, doc().revision);
      if (r.ok) set({ history: r.history, status: "idle" });
    },
    redo() {
      const r = redoHistory(state.history, doc().revision);
      if (r.ok) set({ history: r.history, status: "idle" });
    },

    // meta: dimensiones decodificadas de la imagen, si se conocen, para el límite de megapíxeles.
    async addAsset(asset: Asset, blob: Blob, meta: { widthPx?: number; heightPx?: number } = {}): Promise<boolean> {
      const candidate: AssetCandidate = { kind: asset.kind, sizeBytes: blob.size, ...meta };
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
      if (this.dispatch({ type: "addAsset", asset })) return true;
      // El comando falló: no se deja un blob huérfano ni en memoria ni en disco.
      set({ assets: previous, nearLimit: false });
      await deps.storage.deleteAsset(doc().id, asset.id).catch(() => undefined);
      return false;
    },

    // Derivado (p. ej. miniatura): se guarda como blob aparte y nunca sustituye al original.
    async addDerivedBlob(id: string, blob: Blob): Promise<boolean> {
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
