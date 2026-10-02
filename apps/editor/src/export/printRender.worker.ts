import { assetDims, renderDocument, type Project } from "@free-book-cover/core";
import { paintDocument } from "../canvas/paint";
import type { ImageSources } from "../canvas/scene";
import { usedImageAssets } from "./usedAssets";

export interface WorkerRequest {
  doc: Project;
  widthPx: number;
  heightPx: number;
  // Originales de imagen usados por el documento.
  images: Array<{ id: string; blob: Blob }>;
  // Fuentes subidas que usa el texto (las del catálogo no llegan al Worker: ver printRender.ts).
  fonts: Array<{ family: string; blob: Blob }>;
}
export type WorkerMessage =
  | { type: "stage"; stage: "fonts" | "images" | "paint" | "encode" }
  | { type: "done"; blob: Blob }
  | { type: "error"; message: string };

const post = (m: WorkerMessage) => (self as unknown as Worker).postMessage(m);

// Misma ruta de pintado que la vista y la exportación de imagen (renderDocument + paintDocument), sobre OffscreenCanvas.
self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const { doc, widthPx, heightPx, images, fonts } = ev.data;
  const bitmaps: ImageBitmap[] = [];
  try {
    post({ type: "stage", stage: "fonts" });
    for (const f of fonts) {
      const face = new FontFace(f.family, await f.blob.arrayBuffer(), { weight: "100 900", style: "normal" });
      await face.load();
      (self as unknown as { fonts: FontFaceSet }).fonts.add(face);
    }
    post({ type: "stage", stage: "images" });
    const sources: ImageSources = new Map();
    for (const id of usedImageAssets(doc)) {
      const blob = images.find((i) => i.id === id)?.blob;
      const dims = assetDims(doc.assets.find((a) => a.id === id));
      if (!blob || !dims) continue;
      const bmp = await createImageBitmap(blob);
      bitmaps.push(bmp);
      sources.set(id, { image: bmp, scale: bmp.width / dims.widthPx });
    }
    post({ type: "stage", stage: "paint" });
    const canvas = new OffscreenCanvas(widthPx, heightPx);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas no disponible");
    const measureCtx = new OffscreenCanvas(1, 1).getContext("2d")!;
    if ("letterSpacing" in measureCtx) (measureCtx as unknown as { letterSpacing: string }).letterSpacing = "0px";
    const r = renderDocument(doc, {
      pxPerInch: widthPx / doc.canvas.widthIn,
      measureText: (text, css) => {
        measureCtx.font = css;
        return measureCtx.measureText(text).width;
      },
    });
    paintDocument(ctx as unknown as CanvasRenderingContext2D, r, sources);
    post({ type: "stage", stage: "encode" });
    post({ type: "done", blob: await canvas.convertToBlob({ type: "image/png" }) });
  } catch (e) {
    post({ type: "error", message: String((e as Error)?.message ?? e) });
  } finally {
    for (const b of bitmaps) b.close();
  }
};
