// Límites de producto de la primera versión (SDD §6). No son límites de KDP.
const MB = 1024 * 1024;
export const LIMITS = {
  imageBytes: 100 * MB,
  imageMegapixels: 80,
  fontBytes: 20 * MB,
  projectBytes: 500 * MB,
  projectWarnBytes: 400 * MB,
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
