import {
  LIMITS, checkAssetLimits, canRedo, endMerge, referencedAssetIds, unusedAssetIds, canUndo, createHistory, createProject, execute, redo as redoHistory, undo as undoHistory,
  isResolvedTarget, variantDocument,
  type Asset, type AssetCandidate, type Command, type LimitError, type CommandError, type ElementOverride, type History, type Project,
  type ResolvedTarget,
} from "@free-book-cover/core";
import type { ProjectStorage, StoredAsset } from "../storage/projectStorage";
import { createBackupParts, restoreBackup, type BackupPart } from "../storage/backup";
import { baseAssetId } from "../images/importImage";

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
  // Reloj inyectable (fusión de gestos en el historial).
  now?: () => number;
}

export interface FreeResult {
  removed: number;
  bytes: number;
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
  const now = deps.now ?? Date.now;
  // Blobs que se están guardando y aún no figuran en el documento: la limpieza no los toca.
  const pending = new Set<string>();
  const projectBytes = () =>
    state.assets.reduce((n, a) => n + a.blob.size, 0) + JSON.stringify(doc()).length;

  return {
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    isDirty: () => state.savedRevision !== doc().revision,
    // Cambios reales sin guardar: un proyecto recién abierto sin tocar no cuenta.
    hasUnsavedChanges: () => state.savedRevision !== doc().revision && !(state.savedRevision === null && doc().revision === 0),
    projectBytes,
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
          // Blobs de importaciones deshechas o sin guardar en una sesión anterior.
          await this.purgeOrphans();
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
    // mergeKey: los cambios consecutivos con la misma clave (teclas, selector de color) forman un solo paso.
    dispatch(cmd: Command, opts: { mergeKey?: string } = {}): boolean {
      const r = execute(state.history, cmd, doc().revision, opts.mergeKey ? { key: opts.mergeKey, at: now() } : undefined);
      if (!r.ok) {
        set({ error: { kind: "command", error: r.error } });
        return false;
      }
      set({ history: r.history, error: state.error?.kind === "command" ? null : state.error, status: "idle" });
      return true;
    },
    // Cierra el gesto en curso (soltar, perder el foco): el siguiente cambio abre un paso nuevo.
    endGesture() {
      if (state.history.merge) set({ history: endMerge(state.history) });
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
      let limit = checkAssetLimits(candidate, projectBytes());
      // Antes de rechazar por tamaño se libera lo que ningún paso del historial referencia.
      if (!limit.ok && limit.error.kind === "project_too_large" && (await this.purgeOrphans()).removed > 0) {
        limit = checkAssetLimits(candidate, projectBytes());
      }
      if (!limit.ok) {
        set({ error: { kind: "limit", error: limit.error } });
        return false;
      }
      pending.add(asset.id);
      try {
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
        set({ assets: previous, nearLimit: previous.length > 0 && projectBytes() >= LIMITS.projectWarnBytes });
        await deps.storage.deleteAsset(doc().id, asset.id).catch(() => undefined);
        return false;
      } finally {
        pending.delete(asset.id);
      }
    },

    // Derivado (p. ej. miniatura): se guarda como blob aparte y nunca sustituye al original.
    async addDerivedBlob(id: string, blob: Blob): Promise<boolean> {
      // También los derivados cuentan para el máximo del proyecto (SDD §6).
      const replaced = state.assets.find((a) => a.id === id)?.blob.size ?? 0;
      const limit = checkAssetLimits({ kind: "font", sizeBytes: blob.size }, projectBytes() - replaced);
      if (!limit.ok && limit.error.kind === "project_too_large") return false;
      pending.add(id);
      try {
        const put = await deps.storage.putAsset(doc().id, id, blob);
        if (!put.ok) return false;
        set({ assets: [...state.assets.filter((a) => a.id !== id), { id, blob }] });
        return true;
      } finally {
        pending.delete(id);
      }
    },

    // Borra los blobs que ningún documento del historial (pasado, presente o rehacer) referencia: no rompe
    // deshacer ni rehacer. Las miniaturas siguen a su recurso. El contador de tamaño se recalcula.
    async purgeOrphans(): Promise<FreeResult> {
      const h = state.history;
      const refs = referencedAssetIds([...h.past, h.present, ...h.future]);
      const orphan = state.assets.filter((a) => !refs.has(baseAssetId(a.id)) && !pending.has(a.id) && !pending.has(baseAssetId(a.id)));
      if (orphan.length === 0) return { removed: 0, bytes: 0 };
      const gone = new Set(orphan.map((a) => a.id));
      const assets = state.assets.filter((a) => !gone.has(a.id));
      set({ assets });
      set({ nearLimit: projectBytes() >= LIMITS.projectWarnBytes });
      await Promise.all(orphan.map((a) => deps.storage.deleteAsset(doc().id, a.id).catch(() => undefined)));
      return { removed: orphan.length, bytes: orphan.reduce((n, a) => n + a.blob.size, 0) };
    },
    // Recursos del documento que nada usa y espacio que ocupan (con sus miniaturas).
    unusedAssets(): { ids: string[]; bytes: number } {
      const ids = unusedAssetIds(doc());
      const set_ = new Set(ids);
      const bytes = state.assets.filter((a) => set_.has(baseAssetId(a.id))).reduce((n, a) => n + a.blob.size, 0);
      return { ids, bytes };
    },
    // Acción del usuario «liberar espacio»: quita del documento los recursos sin uso y borra sus blobs.
    // Como esos recursos aparecen en pasos anteriores, el historial de deshacer se descarta.
    async freeUnused(): Promise<FreeResult> {
      const before = projectBytes();
      const { ids } = this.unusedAssets();
      if (ids.length > 0) {
        let h = state.history;
        for (const id of ids) {
          const r = execute(h, { type: "removeAsset", id }, h.present.revision);
          if (!r.ok) {
            set({ error: { kind: "command", error: r.error } });
            return { removed: 0, bytes: 0 };
          }
          h = r.history;
        }
        set({ history: createHistory(h.present, h.limit), status: "idle" });
      }
      const purged = await this.purgeOrphans();
      return { removed: ids.length + (ids.length ? 0 : purged.removed), bytes: Math.max(0, before - projectBytes()) };
    },

    async save(): Promise<boolean> {
      await this.purgeOrphans();
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

    setName(name: string): boolean {
      return name.trim() === doc().name ? true : this.dispatch({ type: "setName", name });
    },
    async listProjects() {
      return (await deps.storage.listProjects()).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    // Guarda lo pendiente antes de cambiar de proyecto; si no se puede guardar, no se cambia (no se pierde nada).
    async flushBeforeSwitch(): Promise<boolean> {
      return !this.hasUnsavedChanges() || (await this.save());
    },
    async newProject(name?: string): Promise<boolean> {
      if (!(await this.flushBeforeSwitch())) return false;
      this.openLoaded(createProject({ id: deps.newId() }), [], null);
      return name?.trim() ? this.setName(name) : true;
    },
    async openProject(id: string): Promise<boolean> {
      if (id === doc().id) return true;
      if (!(await this.flushBeforeSwitch())) return false;
      const r = await deps.storage.loadProject(id).catch(() => null);
      if (!r || !r.ok) {
        set({ error: { kind: r && !r.ok && r.error.kind === "unsupported_version" ? "unsupported_version" : "load" } });
        return false;
      }
      this.openLoaded(r.project, r.assets, r.project.revision);
      await this.purgeOrphans();
      // Pasa a ser el último proyecto abierto.
      return this.save();
    },
    async deleteProject(id: string): Promise<boolean> {
      if (id === doc().id) return false;
      try {
        await deps.storage.deleteProject(id);
        return true;
      } catch {
        set({ error: { kind: "save" } });
        return false;
      }
    },
    // Cambia el documento abierto; el estado de vista (selección, variante) no se arrastra.
    openLoaded(project: Project, assets: StoredAsset[], savedRevision: number | null) {
      displayCache = null;
      set({
        history: createHistory(project), assets, savedRevision, status: "idle", error: null, backupParts: null,
        selectedId: null, activeVariantId: null, ready: true,
      });
      set({ nearLimit: projectBytes() >= LIMITS.projectWarnBytes });
    },
    // Restaura una copia de seguridad (todas sus partes): valida, guarda y abre el proyecto.
    async importBackup(blobs: Blob[]): Promise<boolean> {
      const r = await restoreBackup(blobs);
      if (!r.ok) {
        const e = r.error;
        set({ error: e.kind === "limit" ? { kind: "limit", error: e.error } : e.kind === "unsupported_version" ? { kind: "unsupported_version" } : { kind: "restore" } });
        return false;
      }
      if (!(await this.flushBeforeSwitch())) return false;
      const { project, assets } = r;
      const before = new Set(await deps.storage.listAssetIds(project.id).catch(() => [] as string[]));
      const written: string[] = [];
      const rollback = async () => {
        await Promise.all(written.filter((id) => !before.has(id)).map((id) => deps.storage.deleteAsset(project.id, id).catch(() => undefined)));
      };
      for (const a of assets) {
        const put = await deps.storage.putAsset(project.id, a.id, a.blob);
        if (!put.ok) {
          await rollback();
          set({ error: { kind: put.kind === "quota" ? "quota" : "save" } });
          return false;
        }
        written.push(a.id);
      }
      const saved = await deps.storage.saveProject(project);
      if (!saved.ok) {
        await rollback();
        set({ error: { kind: saved.kind === "quota" ? "quota" : "save" } });
        return false;
      }
      // Blobs de una versión anterior del mismo proyecto que la copia ya no referencia.
      const keep = new Set(assets.map((a) => a.id));
      await Promise.all([...before].filter((id) => !keep.has(id)).map((id) => deps.storage.deleteAsset(project.id, id).catch(() => undefined)));
      this.openLoaded(project, assets, project.revision);
      set({ status: "saved" });
      return true;
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
