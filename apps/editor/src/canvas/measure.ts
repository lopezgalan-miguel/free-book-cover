import { fitTextBox, layoutText, type TextElement, type TextMeasure } from "@free-book-cover/core";

// Medidor de texto con canvas 2D; null sin DOM (pruebas Node/jsdom).
let cached: TextMeasure | null | undefined;
export function browserMeasure(): TextMeasure | null {
  if (cached !== undefined) return cached;
  try {
    const ctx = typeof document === "undefined" || typeof CanvasRenderingContext2D === "undefined" ? null : document.createElement("canvas").getContext("2d");
    if (!ctx) return (cached = null);
    // El espaciado lo suma la maquetación: aquí se mide sin él.
    if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = "0px";
    cached = (text, css) => {
      ctx.font = css;
      return ctx.measureText(text).width;
    };
  } catch {
    cached = null;
  }
  return cached;
}

// Alto del bloque en pulgadas para que la caja envuelva el texto (se maqueta a 300 ppp).
export function textHeightIn(el: TextElement, measure: TextMeasure): number {
  return layoutText(el, 300, measure).heightPx / 300;
}

// Caja de un texto de variante tras cambiar su escala de letra de `prev` a `next`: ancho al menos el de la
// palabra más larga escalada (con el borde de la alineación quieto) y alto del contenido.
export function fitScaledText(el: TextElement, next: number, prev: number, measure: TextMeasure): { x?: number; width?: number; height: number } {
  const scaled: TextElement = { ...el, runs: el.runs.map((r) => ({ ...r, fontSizePt: (r.fontSizePt * next) / prev })) };
  return fitTextBox(scaled, measure) ?? { height: textHeightIn(scaled, measure) };
}
