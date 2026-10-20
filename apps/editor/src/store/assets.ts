import { LIMITS, checkAssetLimits, checkProjectBytes, createHistory, execute, referencedAssetIds, unusedAssetIds, type Asset, type AssetCandidate, type Command, type LimitResult } from "@free-book-cover/core";
import { baseAssetId } from "../storage/assetIds";
import type { EditorDeps, EditorState, FreeResult } from "./editorStore";
import type { StateCell } from "./state";

// Blobs de recursos: límites, guardado, huérfanos y liberación de espacio.
export function createAssetActions(
  cell: StateCell<EditorState>,
  deps: EditorDeps,
  cmds: { dispatch: (cmd: Command) => boolean; applyRemote: (cmd: Command, expectedRevision: number) => { ok: boolean } },
) {
  // Blobs que se están guardando y aún no figuran en el documento: la limpieza no los toca.
  const pending = new Set<string>();
  const projectBytes = () =>
    cell.get().assets.reduce((n, a) => n + a.blob.size, 0) + JSON.stringify(cell.get().history.present).length;

  // Comprueba un límite y, si el proyecto no cabe, libera lo que ningún paso del historial referencia y
  // lo comprueba otra vez antes de rechazar.
  async function checkWithPurge(check: () => LimitResult): Promise<LimitResult> {
    const limit = check();
    if (!limit.ok && limit.error.kind === "project_too_large" && (await purgeOrphans()).removed > 0) return check();
    return limit;
  }

  // meta: dimensiones decodificadas de la imagen, si se conocen, para el límite de megapíxeles.
  async function addAsset(asset: Asset, blob: Blob, meta: { widthPx?: number; heightPx?: number; expectedRevision?: number } = {}): Promise<boolean> {
    const { expectedRevision, ...dims } = meta;
    const candidate: AssetCandidate = { kind: asset.kind, sizeBytes: blob.size, ...dims };
    const limit = await checkWithPurge(() => checkAssetLimits(candidate, projectBytes()));
    if (!limit.ok) {
      cell.set({ error: { kind: "limit", error: limit.error } });
      return false;
    }
    pending.add(asset.id);
    try {
      const put = await deps.storage.putAsset(cell.get().history.present.id, asset.id, blob);
      if (!put.ok) {
        cell.set({ error: { kind: put.kind === "quota" ? "quota" : "save" } });
        return false;
      }
      const previous = cell.get().assets;
      cell.set({ assets: [...previous.filter((a) => a.id !== asset.id), { id: asset.id, blob }], nearLimit: limit.warning === "project_near_limit" });
      // Con revisión esperada (MCP) el comando falla si el documento cambió durante la importación.
      if (expectedRevision !== undefined ? cmds.applyRemote({ type: "addAsset", asset }, expectedRevision).ok : cmds.dispatch({ type: "addAsset", asset })) return true;
      // El comando falló: no se deja un blob huérfano ni en memoria ni en disco.
      cell.set({ assets: previous, nearLimit: previous.length > 0 && projectBytes() >= LIMITS.projectWarnBytes });
      await deps.storage.deleteAsset(cell.get().history.present.id, asset.id).catch(() => undefined);
      return false;
    } finally {
      pending.delete(asset.id);
    }
  }

  // Derivado (p. ej. miniatura): se guarda como blob aparte y nunca sustituye al original.
  async function addDerivedBlob(id: string, blob: Blob): Promise<boolean> {
    // También los derivados cuentan para el máximo del proyecto (SDD §6).
    const replaced = cell.get().assets.find((a) => a.id === id)?.blob.size ?? 0;
    const limit = checkProjectBytes(blob.size, projectBytes() - replaced);
    if (!limit.ok && limit.error.kind === "project_too_large") return false;
    pending.add(id);
    try {
      const put = await deps.storage.putAsset(cell.get().history.present.id, id, blob);
      if (!put.ok) return false;
      cell.set({ assets: [...cell.get().assets.filter((a) => a.id !== id), { id, blob }] });
      return true;
    } finally {
      pending.delete(id);
    }
  }

  // Borra los blobs que ningún documento del historial (pasado, presente o rehacer) referencia: no rompe
  // deshacer ni rehacer. Las miniaturas siguen a su recurso. El contador de tamaño se recalcula.
  async function purgeOrphans(): Promise<FreeResult> {
    const h = cell.get().history;
    const refs = referencedAssetIds([...h.past, h.present, ...h.future]);
    const orphan = cell.get().assets.filter((a) => !refs.has(baseAssetId(a.id)) && !pending.has(a.id) && !pending.has(baseAssetId(a.id)));
    if (orphan.length === 0) return { removed: 0, bytes: 0 };
    const gone = new Set(orphan.map((a) => a.id));
    const assets = cell.get().assets.filter((a) => !gone.has(a.id));
    cell.set({ assets });
    cell.set({ nearLimit: projectBytes() >= LIMITS.projectWarnBytes });
    await Promise.all(orphan.map((a) => deps.storage.deleteAsset(cell.get().history.present.id, a.id).catch(() => undefined)));
    return { removed: orphan.length, bytes: orphan.reduce((n, a) => n + a.blob.size, 0) };
  }

  // Recursos del documento que nada usa y espacio que ocupan (con sus miniaturas).
  function unusedAssets(): { ids: string[]; bytes: number } {
    const ids = unusedAssetIds(cell.get().history.present);
    const set_ = new Set(ids);
    const bytes = cell.get().assets.filter((a) => set_.has(baseAssetId(a.id))).reduce((n, a) => n + a.blob.size, 0);
    return { ids, bytes };
  }

  // Acción del usuario «liberar espacio»: quita del documento los recursos sin uso y borra sus blobs.
  // Como esos recursos aparecen en pasos anteriores, el historial de deshacer se descarta.
  async function freeUnused(): Promise<FreeResult> {
    const before = projectBytes();
    const { ids } = unusedAssets();
    if (ids.length > 0) {
      let h = cell.get().history;
      for (const id of ids) {
        const r = execute(h, { type: "removeAsset", id }, h.present.revision);
        if (!r.ok) {
          cell.set({ error: { kind: "command", error: r.error } });
          return { removed: 0, bytes: 0 };
        }
        h = r.history;
      }
      cell.set({ history: createHistory(h.present, h.limit), status: "idle" });
    }
    const purged = await purgeOrphans();
    return { removed: ids.length + (ids.length ? 0 : purged.removed), bytes: Math.max(0, before - projectBytes()) };
  }

  return { projectBytes, checkWithPurge, addAsset, addDerivedBlob, purgeOrphans, unusedAssets, freeUnused };
}
