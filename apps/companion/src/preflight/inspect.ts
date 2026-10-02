import { bins, run } from "./exec.js";
import { POINTS_PER_INCH, MIN_PPI } from "./toCmykPdf.js";

export interface PdfImageInfo {
  page: number;
  type: string;
  width: number;
  height: number;
  color: string;
  encoding: string;
  ppiX: number;
  ppiY: number;
}

export interface PdfFontInfo {
  name: string;
  embedded: boolean;
}

export interface PdfInspection {
  pageCount: number;
  pageSizePt: { width: number; height: number };
  encrypted: boolean;
  images: PdfImageInfo[];
  fonts: PdfFontInfo[];
  transparency: string[];
  structureOk: boolean;
  fileSizeBytes: number;
}

/** Lectura independiente del PDF con Poppler y qpdf; no reutiliza nada del generador. */
export async function inspectPdf(path: string): Promise<PdfInspection> {
  const info = await run(bins.pdfinfo, [path]);
  const field = (name: string) => info.match(new RegExp(`^${name}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? "";
  const size = field("Page size").match(/([\d.]+) x ([\d.]+) pts/);

  return {
    pageCount: Number(field("Pages")),
    pageSizePt: { width: Number(size?.[1]), height: Number(size?.[2]) },
    encrypted: field("Encrypted").startsWith("yes"),
    fileSizeBytes: Number(field("File size").split(" ")[0]),
    images: parseImages(await run(bins.pdfimages, ["-list", path])),
    fonts: parseFonts(await run(bins.pdffonts, [path])),
    transparency: await findTransparency(path),
    structureOk: await run(bins.qpdf, ["--check", path]).then(() => true, () => false),
  };
}

function dataRows(table: string): string[][] {
  // Las dos primeras líneas son cabecera y separador.
  return table.trim().split("\n").slice(2).filter(Boolean).map((l) => l.trim().split(/\s+/));
}

function parseImages(table: string): PdfImageInfo[] {
  // page num type width height color comp bpc enc interp object ID x-ppi y-ppi size ratio
  return dataRows(table).map((c) => ({
    page: Number(c[0]),
    type: c[2]!,
    width: Number(c[3]),
    height: Number(c[4]),
    color: c[5]!,
    encoding: c[8]!,
    ppiX: Number(c[12]),
    ppiY: Number(c[13]),
  }));
}

function parseFonts(table: string): PdfFontInfo[] {
  // name type encoding emb sub uni object ID — el tipo puede contener espacios,
  // así que se lee desde el final de la fila.
  return dataRows(table).map((c) => ({ name: c[0]!, embedded: c[c.length - 5] === "yes" }));
}

async function findTransparency(path: string): Promise<string[]> {
  const json = JSON.parse(await run(bins.qpdf, ["--json=2", "--json-key=qpdf", path])) as {
    qpdf: [unknown, Record<string, unknown>];
  };
  const found: string[] = [];
  const walk = (node: unknown, where: string) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, where));
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (k === "/SMask" && v !== "/None") found.push(`${where}: /SMask`);
      if (k === "/S" && v === "/Transparency") found.push(`${where}: grupo de transparencia`);
      if ((k === "/CA" || k === "/ca") && typeof v === "number" && v < 1) found.push(`${where}: ${k} ${v}`);
      if (k === "/BM" && v !== "/Normal" && v !== "/Compatible") found.push(`${where}: /BM ${String(v)}`);
      walk(v, where);
    }
  };
  for (const [id, obj] of Object.entries(json.qpdf[1])) walk(obj, id);
  return found;
}

export interface Expectation {
  widthIn: number;
  heightIn: number;
  tolerancePt?: number;
}

/** Comprobaciones de preimpresión KDP sobre la inspección. Lista vacía = superado. */
export function evaluate(r: PdfInspection, e: Expectation): string[] {
  const tol = e.tolerancePt ?? 0.01;
  const issues: string[] = [];
  const w = e.widthIn * POINTS_PER_INCH;
  const h = e.heightIn * POINTS_PER_INCH;
  if (r.pageCount !== 1) issues.push(`Páginas: ${r.pageCount} (se espera 1)`);
  if (Math.abs(r.pageSizePt.width - w) > tol || Math.abs(r.pageSizePt.height - h) > tol) {
    issues.push(`Tamaño ${r.pageSizePt.width} × ${r.pageSizePt.height} pt (se espera ${w} × ${h})`);
  }
  if (r.encrypted) issues.push("PDF cifrado");
  if (!r.structureOk) issues.push("qpdf --check detecta errores de estructura");
  if (r.images.length === 0) issues.push("No hay imágenes");
  for (const img of r.images) {
    if (img.type !== "image") issues.push(`Imagen de tipo ${img.type}`);
    if (img.color !== "cmyk") issues.push(`Imagen en espacio ${img.color} (se espera cmyk)`);
    if (Math.min(img.ppiX, img.ppiY) < MIN_PPI) issues.push(`Imagen a ${img.ppiX}×${img.ppiY} ppp`);
  }
  for (const f of r.fonts) if (!f.embedded) issues.push(`Fuente no incrustada: ${f.name}`);
  issues.push(...r.transparency.map((t) => `Transparencia: ${t}`));
  return issues;
}
