import type { TextElement } from "../schema/project.js";
import { fontCss } from "./fonts.js";

// Anchura del texto con la fuente CSS dada, SIN espaciado entre letras (lo suma la maquetación).
// En el navegador es measureText; en pruebas, una función determinista.
export type TextMeasure = (text: string, cssFont: string) => number;

export interface PieceStyle {
  font: string;
  fontPx: number;
  color: string;
  underline: boolean;
  spacingPx: number;
}
export interface LayoutPiece {
  text: string;
  x: number; // px desde el borde izquierdo de la caja
  width: number;
  style: PieceStyle;
}
export interface LayoutLine {
  top: number;
  height: number;
  baseline: number;
  width: number;
  pieces: LayoutPiece[];
}
// Letra colocada sobre el arco: (x, y) es el punto de la línea base bajo su centro.
export interface LayoutGlyph {
  text: string;
  x: number;
  y: number;
  rotation: number; // radianes
  advance: number;
  style: PieceStyle;
}
export interface TextLayout {
  heightPx: number;
  lines: LayoutLine[];
  // Solo con curvatura distinta de 0; en ese caso se pinta esto y no las líneas.
  glyphs: LayoutGlyph[] | null;
}

export interface TextEffects {
  shadow: { dx: number; dy: number; blur: number; color: string } | null;
  outline: { width: number; color: string } | null;
}

const ASCENT = 0.8;
const px = (pt: number, ppi: number) => (pt / 72) * ppi;

// Cuerpo de referencia del bloque: el mayor de sus fragmentos con texto.
export function baseFontPx(el: TextElement, ppi: number): number {
  const sizes = el.runs.filter((r) => r.text !== "").map((r) => px(r.fontSizePt, ppi));
  return sizes.length ? Math.max(...sizes) : px(el.runs[0]?.fontSizePt ?? 12, ppi);
}

// Sombra e contorno en px, proporcionales al cuerpo (fórmulas del mockup).
export function textEffects(el: TextElement, ppi: number): TextEffects {
  const base = baseFontPx(el, ppi);
  return {
    shadow: el.shadow.on ? { dx: 0, dy: base * 0.05, blur: base * 0.08 * (el.shadow.intensity / 50), color: "rgba(0,0,0,0.6)" } : null,
    outline: el.outline.on && el.outline.width > 0 ? { width: (base * el.outline.width) / 120, color: el.outline.color } : null,
  };
}

interface Piece {
  text: string;
  style: PieceStyle;
  width: number;
}
interface Token {
  kind: "word" | "space" | "newline";
  pieces: Piece[];
  width: number;
}

function tokenize(el: TextElement, ppi: number, measure: TextMeasure): Token[] {
  const tokens: Token[] = [];
  for (const run of el.runs) {
    const fontPx = px(run.fontSizePt, ppi);
    const style: PieceStyle = {
      font: fontCss({ family: run.fontFamily, weight: run.weight, italic: run.italic, px: fontPx }),
      fontPx, color: run.color, underline: run.underline, spacingPx: el.letterSpacing * fontPx,
    };
    const text = run.uppercase ? run.text.toUpperCase() : run.text;
    const mk = (t: string): Piece => ({ text: t, style, width: t === "" ? 0 : measure(t, style.font) + t.length * style.spacingPx });
    for (const m of text.matchAll(/(\n)|([^\S\n]+)|([^\s]+)/g)) {
      const piece = mk(m[0]);
      const kind: Token["kind"] = m[1] ? "newline" : m[2] ? "space" : "word";
      const last = tokens[tokens.length - 1];
      if (kind === "word" && last?.kind === "word") {
        last.pieces.push(piece);
        last.width += piece.width;
      } else tokens.push({ kind, pieces: [kind === "newline" ? { ...piece, width: 0 } : piece], width: kind === "newline" ? 0 : piece.width });
    }
  }
  return tokens;
}

// Parte una palabra más ancha que la caja en trozos que quepan.
function splitWord(tok: Token, max: number, measure: TextMeasure): Token[] {
  const out: Token[] = [];
  let cur: Token = { kind: "word", pieces: [], width: 0 };
  for (const p of tok.pieces) {
    let buf = "";
    const flush = () => {
      if (buf) {
        const w = measure(buf, p.style.font) + buf.length * p.style.spacingPx;
        cur.pieces.push({ text: buf, style: p.style, width: w });
        cur.width += w;
        buf = "";
      }
    };
    for (const ch of p.text) {
      const w = measure(buf + ch, p.style.font) + (buf.length + 1) * p.style.spacingPx;
      if (cur.width + w > max && (buf || cur.pieces.length)) {
        flush();
        out.push(cur);
        cur = { kind: "word", pieces: [], width: 0 };
      }
      buf += ch;
    }
    flush();
  }
  if (cur.pieces.length) out.push(cur);
  return out;
}

interface RawLine {
  tokens: Token[];
  endsParagraph: boolean;
}

