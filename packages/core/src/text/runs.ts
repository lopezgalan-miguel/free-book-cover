import type { TextRun } from "../schema/project.js";

export type RunStyle = Omit<TextRun, "text">;
export type RunStylePatch = Partial<RunStyle>;

const STYLE_KEYS = ["fontFamily", "fontSizePt", "weight", "italic", "underline", "uppercase", "color"] as const;

const styleOf = (r: TextRun): RunStyle => ({ fontFamily: r.fontFamily, fontSizePt: r.fontSizePt, weight: r.weight, italic: r.italic, underline: r.underline, uppercase: r.uppercase, color: r.color });
const sameStyle = (a: RunStyle, b: RunStyle) => STYLE_KEYS.every((k) => a[k] === b[k]);

export const runsToText = (runs: readonly TextRun[]): string => runs.map((r) => r.text).join("");

// Une fragmentos contiguos de igual estilo y descarta los vacíos (conserva uno si todo queda vacío).
export function normalizeRuns(runs: readonly TextRun[], fallback?: RunStyle): TextRun[] {
  const out: TextRun[] = [];
  for (const r of runs) {
    if (r.text === "") continue;
    const last = out[out.length - 1];
    if (last && sameStyle(styleOf(last), styleOf(r))) last.text += r.text;
    else out.push({ ...r });
  }
  if (out.length === 0) {
    const s = fallback ?? (runs[0] ? styleOf(runs[0]) : undefined);
    if (s) out.push({ ...s, text: "" });
  }
  return out;
}

// Parte los fragmentos en las posiciones [a, b) del texto; devuelve el trozo central y los lados.
function slice(runs: readonly TextRun[], a: number, b: number): { before: TextRun[]; mid: TextRun[]; after: TextRun[] } {
  const before: TextRun[] = [], mid: TextRun[] = [], after: TextRun[] = [];
  let pos = 0;
  for (const r of runs) {
    const start = pos, end = pos + r.text.length;
    pos = end;
    const piece = (from: number, to: number) => (to > from ? { ...r, text: r.text.slice(from - start, to - start) } : null);
    const p1 = piece(start, Math.min(end, a));
    const p2 = piece(Math.max(start, a), Math.min(end, b));
    const p3 = piece(Math.max(start, b), end);
    if (p1) before.push(p1);
    if (p2) mid.push(p2);
    if (p3) after.push(p3);
  }
  return { before, mid, after };
}

// Estilo del carácter en `index` (el último si se pasa del final).
export function styleAt(runs: readonly TextRun[], index: number): RunStyle | null {
  let pos = 0;
  for (const r of runs) {
    if (index < pos + r.text.length) return styleOf(r);
    pos += r.text.length;
  }
  const last = runs[runs.length - 1];
  return last ? styleOf(last) : null;
}

// Aplica un estilo a [start, end). Un rango vacío afecta a todo el bloque.
export function applyStyleToRange(runs: readonly TextRun[], start: number, end: number, patch: RunStylePatch): TextRun[] {
  const total = runsToText(runs).length;
  let a = Math.max(0, Math.min(start, end));
  let b = Math.min(total, Math.max(start, end));
  if (a === b) [a, b] = [0, total];
  if (total === 0) return runs.map((r) => ({ ...r, ...patch }));
  const { before, mid, after } = slice(runs, a, b);
  return normalizeRuns([...before, ...mid.map((r) => ({ ...r, ...patch })), ...after]);
}

// Estilo común de un rango (vacío = todo el texto); las propiedades mixtas salen como undefined.
export function rangeStyle(runs: readonly TextRun[], start: number, end: number): Partial<RunStyle> {
  const total = runsToText(runs).length;
  let a = Math.max(0, Math.min(start, end));
  let b = Math.min(total, Math.max(start, end));
  if (a === b) [a, b] = [0, total];
  const parts = total === 0 ? runs : slice(runs, a, b).mid;
  const first = parts[0];
  if (!first) return {};
  const out: Partial<RunStyle> = styleOf(first);
  for (const r of parts) for (const k of STYLE_KEYS) if (out[k] !== undefined && out[k] !== r[k]) delete out[k];
  return out;
}

// Sustituye el texto conservando los estilos: la parte común inicial y final no se toca y
// lo insertado hereda el estilo del carácter anterior (o del primero).
export function replaceText(runs: readonly TextRun[], next: string): TextRun[] {
  const old = runsToText(runs);
  if (old === next) return runs.map((r) => ({ ...r }));
  let p = 0;
  while (p < old.length && p < next.length && old[p] === next[p]) p++;
  let s = 0;
  while (s < old.length - p && s < next.length - p && old[old.length - 1 - s] === next[next.length - 1 - s]) s++;
  const inserted = next.slice(p, next.length - s);
  const style = (p > 0 ? styleAt(runs, p - 1) : styleAt(runs, 0)) ?? undefined;
  const { before, after } = slice(runs, p, old.length - s);
  const mid: TextRun[] = style && inserted ? [{ ...style, text: inserted }] : [];
  return normalizeRuns([...before, ...mid, ...after], style);
}
