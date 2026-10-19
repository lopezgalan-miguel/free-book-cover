import type { TextMask } from "@free-book-cover/core";
import { context2d, makeCanvas, type AnyCanvas } from "./layer";

type Mode = TextMask["mode"];

const smoothstep = (e0: number, e1: number, x: number): number => {
  if (e1 <= e0) return x >= e0 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// Convierte los píxeles RGBA de una imagen en máscara: el alfa resultante es cuánto se conserva de la letra.
// dark borra lo más oscuro que el umbral (luminancia Rec. 709), light lo más claro y alpha lo más transparente;
// softness es el ancho de la rampa (0 = corte seco). Modifica `data` en el sitio.
export function maskAlpha(data: Uint8ClampedArray, mode: Mode, threshold: number, softness: number): void {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]! / 255;
    let keep: number;
    if (mode === "alpha") keep = smoothstep(threshold, threshold + softness, a);
    else {
      const lum = (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255;
      keep = (mode === "dark" ? smoothstep(threshold, threshold + softness, lum) : 1 - smoothstep(threshold - softness, threshold, lum)) * a;
    }
    data[i] = data[i + 1] = data[i + 2] = 0;
    data[i + 3] = Math.round(keep * 255);
  }
}

const cache = new WeakMap<object, Map<string, AnyCanvas>>();

const sizeOf = (src: CanvasImageSource): { w: number; h: number } => {
  const s = src as { naturalWidth?: number; naturalHeight?: number; width: number; height: number };
  return { w: s.naturalWidth || s.width, h: s.naturalHeight || s.height };
};

// Máscara de una imagen ya decodificada (miniatura o original), con caché por imagen y parámetros:
// la vista previa repinta en cada fotograma y no debe recalcular los píxeles.
export function maskImage(src: CanvasImageSource, mode: Mode, threshold: number, softness: number): AnyCanvas {
  const key = `${mode}|${threshold}|${softness}`;
  const perImage = cache.get(src as object) ?? new Map<string, AnyCanvas>();
  cache.set(src as object, perImage);
  const hit = perImage.get(key);
  if (hit) return hit;
  const { w, h } = sizeOf(src);
  const canvas = makeCanvas(Math.max(1, w), Math.max(1, h));
  const c = context2d(canvas);
  c.drawImage(src, 0, 0);
  const img = c.getImageData(0, 0, canvas.width, canvas.height);
  maskAlpha(img.data, mode, threshold, softness);
  c.putImageData(img, 0, 0);
  perImage.set(key, canvas);
  return canvas;
}
