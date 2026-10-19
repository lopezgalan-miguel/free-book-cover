import { LIMITS, createHistory, createProject, type Project } from "@free-book-cover/core";
import type { StoredAsset } from "../storage/projectStorage";
import { createBackupParts, restoreBackup } from "../storage/backup";
import type { EditorDeps, EditorState, FreeResult } from "./editorStore";
import type { StateCell } from "./state";

// Sesión de proyecto: carga inicial, guardado, cambio de proyecto y copias de seguridad.
export function createProjectSession(
  cell: StateCell<EditorState>,
  deps: EditorDeps,
  ctx: { purgeOrphans: () => Promise<FreeResult>; projectBytes: () => number; setName: (n: string) => boolean; resetView: () => void },
) {
  let initPromise: Promise<void> | null = null;

  const isDirty = () => cell.get().savedRevision !== cell.get().history.present.revision;
  // Cambios reales sin guardar: un proyecto recién abierto sin tocar no cuenta.
  const hasUnsavedChanges = () =>
    cell.get().savedRevision !== cell.get().history.present.revision && !(cell.get().savedRevision === null && cell.get().history.present.revision === 0);

  // Recupera el último proyecto; si no es legible se abre uno nuevo sin tocar el guardado.
  // Idempotente: StrictMode u otras llamadas repetidas no pisan ediciones.
  function init(): Promise<void> {
    initPromise ??= runInit();
    return initPromise;
  }
  async function runInit() {
    if (deps.storageAvailable === false) {
      cell.set({ ready: true, error: { kind: "storage_unavailable" } });
      return;
    }
    try {
      const r = await deps.storage.loadLastProject();
      if (r.ok) {
        cell.set({ ready: true, history: createHistory(r.project), assets: r.assets, savedRevision: r.project.revision });
        // Blobs de importaciones deshechas o sin guardar en una sesión anterior.
        await ctx.purgeOrphans();
      } else if (r.error.kind === "unsupported_version") {
        cell.set({ ready: true, error: { kind: "unsupported_version" } });
      } else if (r.error.kind === "not_found") {
        cell.set({ ready: true });
      } else {
        cell.set({ ready: true, error: { kind: "load" } });
      }
    } catch {
      cell.set({ ready: true, error: { kind: "load" } });
    }
  }

  async function save(): Promise<boolean> {
    await ctx.purgeOrphans();
    const snapshot = cell.get().history.present;
    cell.set({ status: "saving" });
    let r;
    try {
      r = await deps.storage.saveProject(snapshot);
    } catch {
      r = { ok: false as const, kind: "error" as const, message: "" };
    }
    if (r.ok) {
      cell.set({ status: "saved", savedRevision: snapshot.revision, error: null, backupParts: null });
      return true;
    }
    // El estado en memoria no se toca; se ofrece copia de seguridad.
    cell.set({ status: "idle", error: { kind: r.kind === "quota" ? "quota" : "save" } });
    return false;
  }

  async function listProjects() {
    return (await deps.storage.listProjects()).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  // Guarda lo pendiente antes de cambiar de proyecto; si no se puede guardar, no se cambia (no se pierde nada).
  async function flushBeforeSwitch(): Promise<boolean> {
    return !hasUnsavedChanges() || (await save());
  }
  async function newProject(name?: string): Promise<boolean> {
    if (!(await flushBeforeSwitch())) return false;
    openLoaded(createProject({ id: deps.newId() }), [], null);
    return name?.trim() ? ctx.setName(name) : true;
  }
  async function openProject(id: string): Promise<boolean> {
    if (id === cell.get().history.present.id) return true;
    if (!(await flushBeforeSwitch())) return false;
    const r = await deps.storage.loadProject(id).catch(() => null);
    if (!r || !r.ok) {
      cell.set({ error: { kind: r && !r.ok && r.error.kind === "unsupported_version" ? "unsupported_version" : "load" } });
      return false;
    }
    openLoaded(r.project, r.assets, r.project.revision);
    await ctx.purgeOrphans();
    // Pasa a ser el último proyecto abierto.
    return save();
  }
  // Copia el proyecto abierto (documento y blobs, también miniaturas) con otro id y abre la copia.
  // Si algo no se puede guardar, se retira lo escrito y el proyecto original sigue abierto.
  async function duplicateProject(name?: string): Promise<boolean> {
    // También un proyecto nuevo sin tocar se guarda: tras duplicar deben existir el original y la copia.
    if (!(await save())) return false;
    const src = cell.get().history.present;
    const assets = cell.get().assets;
    const copy: Project = { ...src, id: deps.newId(), name: name ?? (src.name ? `${src.name} (copia)` : "") };
    const written: string[] = [];
    const fail = async (kind: "quota" | "incompatible" | "error") => {
      await Promise.all(written.map((id) => deps.storage.deleteAsset(copy.id, id).catch(() => undefined)));
      cell.set({ error: { kind: kind === "quota" ? "quota" : "save" } });
      return false;
    };
    for (const a of assets) {
      const put = await deps.storage.putAsset(copy.id, a.id, a.blob).catch(() => ({ ok: false as const, kind: "error" as const, message: "" }));
      if (!put.ok) return fail(put.kind);
      written.push(a.id);
    }
    const saved = await deps.storage.saveProject(copy).catch(() => ({ ok: false as const, kind: "error" as const, message: "" }));
    if (!saved.ok) return fail(saved.kind);
    openLoaded(copy, assets, copy.revision);
    cell.set({ status: "saved" });
    return true;
  }
  async function deleteProject(id: string): Promise<boolean> {
    if (id === cell.get().history.present.id) return false;
    try {
      await deps.storage.deleteProject(id);
      return true;
    } catch {
      cell.set({ error: { kind: "save" } });
      return false;
    }
  }
  // Cambia el documento abierto; el estado de vista (selección, variante) no se arrastra.
  function openLoaded(project: Project, assets: StoredAsset[], savedRevision: number | null) {
    ctx.resetView();
    cell.set({
      history: createHistory(project), assets, savedRevision, status: "idle", error: null, backupParts: null,
      selectedId: null, activeVariantId: null, ready: true,
    });
    cell.set({ nearLimit: ctx.projectBytes() >= LIMITS.projectWarnBytes });
  }
  // Restaura una copia de seguridad (todas sus partes): valida, guarda y abre el proyecto.
  async function importBackup(blobs: Blob[]): Promise<boolean> {
    const r = await restoreBackup(blobs);
    if (!r.ok) {
      const e = r.error;
      cell.set({ error: e.kind === "limit" ? { kind: "limit", error: e.error } : e.kind === "unsupported_version" ? { kind: "unsupported_version" } : { kind: "restore" } });
      return false;
    }
    if (!(await flushBeforeSwitch())) return false;
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
        cell.set({ error: { kind: put.kind === "quota" ? "quota" : "save" } });
        return false;
      }
      written.push(a.id);
    }
    const saved = await deps.storage.saveProject(project);
    if (!saved.ok) {
      await rollback();
      cell.set({ error: { kind: saved.kind === "quota" ? "quota" : "save" } });
      return false;
    }
    // Blobs de una versión anterior del mismo proyecto que la copia ya no referencia.
    const keep = new Set(assets.map((a) => a.id));
    await Promise.all([...before].filter((id) => !keep.has(id)).map((id) => deps.storage.deleteAsset(project.id, id).catch(() => undefined)));
    openLoaded(project, assets, project.revision);
    cell.set({ status: "saved" });
    return true;
  }

  async function downloadBackup(): Promise<number> {
    const parts = await createBackupParts(cell.get().history.present, cell.get().assets, deps.maxBackupPartBytes);
    deps.downloadParts(parts);
    cell.set({ backupParts: parts.length });
    return parts.length;
  }

  return { init, save, isDirty, hasUnsavedChanges, listProjects, flushBeforeSwitch, newProject, openProject, duplicateProject, deleteProject, importBackup, downloadBackup };
}
