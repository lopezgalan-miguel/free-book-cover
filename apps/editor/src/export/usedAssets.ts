import type { Project } from "@free-book-cover/core";

// Identificadores de imagen que pinta el documento (fondo, imágenes, texturas y máscaras visibles).
export function usedImageAssets(doc: Project): string[] {
  const ids = new Set<string>();
  if (typeof doc.canvas.background === "object") ids.add(doc.canvas.background.assetId);
  for (const e of doc.elements) {
    if (!e.visible) continue;
    if (e.type === "image") ids.add(e.assetRef.assetId);
    if (e.type === "text" && e.texture) ids.add(e.texture.assetId);
    if (e.type === "text" && e.mask) ids.add(e.mask.assetId);
  }
  return [...ids];
}
