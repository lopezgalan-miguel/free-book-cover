// Geometría pura de encuadre de imágenes. Una sola implementación para la
// vista previa y la exportación (SDD R-02: mismo encuadre en ambas).
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
export type FitMode = "cover" | "contain" | "fill";

// src: porción de la imagen original (px de origen); dest: dónde se pinta (coords de la caja).
export interface Placement {
  src: Rect;
  dest: Rect;
}

export const CENTER: Point = { x: 0.5, y: 0.5 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// region: zona de origen a mostrar (la imagen entera o su recorte).
// pos: 0 = pegado al inicio, 1 = al final (semántica de background-position).
export function placeImage(region: Rect, box: Rect, mode: FitMode, pos: Point = CENTER): Placement {
  if (!(region.width > 0 && region.height > 0)) throw new RangeError("la región de origen debe tener tamaño positivo");
  if (!(box.width > 0 && box.height > 0) || mode === "fill") return { src: { ...region }, dest: { ...box } };
  const px = clamp01(pos.x);
  const py = clamp01(pos.y);
  if (mode === "cover") {
    const scale = Math.max(box.width / region.width, box.height / region.height);
    const vw = box.width / scale;
    const vh = box.height / scale;
    return {
      src: { x: region.x + (region.width - vw) * px, y: region.y + (region.height - vh) * py, width: vw, height: vh },
      dest: { ...box },
    };
  }
  const scale = Math.min(box.width / region.width, box.height / region.height);
  const dw = region.width * scale;
  const dh = region.height * scale;
  return {
    src: { ...region },
    dest: { x: box.x + (box.width - dw) * px, y: box.y + (box.height - dh) * py, width: dw, height: dh },
  };
}

// Nueva posición tras arrastrar la imagen (dx, dy) píxeles de la caja; la imagen sigue al cursor.
export function panPosition(region: Rect, box: Rect, mode: FitMode, pos: Point, dx: number, dy: number): Point {
  if (mode === "fill" || !(box.width > 0 && box.height > 0) || !(region.width > 0 && region.height > 0)) return { ...pos };
  const scale = mode === "cover"
    ? Math.max(box.width / region.width, box.height / region.height)
    : Math.min(box.width / region.width, box.height / region.height);
  // Holgura firmada: >0 en cover (sobra imagen), <0 en contain (sobra caja).
  const slackX = region.width * scale - box.width;
  const slackY = region.height * scale - box.height;
  const move = (p: number, d: number, slack: number) =>
    Math.abs(slack) < 1e-9 ? p : clamp01(p - d / slack);
  return { x: move(pos.x, dx, slackX), y: move(pos.y, dy, slackY) };
}

export function rotatePoint(p: Point, pivot: Point, degrees: number): Point {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const x = p.x - pivot.x;
  const y = p.y - pivot.y;
  return { x: pivot.x + x * cos - y * sin, y: pivot.y + x * sin + y * cos };
}

export const rectCenter = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
