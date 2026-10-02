import {
  assetDims, buildExportReport, checkExportSize, formatInfo, renderDocument,
  type ExportFormat, type ExportReport, type FontProblem, type Project,
} from "@free-book-cover/core";
import type { StoredAsset } from "../storage/projectStorage";
import { paintDocument } from "../canvas/paint";
import { browserMeasure } from "../canvas/measure";
import type { ImageSources } from "../canvas/scene";

export interface ExportRequest {
  // Documento a rasterizar: el base o una variante ya derivada.
  doc: Project;
  widthPx: number;
  heightPx: number;
  format: ExportFormat;
  // 1..100; solo cuenta en formatos con pérdida.
  quality: number;
  destination: string;
  projectName: string;
  // Formatos que admite el destino; si falta, todos.
  allowedFormats?: readonly ExportFormat[];
}

export type ExportError =
  | { kind: "format_not_allowed"; format: ExportFormat }
  | { kind: "limit"; megapixels: number; limitMegapixels: number; suggested: { widthPx: number; heightPx: number } | null }
  | { kind: "fonts"; problems: FontProblem[] }
  | { kind: "missing_assets"; assetIds: string[] }
  | { kind: "encode_unsupported"; format: ExportFormat }
  // El navegador no pudo producir la imagen (p. ej. lienzo demasiado grande para él).
  | { kind: "encode_failed" }
  | { kind: "render_failed"; message: string };

export type ExportOutcome = { ok: true; blob: Blob; report: ExportReport } | { ok: false; error: ExportError };

// Dependencias del navegador, inyectables para probar el flujo sin DOM.
export interface ExportDeps {
  fonts: {
    ensureDoc(doc: Project): void;
    whenSettled(doc: Project): Promise<void>;
    checkFontsReady(doc: Project): { ok: true } | { ok: false; problems: FontProblem[] };
  };
  // Imágenes que usa el documento y de las que no hay original guardado.
  missingAssets(doc: Project): string[];
  render(doc: Project, size: { widthPx: number; heightPx: number }): Promise<unknown>;
  encode(canvas: unknown, mimeType: string, quality: number | undefined): Promise<Blob | null>;
}

// Exporta una imagen. Orden: formato -> límite de megapíxeles -> fuentes -> recursos -> rasterizado.
// Nada se sustituye en silencio: cualquier fallo devuelve un error explícito y no hay archivo.
export async function runExport(req: ExportRequest, deps: ExportDeps): Promise<ExportOutcome> {
  if (req.allowedFormats && !req.allowedFormats.includes(req.format)) {
    return { ok: false, error: { kind: "format_not_allowed", format: req.format } };
  }
  const size = checkExportSize(req.widthPx, req.heightPx);
  if (!size.ok) {
    return {
      ok: false,
      error: size.error.kind === "export_too_many_megapixels"
        ? { kind: "limit", megapixels: size.error.megapixels, limitMegapixels: size.error.limitMegapixels, suggested: "suggested" in size ? size.suggested : null }
        : { kind: "render_failed", message: "invalid_size" },
    };
  }
  deps.fonts.ensureDoc(req.doc);
  await deps.fonts.whenSettled(req.doc);
  const fonts = deps.fonts.checkFontsReady(req.doc);
  if (!fonts.ok) return { ok: false, error: { kind: "fonts", problems: fonts.problems } };
  const missing = deps.missingAssets(req.doc);
  if (missing.length) return { ok: false, error: { kind: "missing_assets", assetIds: missing } };

  const info = formatInfo(req.format);
  const quality = info.lossy ? Math.min(100, Math.max(1, Math.round(req.quality))) : undefined;
  let blob: Blob | null;
  try {
    const canvas = await deps.render(req.doc, { widthPx: req.widthPx, heightPx: req.heightPx });
    blob = await deps.encode(canvas, info.mimeType, quality === undefined ? undefined : quality / 100);
  } catch (e) {
    return { ok: false, error: { kind: "render_failed", message: String((e as Error)?.message ?? e) } };
  }
  // Un navegador sin codificador para el formato devuelve PNG o nada: no se entrega como si fuese lo pedido.
  if (!blob) return { ok: false, error: { kind: "encode_failed" } };
  if (blob.type !== info.mimeType) return { ok: false, error: { kind: "encode_unsupported", format: req.format } };
  const report = buildExportReport({
    format: req.format, widthPx: req.widthPx, heightPx: req.heightPx, bytes: blob.size,
    ...(quality !== undefined ? { quality } : {}), destination: req.destination, projectName: req.projectName,
  });
  return { ok: true, blob, report };
}

// Identificadores de imagen que pinta el documento (fondo, imágenes y texturas visibles).
export function usedImageAssets(doc: Project): string[] {
  const ids = new Set<string>();
  if (typeof doc.canvas.background === "object") ids.add(doc.canvas.background.assetId);
  for (const e of doc.elements) {
    if (!e.visible) continue;
    if (e.type === "image") ids.add(e.assetRef.assetId);
    if (e.type === "text" && e.texture) ids.add(e.texture.assetId);
  }
  return [...ids];
}

export function browserExportDeps(fonts: ExportDeps["fonts"], getAssets: () => StoredAsset[]): ExportDeps {
  return {
    fonts,
    missingAssets(doc) {
      const stored = new Set(getAssets().map((a) => a.id));
      return usedImageAssets(doc).filter((id) => !stored.has(id));
    },
    async render(doc, { widthPx, heightPx }) {
      // Se decodifican los originales (no las miniaturas de la vista previa).
      const sources: ImageSources = new Map();
      const bitmaps: ImageBitmap[] = [];
      try {
        for (const id of usedImageAssets(doc)) {
          const asset = doc.assets.find((a) => a.id === id);
          const dims = assetDims(asset);
          const blob = getAssets().find((a) => a.id === id)?.blob;
          if (!blob || !dims) continue;
          const bmp = await createImageBitmap(blob);
          bitmaps.push(bmp);
          sources.set(id, { image: bmp, scale: bmp.width / dims.widthPx });
        }
        const measure = browserMeasure();
        const r = renderDocument(doc, { pxPerInch: widthPx / doc.canvas.widthIn, ...(measure ? { measureText: measure } : {}) });
        const canvas = document.createElement("canvas");
        canvas.width = widthPx;
        canvas.height = heightPx;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas no disponible");
        paintDocument(ctx, r, sources);
        return canvas;
      } finally {
        for (const b of bitmaps) b.close();
      }
    },
    encode: (canvas, mimeType, quality) =>
      new Promise<Blob | null>((res) => (canvas as HTMLCanvasElement).toBlob(res, mimeType, quality)),
  };
}

// Descarga un blob con un enlace temporal.
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
