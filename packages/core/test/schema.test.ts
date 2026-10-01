import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, loadProject, projectSchema, serializeProject, type Project } from "../src/index.js";
import { baseProject, imageEl, shapeEl, textEl } from "./fixtures.js";

function full(): Project {
  const p = baseProject();
  p.mode = "kdp-paperback";
  p.printSetup = { trimWidthIn: 6, trimHeightIn: 9, pageCount: 200, paperAndInk: "bw-cream", readingDirection: "ltr" };
  p.digitalTargets = [{ presetId: "ig-story", presetVersion: 1, layoutOverrides: { a: 1 } }];
  p.assets = [{ id: "a1", kind: "image", mimeType: "image/png", metadata: { w: 10 } }];
  p.canvas.background = { assetId: "a1" };
  p.elements = [textEl("t1", { texture: { assetId: "a1" } }), imageEl("i1", "a1", { zIndex: 1 }), shapeEl("s1", { zIndex: 2, stroke: { color: "#ffffff", width: 1 } })];
  return p;
}

describe("esquema Project", () => {
  it("acepta un proyecto completo y su ida y vuelta JSON", () => {
    const p = full();
    expect(projectSchema.safeParse(p).success).toBe(true);
    const r = loadProject(JSON.parse(serializeProject(p)));
    expect(r).toEqual({ ok: true, project: p, migrated: false });
  });
  it("rechaza campos desconocidos, colores y curvatura fuera de rango", () => {
    const p = full();
    expect(projectSchema.safeParse({ ...p, extra: 1 }).success).toBe(false);
    expect(projectSchema.safeParse({ ...p, canvas: { ...p.canvas, background: "red" } }).success).toBe(false);
    expect(projectSchema.safeParse({ ...p, elements: [textEl("t", { curvature: 101 })] }).success).toBe(false);
    expect(projectSchema.safeParse({ ...p, elements: [textEl("t", { curvature: -100 })] }).success).toBe(true);
  });
  it("rechaza lienzo no positivo o por encima del límite", () => {
    const p = baseProject();
    for (const w of [0, -1, 100.01, NaN, Infinity]) {
      expect(projectSchema.safeParse({ ...p, canvas: { ...p.canvas, widthIn: w } }).success).toBe(false);
    }
    expect(projectSchema.safeParse({ ...p, canvas: { ...p.canvas, widthIn: 100 } }).success).toBe(true);
  });
  it("rechaza IDs duplicados y referencias a recursos inexistentes", () => {
    const p = baseProject();
    expect(projectSchema.safeParse({ ...p, elements: [shapeEl("x"), shapeEl("x")] }).success).toBe(false);
    expect(projectSchema.safeParse({ ...p, elements: [imageEl("i", "nope")] }).success).toBe(false);
    expect(projectSchema.safeParse({ ...p, canvas: { ...p.canvas, background: { assetId: "nope" } } }).success).toBe(false);
  });
});

describe("migraciones y versiones", () => {
  it("rechaza versión superior sin tocar la entrada", () => {
    const raw = { ...baseProject(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    const copy = structuredClone(raw);
    const r = loadProject(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ kind: "unsupported_version", found: CURRENT_SCHEMA_VERSION + 1 });
    expect(raw).toEqual(copy);
  });
  it("rechaza versión ausente, no entera o sin migración registrada", () => {
    for (const v of [undefined, "1", 1.5, -1, 0]) {
      const r = loadProject({ ...baseProject(), schemaVersion: v });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe("unsupported_version");
    }
  });
  it("aplica migraciones encadenadas y marca migrated", () => {
    const { schemaVersion: _v, name, ...rest } = baseProject();
    const legacy = { ...rest, schemaVersion: 0, title: name };
    const migrations = {
      0: (d: Record<string, unknown>) => {
        const { title, ...r } = d;
        return { ...r, name: title };
      },
    };
    const r = loadProject(legacy, { migrations });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.migrated).toBe(true);
      expect(r.project.name).toBe("Prueba");
      expect(r.project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    }
    expect(legacy.schemaVersion).toBe(0);
  });
  it("informa de una migración que falla o produce un documento inválido", () => {
    const legacy = { ...baseProject(), schemaVersion: 0 };
    const boom = loadProject(legacy, { migrations: { 0: () => { throw new Error("x"); } } });
    expect(boom.ok).toBe(false);
    const bad = loadProject(legacy, { migrations: { 0: (d) => ({ ...d, id: "" }) } });
    expect(bad.ok && true).toBe(false);
    if (!bad.ok) expect(bad.error.kind).toBe("invalid");
  });
  it("rechaza entradas que no son objetos", () => {
    for (const raw of [null, 3, "x", []]) expect(loadProject(raw).ok).toBe(false);
  });
});
