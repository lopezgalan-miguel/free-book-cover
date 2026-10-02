import type { Project } from "../schema/project.js";

// Catálogo de fuentes del mockup (SDD §7.4). "system" no necesita carga.
export type FontGroupId = "serif" | "sans" | "display" | "system";
export interface FontGroup {
  id: FontGroupId;
  names: readonly string[];
}
export const FONT_CATALOG: readonly FontGroup[] = [
  { id: "serif", names: ["Playfair Display", "Cormorant Garamond", "EB Garamond", "Libre Baskerville", "Lora", "Spectral", "Marcellus"] },
  { id: "sans", names: ["Montserrat", "Josefin Sans", "Archivo"] },
  { id: "display", names: ["Bebas Neue", "Oswald", "Cinzel"] },
  { id: "system", names: ["Georgia", "Times New Roman", "Arial", "Helvetica", "Verdana"] },
];

const SERIF = new Set(["Playfair Display", "Cormorant Garamond", "EB Garamond", "Libre Baskerville", "Lora", "Spectral", "Marcellus", "Cinzel", "Georgia", "Times New Roman"]);

export function catalogGroup(family: string): FontGroupId | null {
  return FONT_CATALOG.find((g) => g.names.includes(family))?.id ?? null;
}

// Pila CSS con genérica de reserva (misma regla que el mockup).
export function fontStack(family: string): string {
  const q = `"${family.replaceAll('"', "")}"`;
  if (SERIF.has(family)) return `${q}, serif`;
  if (family === "Courier New") return `${q}, monospace`;
  return `${q}, sans-serif`;
}

export function fontCss(f: { family: string; weight: number; italic: boolean; px: number }): string {
  return `${f.italic ? "italic " : ""}${f.weight} ${f.px}px ${fontStack(f.family)}`;
}

// Formatos de fuente admitidos para subir (SDD R-04), detectados por la firma del archivo.
export type FontFormat = "ttf" | "otf" | "woff2";
export const FONT_EXTENSIONS = [".ttf", ".otf", ".woff2"] as const;

export function detectFontFormat(bytes: Uint8Array): FontFormat | null {
  if (bytes.length < 4) return null;
  const tag = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (tag === "wOF2") return "woff2";
  if (tag === "OTTO") return "otf";
  if (tag === "true" || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) return "ttf";
  return null;
}

export const FONT_MIME: Record<FontFormat, string> = { ttf: "font/ttf", otf: "font/otf", woff2: "font/woff2" };

// Nombre de familia a partir del nombre del archivo, sin extensión ni caracteres problemáticos.
export function familyFromFileName(name: string): string {
  const base = name.replace(/\.[^.]*$/, "").replace(/[^\p{L}\p{N} _-]+/gu, " ").replace(/\s+/g, " ").trim();
  return base || "Fuente";
}

export type FontState = "loaded" | "loading" | "failed";
export type FontProblemReason = "failed" | "loading" | "not_loaded" | "missing";
export interface FontProblem {
  family: string;
  reason: FontProblemReason;
  elementIds: string[];
}
export type FontsReport = { ok: true } | { ok: false; problems: FontProblem[] };

// Familias realmente pintadas: elementos visibles y fragmentos con texto.
export function usedFamilies(doc: Project): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const e of doc.elements) {
    if (e.type !== "text" || !e.visible) continue;
    for (const r of e.runs) {
      if (r.text === "") continue;
      const ids = out.get(r.fontFamily) ?? [];
      if (!ids.includes(e.id)) ids.push(e.id);
      out.set(r.fontFamily, ids);
    }
  }
  return out;
}

export function documentFontFamilies(doc: Project): Set<string> {
  const s = new Set<string>();
  for (const a of doc.assets) if (a.kind === "font" && typeof a.metadata.family === "string") s.add(a.metadata.family);
  return s;
}

// La exportación (pasos 5 y 7) la invoca antes de rasterizar: una fuente que no esté
// cargada no se sustituye en silencio, se informa. `stateOf` lo da el registro de fuentes del editor.
export function checkFontsReady(doc: Project, stateOf: (family: string) => FontState | undefined): FontsReport {
  const own = documentFontFamilies(doc);
  const problems: FontProblem[] = [];
  for (const [family, elementIds] of usedFamilies(doc)) {
    if (catalogGroup(family) === "system") continue;
    if (!own.has(family) && catalogGroup(family) === null) {
      problems.push({ family, reason: "missing", elementIds });
      continue;
    }
    const s = stateOf(family);
    if (s === "loaded") continue;
    problems.push({ family, reason: s === undefined ? "not_loaded" : s, elementIds });
  }
  return problems.length ? { ok: false, problems } : { ok: true };
}
