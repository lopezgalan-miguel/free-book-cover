import { loadProject, serializeProject, type LoadError, type Project } from "@free-book-cover/core";
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
  | { ok: false; error: LoadError | { kind: "backup"; message: string } };

const bad = (message: string): RestoreResult => ({ ok: false, error: { kind: "backup", message } });

export async function restoreBackup(blobs: Blob[]): Promise<RestoreResult> {
  let parsed: Array<Record<string, any>>;
  try {
    parsed = await Promise.all(blobs.map(async (b) => JSON.parse(await b.text())));
  } catch {
    return bad("JSON ilegible");
  }
  parsed.sort((a, b) => (a.part ?? 0) - (b.part ?? 0));
  const first = parsed[0];
  if (!first || first.format !== FORMAT || first.version !== 1) return bad("formato desconocido");
  if (parsed.length !== first.parts || parsed.some((p, i) => p.part !== i + 1 || p.projectId !== first.projectId || p.parts !== first.parts)) {
    return bad("faltan partes o no coinciden");
  }
  const loaded = loadProject(first.doc);
  if (!loaded.ok) return loaded;
  const pieces = new Map<string, Array<Uint8Array | undefined>>();
  for (const a of first.assets as Array<{ id: string }>) pieces.set(a.id, []);
  for (const p of parsed) {
    for (const c of p.chunks as Array<{ assetId: string; index: number; count: number; data: string }>) {
      const list = pieces.get(c.assetId);
      if (!list) return bad(`recurso desconocido: ${c.assetId}`);
      list.length = c.count;
      list[c.index] = base64ToBytes(c.data);
    }
  }
  const mime = new Map(loaded.project.assets.map((a) => [a.id, a.mimeType]));
  const assets: StoredAsset[] = [];
  for (const [id, list] of pieces) {
    if (list.length === 0 || list.some((x) => x === undefined)) return bad(`recurso incompleto: ${id}`);
    assets.push({ id, blob: new Blob(list as Uint8Array<ArrayBuffer>[], { type: mime.get(id) ?? "application/octet-stream" }) });
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
