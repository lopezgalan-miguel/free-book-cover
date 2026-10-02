import type { ExportFormat } from "../presets/digital.js";

export interface ExportFormatInfo {
  format: ExportFormat;
  mimeType: string;
  extension: string;
  // Admite calidad ajustable (con pérdida).
  lossy: boolean;
}

export const EXPORT_FORMATS: readonly ExportFormatInfo[] = [
  { format: "png", mimeType: "image/png", extension: "png", lossy: false },
  { format: "jpeg", mimeType: "image/jpeg", extension: "jpg", lossy: true },
  { format: "webp", mimeType: "image/webp", extension: "webp", lossy: true },
];

export const formatInfo = (f: ExportFormat): ExportFormatInfo => EXPORT_FORMATS.find((x) => x.format === f)!;

export const DEFAULT_EXPORT_QUALITY = 90;

// Informe de una exportación (SDD R-07/R-08): formato, dimensiones, peso y destino.
export interface ExportReport {
  format: ExportFormat;
  mimeType: string;
  widthPx: number;
  heightPx: number;
  megapixels: number;
  bytes: number;
  // Solo en formatos con pérdida.
  quality?: number;
  destination: string;
  fileName: string;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function exportFileName(projectName: string, destination: string, format: ExportFormat, widthPx: number, heightPx: number): string {
  const parts = [slug(projectName) || "portada", slug(destination), `${widthPx}x${heightPx}`].filter(Boolean);
  return `${parts.join("-")}.${formatInfo(format).extension}`;
}

export function buildExportReport(
  r: { format: ExportFormat; widthPx: number; heightPx: number; bytes: number; quality?: number; destination: string; projectName: string },
): ExportReport {
  const info = formatInfo(r.format);
  return {
    format: r.format, mimeType: info.mimeType, widthPx: r.widthPx, heightPx: r.heightPx,
    megapixels: (r.widthPx * r.heightPx) / 1e6, bytes: r.bytes,
    ...(info.lossy && r.quality !== undefined ? { quality: r.quality } : {}),
    destination: r.destination,
    fileName: exportFileName(r.projectName, r.destination, r.format, r.widthPx, r.heightPx),
  };
}
