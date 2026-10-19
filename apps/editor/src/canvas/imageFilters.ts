import type { ImageFilters } from "@free-book-cover/core";
import { context2d, makeCanvas, type AnyCanvas, type Ctx2D } from "./layer";

// Radio del desenfoque en px: blur/100 · 5 % del lado mayor de lo pintado (en px de dispositivo), así la
// misma imagen se ve igual de desenfocada en la vista, en la exportación y en cualquier variante.
export function blurRadiusPx(f: ImageFilters, w: number, h: number): number {
  return ((f.blur ?? 0) / 100) * 0.05 * Math.max(w, h);
}

// Cadena para ctx.filter, en el orden desenfoque, brillo, saturación; "none" si nada cambia.
export function filterCss(f: ImageFilters, blurPx: number): string {
  const parts: string[] = [];
  if (blurPx > 0) parts.push(`blur(${blurPx}px)`);
  if (f.brightness !== undefined && f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.saturation !== undefined && f.saturation !== 100) parts.push(`saturate(${f.saturation}%)`);
  return parts.length ? parts.join(" ") : "none";
}

// Anchos de tres desenfoques de caja que aproximan una gaussiana de desviación sigma.
function boxesForGauss(sigma: number): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / 3 + 1);
  let wl = Math.floor(ideal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4));
  return [0, 1, 2].map((i) => (i < m ? wl : wu));
}

// Desenfoque de caja separable (horizontal y vertical), con los bordes repetidos.
function boxBlur(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const tmp = new Float32Array(src.length);
  const pass = (from: Float32Array, to: Float32Array, len: number, lines: number, at: (line: number, i: number) => number) => {
    const n = 2 * r + 1;
    for (let line = 0; line < lines; line++) {
      for (let c = 0; c < 4; c++) {
        const get = (i: number) => from[at(line, Math.min(len - 1, Math.max(0, i))) * 4 + c]!;
        let acc = 0;
        for (let i = -r; i <= r; i++) acc += get(i);
        for (let i = 0; i < len; i++) {
          to[at(line, i) * 4 + c] = acc / n;
          acc += get(i + r + 1) - get(i - r);
        }
      }
    }
  };
  pass(src, tmp, w, h, (y, x) => y * w + x);
  pass(tmp, dst, h, w, (x, y) => y * w + x);
}

// Alternativa por píxeles para navegadores sin ctx.filter: desenfoque (tres cajas) y después brillo y
// saturación con la misma matriz que el filtro CSS. Modifica `data` en el sitio.
export function applyPixelFilters(data: Uint8ClampedArray, w: number, h: number, f: ImageFilters, blurPx: number): void {
  if (blurPx > 0) {
    let a = Float32Array.from(data);
    let b = new Float32Array(data.length);
    for (const size of boxesForGauss(blurPx)) {
      boxBlur(a, b, w, h, (size - 1) / 2);
      [a, b] = [b, a];
    }
    for (let i = 0; i < data.length; i++) data[i] = a[i]!;
  }
  const k = (f.brightness ?? 100) / 100;
  const s = (f.saturation ?? 100) / 100;
  if (k === 1 && s === 1) return;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]! * k;
    const g = data[i + 1]! * k;
    const bl = data[i + 2]! * k;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    data[i] = lum + (r - lum) * s;
    data[i + 1] = lum + (g - lum) * s;
    data[i + 2] = lum + (bl - lum) * s;
  }
}

let ctxFilter: boolean | null = null;
// ¿Admite el contexto 2D la propiedad filter? (Se comprueba una vez: se asigna y se relee.)
function supportsCtxFilter(): boolean {
  if (ctxFilter === null) {
    const c = context2d(makeCanvas(1, 1)) as Ctx2D & { filter?: string };
    c.filter = "blur(1px)";
    ctxFilter = c.filter === "blur(1px)";
  }
  return ctxFilter;
}

const cache = new WeakMap<object, { key: string; canvas: AnyCanvas; pad: number }>();

// Dibuja la región (sx, sy, sw, sh) de la imagen en (dx, dy, dw, dh) con filtros. Se pinta en una capa del
// tamaño del destino en px de dispositivo, con un margen en el que se repiten los bordes: así el
// desenfoque no mete transparencia ni oscurece el borde. El resultado se guarda por imagen y parámetros
// para no recalcularlo en cada fotograma de la vista previa.
export function drawFilteredImage(
  ctx: Ctx2D, image: CanvasImageSource,
  sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number,
  f: ImageFilters,
): void {
  const m = ctx.getTransform();
  const tw = Math.max(1, Math.round(dw * Math.hypot(m.a, m.b)));
  const th = Math.max(1, Math.round(dh * Math.hypot(m.c, m.d)));
  const r = blurRadiusPx(f, tw, th);
  const key = [sx, sy, sw, sh, tw, th, f.blur ?? 0, f.brightness ?? 100, f.saturation ?? 100].join("|");
  let hit = cache.get(image as object);
  if (!hit || hit.key !== key) {
    const pad = Math.ceil(3 * r);
    const W = tw + 2 * pad;
    const H = th + 2 * pad;
    const base = makeCanvas(W, H);
    const bc = context2d(base);
    bc.drawImage(image, sx, sy, sw, sh, pad, pad, tw, th);
    if (pad > 0) {
      // Bordes repetidos: columnas y filas de 1 px estiradas hasta el margen (las esquinas salen de las filas).
      bc.drawImage(base as CanvasImageSource, pad, pad, 1, th, 0, pad, pad, th);
      bc.drawImage(base as CanvasImageSource, pad + tw - 1, pad, 1, th, pad + tw, pad, pad, th);
      bc.drawImage(base as CanvasImageSource, 0, pad, W, 1, 0, 0, W, pad);
      bc.drawImage(base as CanvasImageSource, 0, pad + th - 1, W, 1, 0, pad + th, W, pad);
    }
    const out = makeCanvas(W, H);
    const oc = context2d(out) as Ctx2D & { filter?: string };
    if (supportsCtxFilter()) {
      oc.filter = filterCss(f, r);
      oc.drawImage(base as CanvasImageSource, 0, 0);
    } else {
      const px = bc.getImageData(0, 0, W, H);
      applyPixelFilters(px.data, W, H, f, r);
      oc.putImageData(px, 0, 0);
    }
    hit = { key, canvas: out, pad };
    cache.set(image as object, hit);
  }
  ctx.drawImage(hit.canvas as CanvasImageSource, hit.pad, hit.pad, tw, th, dx, dy, dw, dh);
}
