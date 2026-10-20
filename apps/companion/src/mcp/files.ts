import { constants } from "node:fs";
import { open, realpath, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import { detectFontFormat, readImageHeader, type ToolError } from "@free-book-cover/core";

export interface ImportLimits {
  /** Directorios desde los que se puede importar (solo estos y sus subdirectorios). */
  allowedDirs: readonly string[];
  maxBytes: number;
}

export type ImportFile = { ok: true; name: string; bytes: Buffer } | { ok: false; error: ToolError };

const bad = (...issues: string[]): ImportFile => ({ ok: false, error: { kind: "invalid_params", issues } });
const inside = (root: string, file: string) => {
  const r = relative(root, file);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
};

export type ExportFile = { ok: true; path: string } | { ok: false; error: ToolError };

/**
 * Escribe un archivo exportado en el directorio de exportación (FBC_EXPORT_DIR). Del nombre recibido solo se usa
 * el nombre de archivo, nunca una ruta; un archivo existente no se pisa (se añade -2, -3...).
 */
export async function writeExportFile(dir: string | null, fileName: string, bytes: Uint8Array): Promise<ExportFile> {
  if (!dir) return { ok: false, error: { kind: "invalid_params", issues: ["la exportación necesita FBC_EXPORT_DIR en el proceso MCP"] } };
  const safe = basename(fileName).replace(/[^\p{L}\p{N}._-]+/gu, "-") || "portada";
  const ext = extname(safe);
  const stem = safe.slice(0, safe.length - ext.length) || "portada";
  for (let n = 1; n < 1000; n++) {
    const path = join(dir, n === 1 ? `${stem}${ext}` : `${stem}-${n}${ext}`);
    try {
      // wx: falla si existe; nunca se sobrescribe.
      await writeFile(path, bytes, { flag: "wx" });
      return { ok: true, path };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
        console.error("no se pudo escribir la exportación", e);
        return { ok: false, error: { kind: "internal" } };
      }
    }
  }
  return { ok: false, error: { kind: "internal" } };
}

/**
 * Lee la imagen indicada por ruta con las comprobaciones de import_asset: directorio permitido (tras resolver
 * enlaces simbólicos), archivo normal, tamaño máximo y firma de imagen. Los mensajes no incluyen rutas del sistema.
 */
export async function readImportFile(path: string, limits: ImportLimits, kind: "image" | "font" = "image"): Promise<ImportFile> {
  if (path.includes("\0")) return bad("ruta no válida");
  // Inexistente y fuera de los directorios permitidos dan el mismo error: no se revela qué existe fuera.
  const missing: ImportFile = { ok: false, error: { kind: "not_found", resource: "file" } };
  let real: string;
  try {
    real = await realpath(resolve(path));
  } catch {
    return missing;
  }
  const roots: string[] = [];
  for (const d of limits.allowedDirs) {
    try {
      roots.push(await realpath(resolve(d)));
    } catch {
      // un directorio configurado que no existe no permite nada
    }
  }
  if (!roots.some((r) => inside(r, real))) return missing;
  // O_NOFOLLOW + fstat sobre el descriptor: lo comprobado es lo que se lee, aunque la ruta cambie después.
  const fh = await open(real, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => null);
  if (!fh) return missing;
  try {
    const info = await fh.stat();
    if (!info.isFile()) return bad("la ruta no es un archivo");
    if (info.size > limits.maxBytes) return bad(`el archivo supera el límite de ${limits.maxBytes} bytes`);
    // Se lee como mucho el límite + 1: un archivo que crece tras el stat tampoco lo supera.
    const buf = Buffer.alloc(limits.maxBytes + 1);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    if (bytesRead > limits.maxBytes) return bad(`el archivo supera el límite de ${limits.maxBytes} bytes`);
    const bytes = buf.subarray(0, bytesRead);
    if (kind === "image" && !readImageHeader(bytes)) return bad("formato de imagen no admitido (PNG, JPEG, WebP o GIF)");
    if (kind === "font" && !detectFontFormat(bytes)) return bad("formato de fuente no admitido (.ttf, .otf o .woff2)");
    return { ok: true, name: basename(real), bytes };
  } finally {
    await fh.close();
  }
}
