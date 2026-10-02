import type { Project } from "../schema/project.js";

// Recursos del documento que nada usa: ni el fondo, ni una imagen o textura (visibles o no), ni una
// fuente subida cuya familia aparezca en algún fragmento de texto.
export function unusedAssetIds(doc: Project): string[] {
  const used = new Set<string>();
  const families = new Set<string>();
  if (typeof doc.canvas.background === "object") used.add(doc.canvas.background.assetId);
  for (const e of doc.elements) {
    if (e.type === "image") used.add(e.assetRef.assetId);
    if (e.type === "text") {
      if (e.texture) used.add(e.texture.assetId);
      for (const r of e.runs) families.add(r.fontFamily);
    }
  }
  return doc.assets
    .filter((a) => !used.has(a.id) && !(a.kind === "font" && typeof a.metadata.family === "string" && families.has(a.metadata.family)))
    .map((a) => a.id);
}

// Identificadores de recurso referenciados por cualquier documento (para decidir qué blobs se pueden borrar).
export function referencedAssetIds(docs: Iterable<Project>): Set<string> {
  const ids = new Set<string>();
  for (const d of docs) for (const a of d.assets) ids.add(a.id);
  return ids;
}
