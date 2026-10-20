import { checkProjectBytes, elementAssetIds, preparePaste, type ClipboardContent, type Command } from "@free-book-cover/core";
import { thumbId } from "../storage/assetIds";
import type { StoredAsset } from "../storage/projectStorage";
import type { EditorDeps, EditorState } from "./editorStore";
import type { StateCell } from "./state";

// Lo copiado: capas y recursos del core más los blobs en memoria (original y miniatura) para llevarlos a otro proyecto.
interface Clip {
  content: ClipboardContent;
  blobs: StoredAsset[];
}

// Copiar, pegar y duplicar la capa seleccionada, también entre proyectos. El portapapeles vive en este cierre.
export function createClipboardActions(
  cell: StateCell<EditorState>,
  deps: EditorDeps,
  cmds: { dispatch: (cmd: Command) => boolean },
  assets: { projectBytes: () => number },
) {
  let clip: Clip | null = null;

  // Siempre el elemento del diseño base: una variante activa no altera lo copiado.
  function snapshot(): Clip | null {
    const { selectedId, history, assets: stored } = cell.get();
    const doc = history.present;
    const el = doc.elements.find((e) => e.id === selectedId);
    if (!el) return null;
    const records = elementAssetIds(doc, el).flatMap((id) => doc.assets.filter((a) => a.id === id));
    const ids = new Set(records.flatMap((a) => [a.id, thumbId(a.id)]));
    return {
      content: { sourceProjectId: doc.id, elements: [el], assets: records },
      blobs: stored.filter((b) => ids.has(b.id)),
    };
  }

  function copySelection(): boolean {
    const next = snapshot();
    if (!next) return false;
    clip = next;
    cell.set({ hasClipboard: true });
    return true;
  }

  async function pasteClip(source: Clip): Promise<boolean> {
    const projectId = cell.get().history.present.id;
    const prepared = preparePaste(cell.get().history.present, source.content, deps.newId);
    const missing = new Set(prepared.assets.flatMap((a) => [a.id, thumbId(a.id)]));
    // Los recursos que el proyecto ya tiene no se vuelven a escribir.
    const toWrite = source.blobs.filter((b) => missing.has(b.id));
    const bytes = toWrite.reduce((n, b) => n + b.blob.size, 0);
    if (toWrite.length > 0) {
      const limit = checkProjectBytes(bytes, assets.projectBytes());
      if (!limit.ok) {
        cell.set({ error: { kind: "limit", error: limit.error } });
        return false;
      }
    }
    const written: string[] = [];
    const rollback = () => Promise.all(written.map((id) => deps.storage.deleteAsset(projectId, id).catch(() => undefined)));
    for (const b of toWrite) {
      const put = await deps.storage.putAsset(projectId, b.id, b.blob).catch(() => ({ ok: false as const, kind: "error" as const }));
      if (!put.ok) {
        await rollback();
        cell.set({ error: { kind: put.kind === "quota" ? "quota" : "save" } });
        return false;
      }
      written.push(b.id);
    }
    // Sin esperas entre registrar los blobs y despachar: la limpieza de huérfanos no los ve a medias.
    const previous = cell.get().assets;
    if (toWrite.length > 0) cell.set({ assets: [...previous.filter((a) => !missing.has(a.id)), ...toWrite] });
    if (!cmds.dispatch({ type: "pasteElements", elements: prepared.elements, assets: prepared.assets })) {
      cell.set({ assets: previous });
      await rollback();
      return false;
    }
    cell.set({ selectedId: prepared.elements[prepared.elements.length - 1]!.id });
    return true;
  }

  async function paste(): Promise<boolean> {
    return clip ? pasteClip(clip) : false;
  }
  // Copia y pega sin tocar lo que hubiera en el portapapeles.
  async function duplicateSelection(): Promise<boolean> {
    const next = snapshot();
    return next ? pasteClip(next) : false;
  }

  return { copySelection, paste, duplicateSelection, canPaste: () => clip !== null };
}