function breakLines(tokens: Token[], maxWidth: number, measure: TextMeasure): RawLine[] {
  const lines: RawLine[] = [];
  let cur: Token[] = [];
  let width = 0;
  const push = (endsParagraph: boolean) => {
    while (cur.length && cur[cur.length - 1]!.kind === "space") cur.pop();
    lines.push({ tokens: cur, endsParagraph });
    cur = [];
    width = 0;
  };
  for (const tok of tokens) {
    if (tok.kind === "newline") {
      cur.push(tok);
      push(true);
      continue;
    }
    if (tok.kind === "space") {
      if (cur.length) {
        cur.push(tok);
        width += tok.width;
      }
      continue;
    }
    const parts = tok.width > maxWidth ? splitWord(tok, maxWidth, measure) : [tok];
    for (const part of parts) {
      if (width + part.width > maxWidth && cur.some((t) => t.kind === "word")) push(false);
      cur.push(part);
      width += part.width;
    }
  }
  if (cur.length || lines.length === 0) push(true);
  return lines;
}

// Maquetación pura: envuelve el texto al ancho de la caja y coloca los fragmentos. Con curvatura
// además reparte las letras sobre un arco. Todas las medidas son px a la escala `ppi`.
export function layoutText(el: TextElement, ppi: number, measure: TextMeasure): TextLayout {
  const boxW = Math.max(1, el.width * ppi);
  const fallbackPx = px(el.runs[0]?.fontSizePt ?? 12, ppi);
  const curved = el.curvature !== 0;
  const raw = breakLines(tokenize(el, ppi, measure), curved ? Infinity : boxW, measure);
  const lines: LayoutLine[] = [];
  let top = 0;
  for (const rl of raw) {
    const pieces = rl.tokens.flatMap((t) => t.pieces);
    const natural = rl.tokens.reduce((n, t) => n + t.width, 0);
    const size = Math.max(0, ...pieces.map((p) => p.style.fontPx)) || fallbackPx;
    const height = size * el.lineHeight;
    let offset = 0;
    let gap = 0;
    if (!curved) {
      if (el.align === "center") offset = (boxW - natural) / 2;
      else if (el.align === "right") offset = boxW - natural;
      else if (el.align === "justify" && !rl.endsParagraph) {
        const spaces = rl.tokens.filter((t) => t.kind === "space").length;
        if (spaces > 0 && natural < boxW) gap = (boxW - natural) / spaces;
      }
    }
    let x = offset;
    const placed: LayoutPiece[] = [];
    for (const t of rl.tokens) {
      if (t.kind === "newline") continue;
      for (const p of t.pieces) {
        placed.push({ text: p.text, x, width: p.width, style: p.style });
        x += p.width;
      }
      if (t.kind === "space") x += gap;
    }
    lines.push({ top, height, baseline: top + (height - size) / 2 + size * ASCENT, width: natural + gap * rl.tokens.filter((t) => t.kind === "space").length, pieces: placed });
    top += height;
  }
  return { heightPx: top, lines, glyphs: curved ? curveGlyphs(lines, el.curvature, boxW, measure) : null };
}

// Arco de circunferencia: la línea más larga barre |curvatura|/100 · 180° y todas las líneas
// comparten centro (las inferiores quedan más cerca de él en arco hacia arriba, más lejos hacia abajo).
function curveGlyphs(lines: LayoutLine[], curvature: number, boxW: number, measure: TextMeasure): LayoutGlyph[] {
  const longest = Math.max(1, ...lines.map((l) => l.width));
  const sweep = (Math.abs(curvature) / 100) * Math.PI;
  const radius = longest / sweep;
  const up = curvature > 0;
  const y0 = lines[0]?.baseline ?? 0;
  const cx = boxW / 2;
  const cy = up ? y0 + radius : y0 - radius;
  const out: LayoutGlyph[] = [];
  for (const line of lines) {
    const r = Math.max(1, up ? radius - (line.baseline - y0) : radius + (line.baseline - y0));
    for (const piece of line.pieces) {
      const chars = [...piece.text];
      let done = "";
      for (const ch of chars) {
        const before = done.length ? measure(done, piece.style.font) + done.length * piece.style.spacingPx : 0;
        done += ch;
        const after = measure(done, piece.style.font) + done.length * piece.style.spacingPx;
        const advance = after - before;
        // Posición del centro de la letra a lo largo de la línea, respecto al centro de la línea.
        const t = piece.x + before + advance / 2 - line.width / 2;
        const phi = t / r;
        if (up) out.push({ text: ch, x: cx + r * Math.sin(phi), y: cy - r * Math.cos(phi), rotation: phi, advance, style: piece.style });
        else out.push({ text: ch, x: cx + r * Math.sin(phi), y: cy + r * Math.cos(phi), rotation: -phi, advance, style: piece.style });
      }
    }
  }
  return out;
}
