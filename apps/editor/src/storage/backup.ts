import { checkAssetLimits, loadProject, serializeProject, type LimitError, type LoadError, type Project } from "@free-book-cover/core";
import type { StoredAsset } from "./projectStorage";

// Copia de seguridad en JSON, dividida en partes de tamaño acotado (SDD R-06).
// Parte 1: documento y lista de recursos. Partes 2..N: trozos de recursos en
// base64. Los trozos se leen de uno en uno, sin cargar los recursos enteros.
const FORMAT = "kdp-cover-backup";
const OVERHEAD = 200; // bytes aproximados de envoltorio por trozo
export const DEFAULT_MAX_PART_BYTES = 50 * 1024 * 1024;

interface ChunkRef {
  asset: StoredAsset;
  index: number;
  count: number;
}

export interface BackupPart {
  filename: string;
  blob: Blob;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const encodedSize = (rawBytes: number) => Math.ceil(rawBytes / 3) * 4 + OVERHEAD;

export async function createBackupParts(
  doc: Project,
  assets: StoredAsset[],
  maxPartBytes: number = DEFAULT_MAX_PART_BYTES,
): Promise<BackupPart[]> {
  // Tamaño de trozo múltiplo de 3 para que cada base64 se decodifique solo.
  const chunkBytes = Math.max(3, Math.floor(((maxPartBytes - 2 * OVERHEAD) * 3) / 4 / 3) * 3);
  const chunks: ChunkRef[] = [];
  for (const asset of assets) {
    const count = Math.max(1, Math.ceil(asset.blob.size / chunkBytes));
    for (let index = 0; index < count; index++) chunks.push({ asset, index, count });
  }
  const sizeOf = (c: ChunkRef) => encodedSize(Math.min(chunkBytes, Math.max(0, c.asset.blob.size - c.index * chunkBytes)));
  const groups: ChunkRef[][] = [];
  let cur: ChunkRef[] = [];
  let curSize = 0;
  for (const c of chunks) {
    const s = sizeOf(c);
    if (cur.length && curSize + s > maxPartBytes) {
      groups.push(cur);
      cur = [];
      curSize = 0;
    }
    cur.push(c);
    curSize += s;
  }
  if (cur.length) groups.push(cur);

  const total = 1 + groups.length;
  const slug = (doc.name || doc.id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "proyecto";
  const header = (part: number) => ({ format: FORMAT, version: 1, projectId: doc.id, part, parts: total });
  const parts: BackupPart[] = [];
  const manifest = {
    ...header(1),
    doc: JSON.parse(serializeProject(doc)),
    assets: assets.map((a) => ({ id: a.id, size: a.blob.size })),
    chunks: [],
  };
  parts.push({ filename: `${slug}-copia-1-de-${total}.json`, blob: new Blob([JSON.stringify(manifest)], { type: "application/json" }) });
  for (const [i, group] of groups.entries()) {
    const out: Array<{ assetId: string; index: number; count: number; data: string }> = [];
    for (const c of group) {
      const slice = c.asset.blob.slice(c.index * chunkBytes, (c.index + 1) * chunkBytes);
      out.push({ assetId: c.asset.id, index: c.index, count: c.count, data: bytesToBase64(new Uint8Array(await slice.arrayBuffer())) });
    }
    const n = i + 2;
    parts.push({ filename: `${slug}-copia-${n}-de-${total}.json`, blob: new Blob([JSON.stringify({ ...header(n), chunks: out })], { type: "application/json" }) });
  }
  return parts;
}

export type RestoreResult =
  | { ok: true; project: Project; assets: StoredAsset[] }
  | { ok: false; error: LoadError | { kind: "backup"; message: string } | { kind: "limit"; error: LimitError } };

const bad = (message: string): RestoreResult => ({ ok: false, error: { kind: "backup", message } });

interface ChunkIn {
  assetId: string;
  index: number;
  count: number;
  data: string;
}
interface PartIn {
  format: string;
  version: number;
  projectId: string;
  part: number;
  parts: number;
  doc?: unknown;
  assets?: Array<{ id: string; size: number }>;
  chunks: ChunkIn[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min;
// Máximo de trozos por recurso: acota el arreglo que se reserva a partir de un campo del archivo.
const MAX_CHUNKS = 1_000_000;

// Valida la forma de una parte sin confiar en el archivo: cualquier campo con tipo distinto se rechaza.
function asPart(v: unknown): PartIn | null {
  if (!isObj(v) || typeof v.format !== "string" || !isInt(v.version, 0) || typeof v.projectId !== "string") return null;
  if (!isInt(v.part, 1) || !isInt(v.parts, 1) || !Array.isArray(v.chunks)) return null;
  const chunks: ChunkIn[] = [];
  for (const c of v.chunks) {
    if (!isObj(c) || typeof c.assetId !== "string" || typeof c.data !== "string" || !isInt(c.index, 0) || !isInt(c.count, 1)) return null;
    if (c.count > MAX_CHUNKS || c.index >= c.count) return null;
    chunks.push({ assetId: c.assetId, index: c.index, count: c.count, data: c.data });
  }
  let assets: PartIn["assets"];
  if (v.assets !== undefined) {
    if (!Array.isArray(v.assets)) return null;
    assets = [];
    for (const a of v.assets) {
      if (!isObj(a) || typeof a.id !== "string" || !isInt(a.size, 0)) return null;
      assets.push({ id: a.id, size: a.size });
    }
  }
  return { format: v.format, version: v.version, projectId: v.projectId, part: v.part, parts: v.parts, doc: v.doc, ...(assets ? { assets } : {}), chunks };
}

export async function restoreBackup(blobs: Blob[]): Promise<RestoreResult> {
  let raw: unknown[];
  try {
    raw = await Promise.all(blobs.map(async (b) => JSON.parse(await b.text()) as unknown));
  } catch {
    return bad("JSON ilegible");
  }
  const parsed: PartIn[] = [];
  for (const r of raw) {
    const p = asPart(r);
    if (!p) return bad("estructura no válida");
    parsed.push(p);
  }
  parsed.sort((a, b) => a.part - b.part);
  const first = parsed[0];
  if (!first || first.format !== FORMAT || first.version !== 1) return bad("formato desconocido");
  if (parsed.length !== first.parts || parsed.some((p, i) => p.part !== i + 1 || p.projectId !== first.projectId || p.parts !== first.parts)) {
    return bad("faltan partes o no coinciden");
  }
  if (!first.assets) return bad("estructura no válida");
  const loaded = loadProject(first.doc);
  if (!loaded.ok) return loaded;
  const kinds = new Map(loaded.project.assets.map((a) => [a.id, a]));
  // Las miniaturas `<id>.thumb` de una imagen del documento también viajan en la copia.
  const isThumb = (id: string) => id.endsWith(".thumb") && kinds.get(id.slice(0, -".thumb".length))?.kind === "image";
  const pieces = new Map<string, Array<Uint8Array | undefined>>();
  for (const a of first.assets) {
    if ((!kinds.has(a.id) && !isThumb(a.id)) || pieces.has(a.id)) return bad(`recurso desconocido: ${a.id}`);
    pieces.set(a.id, []);
  }
  try {
    for (const p of parsed) {
      for (const c of p.chunks) {
        const list = pieces.get(c.assetId);
        if (!list) return bad(`recurso desconocido: ${c.assetId}`);
        if (list.length !== 0 && list.length !== c.count) return bad(`trozos incoherentes: ${c.assetId}`);
        list.length = c.count;
        list[c.index] = base64ToBytes(c.data);
      }
    }
  } catch {
    return bad("datos de recurso ilegibles");
  }
  const declared = new Map(first.assets.map((a) => [a.id, a.size]));
  const assets: StoredAsset[] = [];
  let total = JSON.stringify(first.doc).length;
  for (const [id, list] of pieces) {
    if (list.length === 0 || list.some((x) => x === undefined)) return bad(`recurso incompleto: ${id}`);
    const blob = new Blob(list as Uint8Array<ArrayBuffer>[], { type: isThumb(id) ? "image/webp" : (kinds.get(id)?.mimeType ?? "application/octet-stream") });
    if (blob.size !== declared.get(id)) return bad(`tamaño distinto del declarado: ${id}`);
    // Los mismos límites que al importar (SDD §6).
    const limit = checkAssetLimits({ kind: kinds.get(id)?.kind === "font" ? "font" : "image", sizeBytes: blob.size }, total);
    if (!limit.ok) return { ok: false, error: { kind: "limit", error: limit.error } };
    total += blob.size;
    assets.push({ id, blob });
  }
  return { ok: true, project: loaded.project, assets };
}

// Descarga en el navegador (sin lógica probable en Node; se inyecta en el store).
export function downloadParts(parts: BackupPart[]): void {
  for (const p of parts) {
    const url = URL.createObjectURL(p.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = p.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
