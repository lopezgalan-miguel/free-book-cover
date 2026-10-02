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

// Caras realmente publicadas (peso + cursiva) de cada familia, las mismas que pide el editor al cargar el
// catálogo. Si el diseño pide otra, el navegador sintetizaría negrita/cursiva o elegiría la más próxima:
// por eso la exportación la trata como problema en vez de darla por cargada (SDD R-04).
export interface FontFaceSpec {
  weight: number;
  italic: boolean;
}
const faces = (normal: readonly number[], italic: readonly number[] = []): readonly FontFaceSpec[] => [
  ...normal.map((weight) => ({ weight, italic: false })),
  ...italic.map((weight) => ({ weight, italic: true })),
];
const SYSTEM_FACES = faces([400, 700], [400, 700]);
export const CATALOG_FACES: Readonly<Record<string, readonly FontFaceSpec[]>> = {
  "Playfair Display": faces([400, 600, 700, 800], [400, 600]),
  "Cormorant Garamond": faces([400, 500, 600, 700], [400, 600]),
  "EB Garamond": faces([400, 500, 600, 700], [400]),
  "Libre Baskerville": faces([400, 700], [400]),
  Lora: faces([400, 500, 600, 700], [400]),
  Spectral: faces([400, 500, 600, 700], [400]),
  Marcellus: faces([400]),
  Montserrat: faces([400, 500, 600, 700, 800], [400]),
  "Josefin Sans": faces([400, 600, 700], [400]),
  Archivo: faces([400, 600, 700, 800], [400]),
  "Bebas Neue": faces([400]),
  Oswald: faces([300, 400, 500, 600, 700]),
  Cinzel: faces([400, 600, 700, 800]),
};
// Una fuente subida es un único archivo registrado con rango de pesos 100-900 y estilo normal.
const UPLOAD_FACES = faces([400]);

// Caras disponibles de una familia; null si no se conocen (familia ajena al proyecto).
export function availableFaces(family: string, uploaded: ReadonlySet<string> = new Set()): readonly FontFaceSpec[] | null {
  if (uploaded.has(family)) return UPLOAD_FACES;
  if (catalogGroup(family) === "system") return SYSTEM_FACES;
  return CATALOG_FACES[family] ?? null;
}

export function hasFace(family: string, weight: number, italic: boolean, uploaded: ReadonlySet<string> = new Set()): boolean {
  const f = availableFaces(family, uploaded);
  if (!f) return false;
  // El archivo subido cubre cualquier peso, pero no tiene cursiva.
  if (uploaded.has(family)) return !italic;
  return f.some((x) => x.weight === weight && x.italic === italic);
}

export function availableWeights(family: string, italic: boolean, uploaded: ReadonlySet<string> = new Set()): number[] {
  return (availableFaces(family, uploaded) ?? []).filter((f) => f.italic === italic).map((f) => f.weight);
}

// Cara disponible más próxima en peso; con preferencia por mantener la cursiva pedida y, si no existe, sin ella.
export function nearestFace(family: string, weight: number, italic: boolean, uploaded: ReadonlySet<string> = new Set()): FontFaceSpec | null {
  for (const it of italic ? [true, false] : [false]) {
    const ws = availableWeights(family, it, uploaded);
    if (ws.length) return { italic: it, weight: ws.reduce((b, w) => (Math.abs(w - weight) < Math.abs(b - weight) ? w : b)) };
  }
  return null;
}

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
// face_missing: la familia carga, pero no tiene el peso o la cursiva que pide el diseño.
export type FontProblemReason = "failed" | "loading" | "not_loaded" | "missing" | "face_missing";
export interface FontProblem {
  family: string;
  reason: FontProblemReason;
  elementIds: string[];
  // Solo con face_missing: las caras pedidas que no existen.
  faces?: FontFaceSpec[];
}
export type FontsReport = { ok: true } | { ok: false; problems: FontProblem[] };

// Caras (peso, cursiva) pedidas por familia en fragmentos con texto de elementos visibles.
export function usedFaces(doc: Project): Map<string, FontFaceSpec[]> {
  const out = new Map<string, FontFaceSpec[]>();
  for (const e of doc.elements) {
    if (e.type !== "text" || !e.visible) continue;
    for (const r of e.runs) {
      if (r.text === "") continue;
      const list = out.get(r.fontFamily) ?? [];
      if (!list.some((f) => f.weight === r.weight && f.italic === r.italic)) list.push({ weight: r.weight, italic: r.italic });
      out.set(r.fontFamily, list);
    }
  }
  return out;
}

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
  const used = usedFaces(doc);
  const faceProblem = (family: string, elementIds: string[]): FontProblem | null => {
    const absent = (used.get(family) ?? []).filter((f) => !hasFace(family, f.weight, f.italic, own));
    return absent.length ? { family, reason: "face_missing", elementIds, faces: absent } : null;
  };
  for (const [family, elementIds] of usedFamilies(doc)) {
    if (catalogGroup(family) === "system") {
      const fp = faceProblem(family, elementIds);
      if (fp) problems.push(fp);
      continue;
    }
    if (!own.has(family) && catalogGroup(family) === null) {
      problems.push({ family, reason: "missing", elementIds });
      continue;
    }
    const s = stateOf(family);
    if (s === "failed" || s === "loading") {
      problems.push({ family, reason: s, elementIds });
      continue;
    }
    // Una cara que no existe nunca se pidió al navegador, así que su estado puede faltar: se informa la cara.
    const fp = faceProblem(family, elementIds);
    if (fp) problems.push(fp);
    else if (s === undefined) problems.push({ family, reason: "not_loaded", elementIds });
  }
  return problems.length ? { ok: false, problems } : { ok: true };
}
