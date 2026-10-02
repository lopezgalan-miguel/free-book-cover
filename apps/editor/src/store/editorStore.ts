import {
  canRedo, canUndo, createHistory, createProject, execute, redo as redoHistory, undo as undoHistory,
  type Asset, type Command, type CommandError, type History, type Project,
} from "@free-book-cover/core";
import type { ProjectStorage, StoredAsset } from "../storage/projectStorage";
import { createBackupParts, type BackupPart } from "../storage/backup";

export type EditorError =
  | { kind: "quota" }
  | { kind: "save" }
  | { kind: "unsupported_version" }
  | { kind: "load" }
  | { kind: "command"; error: CommandError };

export interface EditorState {
  ready: boolean;
  history: History;
  assets: StoredAsset[];
  savedRevision: number | null;
  status: "idle" | "saving" | "saved";
  error: EditorError | null;
  backupParts: number | null;
}

export interface EditorDeps {
  storage: ProjectStorage;
  newId: () => string;
  downloadParts: (parts: BackupPart[]) => void;
  maxBackupPartBytes?: number;
}

export function createEditorStore(deps: EditorDeps) {
  const fresh = () => createHistory(createProject({ id: deps.newId() }));
  let state: EditorState = {
    ready: false, history: fresh(), assets: [], savedRevision: null, status: "idle", error: null, backupParts: null,
  };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<EditorState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const doc = (): Project => state.history.present;

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
    async init() {
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

    async addAsset(asset: Asset, blob: Blob): Promise<boolean> {
      const put = await deps.storage.putAsset(doc().id, asset.id, blob);
      if (!put.ok) {
        set({ error: { kind: put.kind === "quota" ? "quota" : "save" } });
        return false;
      }
      set({ assets: [...state.assets.filter((a) => a.id !== asset.id), { id: asset.id, blob }] });
      return this.dispatch({ type: "addAsset", asset });
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
