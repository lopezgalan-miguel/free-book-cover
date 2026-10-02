import { FONT_EXTENSIONS, FONT_MIME, catalogGroup, checkAssetLimits, detectFontFormat, documentFontFamilies, familyFromFileName, type Asset } from "@free-book-cover/core";
import type { EditorStore } from "../store/editorStore";
import type { FontRegistry } from "./fontRegistry";

export type ImportFontResult =
  | { ok: true; family: string; assetId: string }
  | { ok: false; reason: "unsupported" | "limit" | "load" | "command" };

// Familia única dentro del proyecto: no pisa el catálogo ni otra subida.
function uniqueFamily(base: string, taken: Set<string>): string {
  let name = base;
  for (let n = 2; taken.has(name) || catalogGroup(name) !== null; n++) name = `${base} ${n}`;
  return name;
}

// Sube una fuente: comprueba extensión, peso (20 MB) y firma, la carga con FontFace y SOLO si carga la guarda.
export async function importFont(store: EditorStore, registry: FontRegistry, file: File | Blob): Promise<ImportFontResult> {
  const name = "name" in file && typeof file.name === "string" ? file.name : "fuente";
  if (!FONT_EXTENSIONS.some((x) => name.toLowerCase().endsWith(x))) {
    store.reportError({ kind: "unsupported_font" });
    return { ok: false, reason: "unsupported" };
  }
  // Antes de leer el archivo entero a memoria.
  const early = checkAssetLimits({ kind: "font", sizeBytes: file.size }, 0);
  if (!early.ok && early.error.kind === "font_too_large") {
    store.reportError({ kind: "limit", error: early.error });
    return { ok: false, reason: "limit" };
  }
  const data = await file.arrayBuffer();
  const format = detectFontFormat(new Uint8Array(data, 0, Math.min(4, data.byteLength)));
  if (!format) {
    store.reportError({ kind: "unsupported_font" });
    return { ok: false, reason: "unsupported" };
  }
  const doc = store.getState().history.present;
  const family = uniqueFamily(familyFromFileName(name), documentFontFamilies(doc));
  const loaded = await registry.registerUpload(family, data);
  if (!loaded.ok) {
    store.reportError({ kind: "font_load_failed", family });
    return { ok: false, reason: "load" };
  }
  const asset: Asset = {
    id: store.newId(), kind: "font", mimeType: FONT_MIME[format],
    metadata: { family, name, format, sizeBytes: file.size },
  };
  if (!(await store.addAsset(asset, new Blob([data], { type: asset.mimeType })))) {
    registry.forget(family);
    const e = store.getState().error;
    return { ok: false, reason: e?.kind === "limit" ? "limit" : "command" };
  }
  return { ok: true, family, assetId: asset.id };
}

