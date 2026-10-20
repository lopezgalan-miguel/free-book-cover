import type { Rect, ShadowPx } from "@free-book-cover/core";

export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
export type Ctx2D = CanvasRenderingContext2D;

// Lienzo auxiliar: OffscreenCanvas donde exista (también en el Worker del PDF); si no, uno del documento.
export function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export const context2d = (c: AnyCanvas): Ctx2D => c.getContext("2d") as unknown as Ctx2D;

// Escala de la transformación actual (px de dispositivo por unidad local). Sombras y filtros del canvas
// no siguen la transformación, así que se multiplican por esto para coincidir entre vista y exportación.
export function deviceScale(ctx: Ctx2D): number {
  const m = typeof ctx.getTransform === "function" ? ctx.getTransform() : undefined;
  return m && typeof m.a === "number" ? Math.hypot(m.a, m.b) || 1 : 1;
}

// ¿Se puede pintar en capa? Hace falta una transformación legible y un lienzo con tamaño.
export function layerSupported(ctx: Ctx2D): boolean {
  const m = typeof ctx.getTransform === "function" ? ctx.getTransform() : undefined;
  const c = ctx.canvas as { width?: unknown } | undefined;
  return !!m && typeof m.a === "number" && typeof c?.width === "number" && (typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined");
}

export interface Layer {
  canvas: AnyCanvas;
  ctx: Ctx2D;
  // Esquina de la capa en px de dispositivo del lienzo de destino.
  x: number;
  y: number;
  // Escala de dispositivo del destino (la misma que la de la capa).
  k: number;
}

// Abre una capa que cubre, en px de dispositivo, el rectángulo local `rect` ampliado `margin` unidades
// locales, recortada al lienzo de destino. La capa hereda la transformación de `ctx` (desplazada), así
// que se dibuja en ella con las mismas coordenadas. null si no queda nada visible.
export function openLayer(ctx: Ctx2D, rect: Rect, margin: number): Layer | null {
  const m = ctx.getTransform();
  const x0 = rect.x - margin;
  const y0 = rect.y - margin;
  const x1 = rect.x + rect.width + margin;
  const y1 = rect.y + rect.height + margin;
  const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => ({ x: m.a * x! + m.c * y! + m.e, y: m.b * x! + m.d * y! + m.f }));
  const W = (ctx.canvas as { width: number }).width;
  const H = (ctx.canvas as { height: number }).height;
  const left = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x))));
  const top = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y))));
  const right = Math.min(W, Math.ceil(Math.max(...pts.map((p) => p.x))));
  const bottom = Math.min(H, Math.ceil(Math.max(...pts.map((p) => p.y))));
  if (right <= left || bottom <= top) return null;
  const canvas = makeCanvas(right - left, bottom - top);
  const lc = context2d(canvas);
  lc.setTransform(m.a, m.b, m.c, m.d, m.e - left, m.f - top);
  return { canvas, ctx: lc, x: left, y: top, k: deviceScale(ctx) };
}

// Vuelca la capa en el destino con opacidad y, si se pide, sombra (ya en px de dispositivo).
export function compositeLayer(ctx: Ctx2D, layer: Layer, opts: { opacity?: number; shadow?: ShadowPx | null } = {}): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha *= opts.opacity ?? 1;
  if (opts.shadow) {
    ctx.shadowColor = opts.shadow.color;
    ctx.shadowBlur = opts.shadow.blur;
    ctx.shadowOffsetX = opts.shadow.dx;
    ctx.shadowOffsetY = opts.shadow.dy;
  }
  ctx.drawImage(layer.canvas as CanvasImageSource, layer.x, layer.y);
  ctx.restore();
}

export const scaleShadow = (s: ShadowPx, k: number): ShadowPx => ({ dx: s.dx * k, dy: s.dy * k, blur: s.blur * k, color: s.color, ...(s.spread ? { spread: s.spread * k } : {}) });
