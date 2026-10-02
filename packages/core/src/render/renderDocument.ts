import type { Asset, Element, Project } from "../schema/project.js";
import { CENTER, placeImage, rectCenter, rotatePoint, type FitMode, type Placement, type Point, type Rect } from "../geometry/fit.js";
import { effectiveDpi, isLowDpi } from "../images/dpi.js";

export interface RenderOptions {
  // Escala de la composición: píxeles por pulgada (300 en exportación, menos en la vista previa).
  pxPerInch: number;
}

export interface ImageDraw extends Placement {
  assetId: string;
  fit: FitMode;
  // ppp efectivos de los píxeles de origen usados; null si no se conocen las dimensiones.
  dpi: number | null;
  lowDpi: boolean;
}

export type RenderBackground =
  | { kind: "color"; color: string }
  | { kind: "image"; draw: ImageDraw | null; fallbackColor: string };

interface ItemBase {
  id: string;
  zIndex: number;
  box: Rect; // px, sin rotar
  rotation: number; // grados, alrededor del centro de la caja
}
export type RenderItem =
  | (ItemBase & { kind: "image"; draw: ImageDraw | null })
  | (ItemBase & { kind: "text"; element: Extract<Element, { type: "text" }> })
  | (ItemBase & { kind: "shape"; element: Extract<Element, { type: "shape" }> });

export interface RenderedDocument {
  widthPx: number;
  heightPx: number;
  pxPerInch: number;
  background: RenderBackground;
  // De atrás hacia delante, solo elementos visibles.
  items: RenderItem[];
}

export interface AssetDims {
  widthPx: number;
  heightPx: number;
}

export function assetDims(asset: Asset | undefined): AssetDims | null {
  const m = asset?.metadata;
  const w = m?.widthPx;
  const h = m?.heightPx;
  return typeof w === "number" && typeof h === "number" && w > 0 && h > 0 ? { widthPx: w, heightPx: h } : null;
}

function imageDraw(dims: AssetDims | null, assetId: string, region: Rect | null, box: Rect, fit: FitMode, pos: Point, ppi: number): ImageDraw | null {
  if (!dims) return null;
  const full: Rect = region ?? { x: 0, y: 0, width: dims.widthPx, height: dims.heightPx };
  const placement = placeImage(full, box, fit, pos);
  const dpi = effectiveDpi(placement.src.width, placement.src.height, placement.dest.width / ppi, placement.dest.height / ppi);
  return { ...placement, assetId, fit, dpi, lowDpi: isLowDpi(dpi) };
}

// Composición pura y determinista, compartida por la vista previa y la exportación.
// No toca DOM: devuelve la lista de operaciones de dibujo en píxeles.
export function renderDocument(doc: Project, opts: RenderOptions): RenderedDocument {
  const ppi = opts.pxPerInch;
  if (!Number.isFinite(ppi) || ppi <= 0) throw new RangeError("pxPerInch debe ser finito y positivo");
  const { canvas } = doc;
  const widthPx = canvas.widthIn * ppi;
  const heightPx = canvas.heightIn * ppi;
  const assets = new Map(doc.assets.map((a) => [a.id, a]));

  let background: RenderBackground;
  if (typeof canvas.background === "string") {
    background = { kind: "color", color: canvas.background };
  } else {
    const id = canvas.background.assetId;
    background = {
      kind: "image",
      fallbackColor: "#000000",
      draw: imageDraw(assetDims(assets.get(id)), id, null, { x: 0, y: 0, width: widthPx, height: heightPx }, canvas.backgroundFit ?? "cover", canvas.backgroundPos ?? CENTER, ppi),
    };
  }

  const items: RenderItem[] = [...doc.elements]
    .map((e, i) => [e, i] as const)
    .sort((a, b) => a[0].zIndex - b[0].zIndex || a[1] - b[1])
    .map(([e]) => e)
    .filter((e) => e.visible)
    .map((e): RenderItem => {
      const base = { id: e.id, zIndex: e.zIndex, box: { x: e.x * ppi, y: e.y * ppi, width: e.width * ppi, height: e.height * ppi }, rotation: e.rotation };
      if (e.type === "image") {
        const dims = assetDims(assets.get(e.assetRef.assetId));
        const region = dims
          ? { x: e.crop.x * dims.widthPx, y: e.crop.y * dims.heightPx, width: e.crop.width * dims.widthPx, height: e.crop.height * dims.heightPx }
          : null;
        return { ...base, kind: "image", draw: imageDraw(dims, e.assetRef.assetId, region, base.box, e.fit, CENTER, ppi) };
      }
      return e.type === "text" ? { ...base, kind: "text", element: e } : { ...base, kind: "shape", element: e };
    });

  return { widthPx, heightPx, pxPerInch: ppi, background, items };
}

// Centro del rectángulo de destino ya girado alrededor del centro de la caja:
// lo que necesita un lienzo con origen en el centro (Fabric) o un ctx.translate.
export function drawCenter(item: { box: Rect; rotation: number }, dest: Rect): Point {
  return rotatePoint(rectCenter(dest), rectCenter(item.box), item.rotation);
}

export interface DpiEntry {
  id: string; // id del elemento o "background"
  dpi: number;
  lowDpi: boolean;
}

// Avisos de resolución (< 300 ppp) a la escala impresa del documento.
export function dpiReport(doc: Project): DpiEntry[] {
  const r = renderDocument(doc, { pxPerInch: 300 });
  const out: DpiEntry[] = [];
  if (r.background.kind === "image" && r.background.draw?.dpi != null) {
    out.push({ id: "background", dpi: r.background.draw.dpi, lowDpi: r.background.draw.lowDpi });
  }
  for (const it of r.items) if (it.kind === "image" && it.draw?.dpi != null) out.push({ id: it.id, dpi: it.draw.dpi, lowDpi: it.draw.lowDpi });
  return out;
}
