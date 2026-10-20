import type { Asset, Element, Project } from "../schema/project.js";
import { elementBounds } from "../variants/variants.js";

// Desplazamiento al pegar en el mismo proyecto, para que la copia no tape al original.
export const PASTE_OFFSET_IN = 0.125;

export interface ClipboardContent {
  sourceProjectId: string;
  elements: Element[];
  assets: Asset[];
}

// Recursos que una capa necesita; mismo criterio que unusedAssetIds (imagen, textura, máscara y fuentes por familia).
export function elementAssetIds(doc: Project, el: Element): string[] {
  const ids = new Set<string>();
  if (el.type === "image") ids.add(el.assetRef.assetId);
  if (el.type === "text") {
    if (el.texture) ids.add(el.texture.assetId);
    if (el.mask) ids.add(el.mask.assetId);
    const families = new Set(el.runs.map((r) => r.fontFamily));
    for (const a of doc.assets) {
      if (a.kind === "font" && typeof a.metadata.family === "string" && families.has(a.metadata.family)) ids.add(a.id);
    }
  }
  return [...ids];
}

// Capas e ids de recurso listos para el comando pasteElements: ids nuevos, desplazamiento y recursos que faltan.
export function preparePaste(target: Project, clip: ClipboardContent, newId: () => string): { elements: Element[]; assets: Asset[] } {
  const offset = clip.sourceProjectId === target.id ? PASTE_OFFSET_IN : 0;
  const { widthIn: W, heightIn: H } = target.canvas;
  const elements = clip.elements.map((e) => {
    let x = e.x + offset;
    let y = e.y + offset;
    const b = elementBounds({ ...e, x, y });
    // Una capa que no toca el lienzo se centra, para no pegarla donde nadie la ve.
    if (b.x >= W || b.x + b.width <= 0 || b.y >= H || b.y + b.height <= 0) {
      x = (W - e.width) / 2;
      y = (H - e.height) / 2;
    }
    return { ...e, id: newId(), x, y } as Element;
  });
  const have = new Set(target.assets.map((a) => a.id));
  return { elements, assets: clip.assets.filter((a) => !have.has(a.id)) };
}
