import { FONT_EXTENSIONS, FONT_MIME, catalogGroup, checkAssetLimits, checkProjectBytes, detectFontFormat, documentFontFamilies, familyFromFileName, isFontCollection, splitFontCollection, type Asset, type FontFormat } from "@free-book-cover/core";
import type { FontPort } from "../store/ports";
import type { FontRegistry } from "./fontRegistry";

export type ImportFontResult =
  | { ok: true; family: string; assetId: string; added: Array<{ family: string; assetId: string }> }
  | { ok: false; reason: "unsupported" | "limit" | "load" | "command" };

// Familia única dentro del proyecto: no pisa el catálogo ni otra subida.
function uniqueFamily(base: string, taken: Set<string>): string {
  let name = base;
  for (let n = 2; taken.has(name) || catalogGroup(name) !== null; n++) name = `${base} ${n}`;
  return name;
}

// Sube una fuente: comprueba extensión, peso (20 MB) y firma, la carga con FontFace y SOLO si carga la guarda.
export async function importFont(store: FontPort, registry: FontRegistry, file: File | Blob): Promise<ImportFontResult> {
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
  const bytes = new Uint8Array(data);
  const format = detectFontFormat(bytes.subarray(0, 4));
  const collection = isFontCollection(bytes);
  if (!format && !collection) {
    store.reportError({ kind: "unsupported_font" });
    return { ok: false, reason: "unsupported" };
  }
  const taken = documentFontFamilies(store.getState().history.present);
  // Una fuente suelta es una «cara» más; una colección aporta una por cada fuente que contiene.
  let faces: Array<{ bytes: Uint8Array; format: FontFormat; base: string; label: string; mainScore: number }>;
  if (collection) {
    const split = splitFontCollection(bytes);
    if (!split.ok) {
      store.reportError({ kind: split.reason === "too_many" ? "collection_too_many" : "unsupported_font" });
      return { ok: false, reason: "unsupported" };
    }
    const fileFamily = familyFromFileName(name);
    faces = split.faces.map((f, i) => {
      const family = f.family || fileFamily;
      const subfamily = f.subfamily || (f.weight === 400 && !f.italic ? "Regular" : `Cara ${i + 1}`);
      // La principal es la más cercana a 400 sin cursiva (la cursiva queda siempre detrás).
      return { bytes: f.bytes, format: f.format, base: subfamily === "Regular" ? family : `${family} ${subfamily}`, label: subfamily, mainScore: Math.abs(f.weight - 400) + (f.italic ? 10000 : 0) };
    });
  } else {
    faces = [{ bytes, format: format!, base: familyFromFileName(name), label: "", mainScore: 0 }];
  }
  // Primero se registran todas las caras: si alguna falla no se ha tocado el documento y basta olvidarlas.
  const registered: Array<{ family: string; asset: Asset; blob: Blob }> = [];
  const forgetAll = () => registered.forEach((r) => registry.forget(r.family));
  const used = new Set(taken);
  for (const f of faces) {
    const family = uniqueFamily(f.base, used);
    used.add(family);
    const buf = f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) as ArrayBuffer;
    const loaded = await registry.registerUpload(family, buf);
    if (!loaded.ok) {
      forgetAll();
      store.reportError({ kind: "font_load_failed", family });
      return { ok: false, reason: "load" };
    }
    const mimeType = FONT_MIME[f.format];
    registered.push({
      family, blob: new Blob([buf], { type: mimeType }),
      asset: { id: store.newId(), kind: "font", mimeType, metadata: { family, name: f.label ? `${name} · ${f.label}` : name, format: f.format, sizeBytes: f.label ? f.bytes.length : file.size } },
    });
  }
  // Comprobación previa: todas las caras juntas deben caber en el proyecto; si no, no se añade ninguna.
  const total = registered.reduce((n, r) => n + r.blob.size, 0);
  const fit = checkProjectBytes(total, store.projectBytes());
  if (!fit.ok) {
    forgetAll();
    store.reportError({ kind: "limit", error: fit.error });
    return { ok: false, reason: "limit" };
  }
  const added: Array<{ family: string; assetId: string }> = [];
  for (const [i, r] of registered.entries()) {
    if (!(await store.addAsset(r.asset, r.blob))) {
      // El puerto no puede retirar recursos sin dejar pasos en el historial: las caras ya guardadas (0..i-1)
      // son recursos del documento y siguen registradas y usables; solo se olvidan las que no llegaron a guardarse.
      registered.slice(i).forEach((x) => registry.forget(x.family));
      const e = store.getState().error;
      return { ok: false, reason: e?.kind === "limit" ? "limit" : "command" };
    }
    added.push({ family: r.family, assetId: r.asset.id });
  }
  // Una subida correcta quita el aviso de fuente anterior; los demás errores se quedan.
  const prev = store.getState().error;
  if (prev && (prev.kind === "unsupported_font" || prev.kind === "font_load_failed" || prev.kind === "collection_too_many" || (prev.kind === "limit" && prev.error.kind === "font_too_large"))) store.dismissError();
  const main = faces.reduce((best, f, i) => (f.mainScore < faces[best]!.mainScore ? i : best), 0);
  return { ok: true, family: added[main]!.family, assetId: added[main]!.assetId, added };
}

