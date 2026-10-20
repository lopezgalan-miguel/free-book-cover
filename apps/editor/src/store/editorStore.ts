import {
  amendPresent, canRedo, endMerge, canUndo, createHistory, createProject, execute, redo as redoHistory, undo as undoHistory,
  type Command, type LimitError, type CommandError, type ElementOverride, type History, type Project,
} from "@free-book-cover/core";
import type { ProjectStorage, StoredAsset } from "../storage/projectStorage";
import type { BackupPart } from "../storage/backup";
import { createStateCell } from "./state";
import { createViewActions, type StageTone } from "./view";
import { createAssetActions } from "./assets";
import { createClipboardActions } from "./clipboard";
import { createProjectSession } from "./session";

export type EditorError =
  | { kind: "quota" }
  | { kind: "save" }
  | { kind: "unsupported_version" }
  | { kind: "load" }
  | { kind: "storage_unavailable" }
  | { kind: "unsupported_image" }
  | { kind: "unsupported_font" }
  | { kind: "font_load_failed"; family: string }
  | { kind: "restore" }
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
  // Hay una capa copiada (el contenido vive en el cierre del almacén; esto solo avisa a la interfaz).
  hasClipboard: boolean;
}

// Propiedades geométricas que se editan en el base o, con una variante activa, solo en ella.
export type GeometryEdit = Pick<ElementOverride, "x" | "y" | "width" | "height" | "rotation" | "opacity" | "crop" | "fit">;

export { ZOOM_MIN, ZOOM_MAX, type StageTone } from "./view";

export interface EditorDeps {
  storage: ProjectStorage;
  // false si IndexedDB no se pudo abrir (modo memoria con aviso).
  storageAvailable?: boolean;
  newId: () => string;
  downloadParts: (parts: BackupPart[]) => void;
  maxBackupPartBytes?: number;
  // Reloj inyectable (fusión de gestos en el historial).
  now?: () => number;
}

export interface FreeResult {
  removed: number;
  bytes: number;
}

export function createEditorStore(deps: EditorDeps) {
  const fresh = () => createHistory(createProject({ id: deps.newId() }));
  const cell = createStateCell<EditorState>(
    {
      ready: false, history: fresh(), assets: [], savedRevision: null, status: "idle", error: null, backupParts: null, nearLimit: false,
      selectedId: null, zoom: 1, stageTone: "charcoal", activeVariantId: null, guidesVisible: true, hasClipboard: false,
    },
    // Una variante que ya no existe (borrada, deshacer, otro proyecto) deja de estar activa.
    (s) => (s.activeVariantId && !s.history.present.digitalTargets?.some((t) => t.id === s.activeVariantId) ? { ...s, activeVariantId: null } : s),
  );
  const set = cell.set;
  const doc = (): Project => cell.get().history.present;
  const now = deps.now ?? Date.now;
  // activeTarget y resetDisplayCache son internos: la fachada no los expone.
  const { activeTarget, resetDisplayCache, ...viewApi } = createViewActions(cell);

  // Única entrada de mutación de la UI: siempre pasa por los comandos de core.
  // mergeKey: los cambios consecutivos con la misma clave (teclas, selector de color) forman un solo paso.
  function dispatch(cmd: Command, opts: { mergeKey?: string } = {}): boolean {
    const r = execute(cell.get().history, cmd, doc().revision, opts.mergeKey ? { key: opts.mergeKey, at: now() } : undefined);
    if (!r.ok) {
      set({ error: { kind: "command", error: r.error } });
      return false;
    }
    set({ history: r.history, error: cell.get().error?.kind === "command" ? null : cell.get().error, status: "idle" });
    return true;
  }
  // Cierra el gesto en curso (soltar, perder el foco): el siguiente cambio abre un paso nuevo.
  function endGesture() {
    if (cell.get().history.merge) set({ history: endMerge(cell.get().history) });
  }
  // Mutación pedida desde fuera (MCP): misma vía de comandos, pero con la revisión que el cliente leyó
  // y sin tocar el aviso de error de la interfaz. Un conflicto o un fallo no cambia nada.
  function applyRemote(cmd: Command, expectedRevision: number): { ok: true; revision: number } | { ok: false; error: CommandError } {
    const r = execute(cell.get().history, cmd, expectedRevision);
    if (!r.ok) return r;
    set({ history: r.history, status: "idle" });
    return { ok: true, revision: r.history.present.revision };
  }
  // Ajuste automático (caja de texto): aplica los comandos al presente sin abrir un paso de deshacer.
  function amend(cmds: Command[]): boolean {
    const r = amendPresent(cell.get().history, cmds);
    if (!r.ok) return false;
    set({ history: r.history, status: "idle" });
    return true;
  }
  function undo() {
    const r = undoHistory(cell.get().history, doc().revision);
    if (r.ok) set({ history: r.history, status: "idle" });
  }
  function redo() {
    const r = redoHistory(cell.get().history, doc().revision);
    if (r.ok) set({ history: r.history, status: "idle" });
  }

  // Geometría: con una variante activa solo cambia esa variante; si no, el elemento del base.
  function editGeometry(id: string, props: GeometryEdit): boolean {
    const target = activeTarget();
    // En una variante, 100 % es un valor propio (quitarlo heredaría la opacidad del base).
    if (target) return dispatch({ type: "setVariantElement", targetId: target.id, elementId: id, props: "opacity" in props && props.opacity === undefined ? { ...props, opacity: 1 } : props });
    return dispatch({ type: "updateElement", id, props: props as never });
  }
  function editBackgroundLayout(props: { fit?: "cover" | "contain" | "fill"; pos?: { x: number; y: number } }): boolean {
    const target = activeTarget();
    if (target) return dispatch({ type: "setVariantBackground", targetId: target.id, props });
    return dispatch({ type: "setBackgroundLayout", ...props });
  }
  function setName(name: string): boolean {
    return name.trim() === doc().name ? true : dispatch({ type: "setName", name });
  }
  function reportError(error: EditorError) {
    set({ error });
  }
  function dismissError() {
    set({ error: null });
  }

  const history = { dispatch, endGesture, applyRemote, undo, redo };
  const assets = createAssetActions(cell, deps, history);
  const clipboard = createClipboardActions(cell, deps, history, assets);
  const session = createProjectSession(cell, deps, {
    purgeOrphans: assets.purgeOrphans, projectBytes: assets.projectBytes, setName, resetView: resetDisplayCache,
  });
  return {
    getState: cell.get, subscribe: cell.subscribe, newId: deps.newId,
    canUndo: () => canUndo(cell.get().history), canRedo: () => canRedo(cell.get().history),
    ...viewApi, ...history, ...assets, ...clipboard, ...session,
    amend, editGeometry, editBackgroundLayout, setName, reportError, dismissError,
  };
}

export type EditorStore = ReturnType<typeof createEditorStore>;
