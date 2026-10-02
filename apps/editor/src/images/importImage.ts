import { readImageHeader, type Asset, type ImageElement } from "@free-book-cover/core";
import type { EditorStore } from "../store/editorStore";

// Se lee solo el principio del archivo: basta para PNG/WebP/GIF y para el SOF de casi todos los JPEG.
const HEADER_BYTES = 1024 * 1024;
export const THUMB_MAX_PX = 1024;
export const thumbId = (assetId: string) => `${assetId}.thumb`;
// Recurso al que pertenece un blob guardado (el original o su miniatura derivada).
export const baseAssetId = (blobId: string) => (blobId.endsWith(".thumb") ? blobId.slice(0, -".thumb".length) : blobId);

export type ThumbnailMaker = (file: Blob, maxPx: number) => Promise<Blob | null>;
// "asset": solo guarda el recurso (p. ej. una textura de texto); quien llama lo referencia.
export type ImportTarget = "background" | "layer" | "asset";
export type ImportResult =
  | { ok: true; assetId: string; elementId?: string }
  | { ok: false; reason: "unsupported" | "limit" | "command" };

// Miniatura derivada con el navegador (no disponible en pruebas Node: se inyecta otra).
export const browserThumbnail: ThumbnailMaker = async (file, maxPx) => {
  try {
    const probe = await createImageBitmap(file);
    const k = Math.min(1, maxPx / Math.max(probe.width, probe.height));
    const w = Math.max(1, Math.round(probe.width * k));
    const h = Math.max(1, Math.round(probe.height * k));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(probe, 0, 0, w, h);
    probe.close();
    return await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.85));
  } catch {
    return null;
  }
};

// Importa una imagen: cabecera -> límites (80 Mpx sin decodificar) -> original -> miniatura -> colocación.
export async function importImage(
  store: EditorStore,
  file: File | Blob,
  target: ImportTarget,
  makeThumbnail: ThumbnailMaker = browserThumbnail,
  expectedRevision?: number,
): Promise<ImportResult> {
  const head = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  const header = readImageHeader(head);
  if (!header) {
    store.reportError({ kind: "unsupported_image" });
    return { ok: false, reason: "unsupported" };
  }
  const asset: Asset = {
    id: store.newId(),
    kind: "image",
    mimeType: header.mimeType,
    metadata: {
      widthPx: header.widthPx,
      heightPx: header.heightPx,
      format: header.format,
      ...(header.orientation ? { orientation: header.orientation } : {}),
      sizeBytes: file.size,
      ...("name" in file && typeof file.name === "string" ? { name: file.name } : {}),
    },
  };
  const stored = new Blob([file], { type: header.mimeType });
  if (!(await store.addAsset(asset, stored, { widthPx: header.widthPx, heightPx: header.heightPx, ...(expectedRevision !== undefined ? { expectedRevision } : {}) }))) {
    return { ok: false, reason: "limit" };
  }
  const thumb = await makeThumbnail(file, THUMB_MAX_PX);
  if (thumb) await store.addDerivedBlob(thumbId(asset.id), thumb);

  if (target === "asset") return { ok: true, assetId: asset.id };
  if (target === "background") {
    return store.dispatch({ type: "setBackground", background: { assetId: asset.id } })
      ? { ok: true, assetId: asset.id }
      : { ok: false, reason: "command" };
  }
  const { widthIn, heightIn } = store.getState().history.present.canvas;
  // Caja con la proporción de la imagen, hasta el 80 % del lienzo y centrada.
  const k = Math.min((widthIn * 0.8) / header.widthPx, (heightIn * 0.8) / header.heightPx);
  const w = header.widthPx * k;
  const h = header.heightPx * k;
  const element: ImageElement = {
    id: store.newId(), type: "image", x: (widthIn - w) / 2, y: (heightIn - h) / 2, width: w, height: h,
    rotation: 0, zIndex: 0, visible: true, assetRef: { assetId: asset.id },
    crop: { x: 0, y: 0, width: 1, height: 1 }, fit: "cover",
  };
  if (!store.dispatch({ type: "addElement", element })) return { ok: false, reason: "command" };
  store.select(element.id);
  return { ok: true, assetId: asset.id, elementId: element.id };
}
