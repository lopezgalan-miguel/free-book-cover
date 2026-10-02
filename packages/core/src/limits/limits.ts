// Límites de producto de la primera versión (SDD §6). No son límites de KDP.
const MB = 1024 * 1024;
export const LIMITS = {
  imageBytes: 100 * MB,
  imageMegapixels: 80,
  fontBytes: 20 * MB,
  projectBytes: 500 * MB,
  projectWarnBytes: 400 * MB,
  exportMegapixels: 50,
} as const;

export interface AssetCandidate {
  kind: "image" | "font";
  sizeBytes: number;
  // Dimensiones decodificadas (solo imágenes); si faltan, solo se comprueba el peso.
  widthPx?: number;
  heightPx?: number;
}

export type LimitError =
  | { kind: "image_too_large"; limitBytes: number }
  | { kind: "image_too_many_megapixels"; limitMegapixels: number }
  | { kind: "font_too_large"; limitBytes: number }
  | { kind: "project_too_large"; limitBytes: number }
  | { kind: "invalid_size" };

export type LimitResult = { ok: true; warning?: "project_near_limit" } | { ok: false; error: LimitError };

// currentProjectBytes: originales + fuentes + documento ya guardados.
export function checkAssetLimits(asset: AssetCandidate, currentProjectBytes: number): LimitResult {
  const dims = [asset.widthPx, asset.heightPx].filter((v): v is number => v !== undefined);
  if (![asset.sizeBytes, currentProjectBytes, ...dims].every((v) => Number.isFinite(v) && v >= 0)) {
    return { ok: false, error: { kind: "invalid_size" } };
  }
  if (asset.kind === "image") {
    if (asset.sizeBytes > LIMITS.imageBytes) return { ok: false, error: { kind: "image_too_large", limitBytes: LIMITS.imageBytes } };
    if (asset.widthPx !== undefined && asset.heightPx !== undefined && (asset.widthPx * asset.heightPx) / 1e6 > LIMITS.imageMegapixels) {
      return { ok: false, error: { kind: "image_too_many_megapixels", limitMegapixels: LIMITS.imageMegapixels } };
    }
  } else if (asset.sizeBytes > LIMITS.fontBytes) {
    return { ok: false, error: { kind: "font_too_large", limitBytes: LIMITS.fontBytes } };
  }
  const total = currentProjectBytes + asset.sizeBytes;
  if (total > LIMITS.projectBytes) return { ok: false, error: { kind: "project_too_large", limitBytes: LIMITS.projectBytes } };
  return total >= LIMITS.projectWarnBytes ? { ok: true, warning: "project_near_limit" } : { ok: true };
}

export type ExportSizeResult =
  | { ok: true; megapixels: number }
  // suggested: mayor tamaño con la misma proporción que cabe en el límite.
  | { ok: false; error: { kind: "export_too_many_megapixels"; megapixels: number; limitMegapixels: number }; suggested: { widthPx: number; heightPx: number } }
  | { ok: false; error: { kind: "invalid_size" } };

// Mayor tamaño entero con la proporción dada que no supera el límite de megapíxeles.
export function fitToExportLimit(widthPx: number, heightPx: number): { widthPx: number; heightPx: number } {
  const maxPx = LIMITS.exportMegapixels * 1e6;
  if (widthPx * heightPx <= maxPx) return { widthPx, heightPx };
  const k = Math.sqrt(maxPx / (widthPx * heightPx));
  let w = Math.max(1, Math.floor(widthPx * k));
  let h = Math.max(1, Math.floor(heightPx * k));
  while (w * h > maxPx && (w > 1 || h > 1)) {
    if (w >= h) w--; else h--;
  }
  return { widthPx: w, heightPx: h };
}

// Límite de producto de la exportación digital: 50 megapíxeles por imagen (SDD §6).
export function checkExportSize(widthPx: number, heightPx: number): ExportSizeResult {
  if (![widthPx, heightPx].every((v) => Number.isInteger(v) && v > 0)) return { ok: false, error: { kind: "invalid_size" } };
  const megapixels = (widthPx * heightPx) / 1e6;
  if (megapixels > LIMITS.exportMegapixels) {
    return {
      ok: false,
      error: { kind: "export_too_many_megapixels", megapixels, limitMegapixels: LIMITS.exportMegapixels },
      suggested: fitToExportLimit(widthPx, heightPx),
    };
  }
  return { ok: true, megapixels };
}
