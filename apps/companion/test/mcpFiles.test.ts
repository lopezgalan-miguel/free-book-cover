import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readImportFile, writeExportFile } from "../src/mcp/files.js";

// PNG mínimo de 1x1.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const TTF = Buffer.from([0, 1, 0, 0, 1, 2, 3, 4]);
// Cabecera mínima de una colección .ttc (firma «ttcf», versión 1.0, 0 fuentes): basta para la firma.
const TTC = Buffer.from([0x74, 0x74, 0x63, 0x66, 0, 1, 0, 0, 0, 0, 0, 0]);
let root: string;
let allowed: string;
let outside: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "fbc-imp-"));
  allowed = join(root, "ok");
  outside = join(root, "fuera");
  await mkdir(join(allowed, "sub"), { recursive: true });
  await mkdir(outside);
  await writeFile(join(allowed, "a.png"), PNG);
  await writeFile(join(allowed, "sub", "b.png"), PNG);
  await writeFile(join(allowed, "texto.png"), "no soy una imagen");
  await writeFile(join(allowed, "grande.png"), Buffer.concat([PNG, Buffer.alloc(5000)]));
  await writeFile(join(outside, "secreto.png"), PNG);
  await writeFile(join(allowed, "f.ttf"), TTF);
  await writeFile(join(allowed, "c.ttc"), TTC);
  await symlink(join(outside, "secreto.png"), join(allowed, "enlace.png"));
});
afterAll(() => rm(root, { recursive: true, force: true }));

const limits = () => ({ allowedDirs: [allowed], maxBytes: 4000 });

describe("readImportFile", () => {
  it("lee una imagen del directorio permitido y de sus subdirectorios", async () => {
    const r = await readImportFile(join(allowed, "a.png"), limits());
    expect(r).toMatchObject({ ok: true, name: "a.png" });
    expect(r.ok && r.bytes.equals(PNG)).toBe(true);
    expect((await readImportFile(join(allowed, "sub", "b.png"), limits())).ok).toBe(true);
  });
  it("rechaza rutas fuera de los directorios permitidos, incluidos .. y enlaces simbólicos", async () => {
    for (const p of [join(outside, "secreto.png"), join(allowed, "..", "fuera", "secreto.png"), join(allowed, "enlace.png")]) {
      expect(await readImportFile(p, limits())).toEqual({ ok: false, error: { kind: "not_found", resource: "file" } });
    }
  });
  it("sin oráculo de existencia: fuera existente, fuera inexistente y dentro inexistente dan lo mismo", async () => {
    const results = await Promise.all([join(outside, "secreto.png"), join(outside, "no-existe.png"), join(allowed, "no-existe.png"), "/etc/hosts", "/no/existe/nada"].map((p) => readImportFile(p, limits())));
    for (const r of results) expect(r).toEqual(results[0]);
  });
  it("archivo inexistente: not_found sin repetir la ruta", async () => {
    const r = await readImportFile(join(allowed, "no-existe.png"), limits());
    expect(r).toEqual({ ok: false, error: { kind: "not_found", resource: "file" } });
  });
  it("directorios, tamaño excesivo, formato no admitido y bytes nulos: invalid_params", async () => {
    for (const p of [join(allowed, "sub"), join(allowed, "grande.png"), join(allowed, "texto.png"), `${join(allowed, "a.png")}\0.txt`]) {
      const r = await readImportFile(p, limits());
      expect(r).toMatchObject({ ok: false, error: { kind: "invalid_params" } });
      expect(JSON.stringify(r)).not.toContain(root);
    }
  });
  it("el descriptor abierto es el que se comprueba: un directorio no se lee", async () => {
    expect(await readImportFile(join(allowed, "sub"), limits())).toMatchObject({ ok: false, error: { kind: "invalid_params" } });
  });
  it("sin directorios permitidos válidos no se importa nada", async () => {
    expect((await readImportFile(join(allowed, "a.png"), { allowedDirs: [join(root, "no-existe")], maxBytes: 4000 })).ok).toBe(false);
    expect((await readImportFile(join(allowed, "a.png"), { allowedDirs: [], maxBytes: 4000 })).ok).toBe(false);
  });
});

describe("readImportFile: fuentes", () => {
  it("con kind font acepta la firma de una fuente y rechaza una imagen", async () => {
    const r = await readImportFile(join(allowed, "f.ttf"), limits(), "font");
    expect(r).toMatchObject({ ok: true, name: "f.ttf" });
    expect((await readImportFile(join(allowed, "a.png"), limits(), "font")).ok).toBe(false);
    expect((await readImportFile(join(allowed, "f.ttf"), limits())).ok).toBe(false);
  });
  it("con kind font acepta también una colección .ttc", async () => {
    expect(await readImportFile(join(allowed, "c.ttc"), limits(), "font")).toMatchObject({ ok: true, name: "c.ttc" });
  });
});

describe("writeExportFile", () => {
  it("escribe en el directorio de exportación sin pisar archivos y sin salirse de él", async () => {
    const dir = join(root, "exportes");
    await mkdir(dir);
    const a = await writeExportFile(dir, "portada.png", PNG);
    const b = await writeExportFile(dir, "portada.png", PNG);
    if (!a.ok || !b.ok) throw new Error("no escrito");
    expect(a.path).toBe(join(dir, "portada.png"));
    expect(b.path).toBe(join(dir, "portada-2.png"));
    expect(await readFile(b.path)).toEqual(PNG);
    // Un nombre con ruta se reduce a su nombre de archivo.
    const c = await writeExportFile(dir, "../../fuera.png", PNG);
    expect(c.ok && c.path).toBe(join(dir, "fuera.png"));
    expect((await readdir(dir)).sort()).toEqual(["fuera.png", "portada-2.png", "portada.png"]);
  });
  it("sin directorio de exportación configurado no escribe nada", async () => {
    expect(await writeExportFile(null, "a.png", PNG)).toMatchObject({ ok: false, error: { kind: "invalid_params" } });
  });
});
