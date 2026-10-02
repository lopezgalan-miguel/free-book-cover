import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readImportFile } from "../src/mcp/files.js";

// PNG mínimo de 1x1.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
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
      expect(await readImportFile(p, limits())).toMatchObject({ ok: false, error: { kind: "invalid_params" } });
    }
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
  it("sin directorios permitidos válidos no se importa nada", async () => {
    expect((await readImportFile(join(allowed, "a.png"), { allowedDirs: [join(root, "no-existe")], maxBytes: 4000 })).ok).toBe(false);
    expect((await readImportFile(join(allowed, "a.png"), { allowedDirs: [], maxBytes: 4000 })).ok).toBe(false);
  });
});
