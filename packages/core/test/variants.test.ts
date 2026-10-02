import { describe, expect, it } from "vitest";
import {
  CUSTOM_PRESET_ID, DIGITAL_PRESETS, MAX_TARGET_PX, applyCommand, buildExportReport, checkExportSize, createHistory, customTarget,
  elementVisibility, execute, exportFileName, findPreset, fitToExportLimit, formatBytes, loadProject, overridesOf, redo, renderDocument,
  targetFromPreset, undo, variantDocument, visibleArea, type Command, type Project,
} from "../src/index.js";
import { baseProject, imageEl, shapeEl, textEl } from "./fixtures.js";

function base(): Project {
  const p = baseProject();
  p.assets = [{ id: "a1", kind: "image", mimeType: "image/png", metadata: { widthPx: 600, heightPx: 900 } }];
  p.canvas.background = { assetId: "a1" };
  p.elements = [
    shapeEl("s1", { x: 1, y: 2, width: 2, height: 1, fill: "#ff0000", zIndex: 0 }),
    textEl("t1", { x: 1, y: 5, width: 4, height: 1, zIndex: 1 }),
    imageEl("i1", "a1", { x: 0, y: 0, width: 6, height: 9, zIndex: 2, visible: false }),
  ];
  return p;
}
const run = (doc: Project, cmd: Command) => {
  const r = applyCommand(doc, cmd, doc.revision);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.doc;
};
const ig = () => targetFromPreset(findPreset("instagram-feed-portrait")!, "v1");
const story = () => targetFromPreset(findPreset("instagram-vertical")!, "v2");

describe("catálogo de preajustes", () => {
  it("cada preajuste trae plataforma, destino, píxeles, formatos, versión y fecha de revisión", () => {
    expect(DIGITAL_PRESETS.length).toBeGreaterThanOrEqual(5);
    for (const p of DIGITAL_PRESETS) {
      expect(p.widthPx).toBeGreaterThan(0);
      expect(p.heightPx).toBeGreaterThan(0);
      expect(p.formats.length).toBeGreaterThan(0);
      expect(p.version).toBeGreaterThanOrEqual(1);
      expect(p.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(new Set(DIGITAL_PRESETS.map((p) => p.id)).size).toBe(DIGITAL_PRESETS.length);
    expect(findPreset("instagram-feed-portrait")).toMatchObject({ widthPx: 1080, heightPx: 1350 });
    expect(findPreset("instagram-vertical")).toMatchObject({ widthPx: 1080, heightPx: 1920 });
    expect(findPreset("no-existe")).toBeUndefined();
  });
  it("una variante guardada no cambia al actualizar el catálogo", () => {
    const t = ig();
    const newer = DIGITAL_PRESETS.map((p) => (p.id === t.presetId ? { ...p, version: 2, widthPx: 1200, heightPx: 1500 } : p));
    const doc = run(base(), { type: "addDigitalTarget", target: t });
    expect(findPreset(t.presetId, newer)).toMatchObject({ version: 2, widthPx: 1200 });
    const saved = doc.digitalTargets![0]!;
    expect(saved).toMatchObject({ presetVersion: 1, widthPx: 1080, heightPx: 1350 });
    // las dimensiones de la variante salen del propio destino, no del catálogo
    expect(variantDocument(doc, saved as never).canvas.widthIn).toBeCloseTo(1080 / 300, 9);
  });
  it("tamaño personalizado: valida enteros dentro del límite por lado", () => {
    const ok = customTarget("c1", 800, 600);
    expect(ok).toMatchObject({ ok: true, target: { presetId: CUSTOM_PRESET_ID, widthPx: 800, heightPx: 600 } });
    for (const [w, h] of [[0, 10], [10, -1], [10.5, 10], [MAX_TARGET_PX + 1, 10], [NaN, 10]] as const) {
      expect(customTarget("c", w, h)).toEqual({ ok: false, reason: "invalid_size" });
    }
  });
});

describe("variantDocument", () => {
  it("tiene el tamaño del destino y modo digital, y no toca el base", () => {
    const doc = run(base(), { type: "addDigitalTarget", target: ig() });
    const before = JSON.stringify(doc);
    const v = variantDocument(doc, doc.digitalTargets![0] as never);
    expect(v.mode).toBe("digital");
    expect(v.canvas.widthIn * 300).toBeCloseTo(1080, 6);
    expect(v.canvas.heightIn * 300).toBeCloseTo(1350, 6);
    expect(v.digitalTargets).toBeUndefined();
    expect(JSON.stringify(doc)).toBe(before);
  });
  it("escala el diseño de forma uniforme hasta cubrir y centra (proporciones distintas)", () => {
    let doc = run(base(), { type: "addDigitalTarget", target: ig() });
    doc = run(doc, { type: "addDigitalTarget", target: story() });
    const [a, b] = doc.digitalTargets!.map((t) => variantDocument(doc, t as never));
    // base 6×9 in: cubrir 3,6×4,5 in => k = 0,6 ; cubrir 3,6×6,4 in => k = 6,4/9
    const kA = 0.6, kB = 6.4 / 9;
    const sA = a!.elements.find((e) => e.id === "s1")!;
    expect(sA.width).toBeCloseTo(2 * kA, 9);
    expect(sA.x).toBeCloseTo((1 - 3) * kA + 1.8, 9);
    expect(sA.y).toBeCloseTo((2 - 4.5) * kA + 2.25, 9);
    const sB = b!.elements.find((e) => e.id === "s1")!;
    expect(sB.width).toBeCloseTo(2 * kB, 9);
    expect(sB.x).toBeCloseTo((1 - 3) * kB + 1.8, 9);
    // el tamaño de letra sigue a la escala
    const tA = a!.elements.find((e) => e.id === "t1")!;
    const tB = b!.elements.find((e) => e.id === "t1")!;
    expect(tA.type === "text" && tA.runs[0]!.fontSizePt).toBeCloseTo(24 * kA, 9);
    expect(tB.type === "text" && tB.runs[0]!.fontSizePt).toBeCloseTo(24 * kB, 9);
    expect(a!.canvas.heightIn).not.toBeCloseTo(b!.canvas.heightIn, 3);
  });
  it("área visible: ancho completo y recorte vertical en 4:5, recorte horizontal en 9:16", () => {
    const doc = base();
    const a = visibleArea(doc, ig());
    expect(a.rect.width).toBeCloseTo(6, 9);
    expect(a.rect.height).toBeCloseTo(7.5, 9);
    expect(a.rect.y).toBeCloseTo(0.75, 9);
    expect(a.coverage).toBeCloseTo(7.5 / 9, 9);
    const b = visibleArea(doc, story());
    expect(b.rect.height).toBeCloseTo(9, 9);
    expect(b.rect.width).toBeCloseTo(3.6 / (6.4 / 9), 9);
    expect(b.rect.x).toBeCloseTo((6 - b.rect.width) / 2, 9);
  });
  it("los ajustes sustituyen lo derivado y fontScale multiplica el tamaño de letra", () => {
    let doc = run(base(), { type: "addDigitalTarget", target: ig() });
    doc = run(doc, { type: "setVariantElement", targetId: "v1", elementId: "s1", props: { x: 0.5, y: 0.25, width: 1, height: 1, rotation: 15 } });
    doc = run(doc, { type: "setVariantElement", targetId: "v1", elementId: "t1", props: { fontScale: 2, visible: false } });
    const v = variantDocument(doc, doc.digitalTargets![0] as never);
    expect(v.elements.find((e) => e.id === "s1")).toMatchObject({ x: 0.5, y: 0.25, width: 1, height: 1, rotation: 15 });
    const t = v.elements.find((e) => e.id === "t1")!;
    expect(t.visible).toBe(false);
    expect(t.type === "text" && t.runs[0]!.fontSizePt).toBeCloseTo(24 * 0.6 * 2, 9);
  });
  it("el fondo y las imágenes aceptan encuadre propio", () => {
    let doc = run(base(), { type: "addDigitalTarget", target: ig() });
    doc = run(doc, { type: "setVariantBackground", targetId: "v1", props: { fit: "contain", pos: { x: 0, y: 1 } } });
    doc = run(doc, { type: "setVariantElement", targetId: "v1", elementId: "i1", props: { fit: "fill", crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } } });
    const v = variantDocument(doc, doc.digitalTargets![0] as never);
    expect(v.canvas).toMatchObject({ backgroundFit: "contain", backgroundPos: { x: 0, y: 1 } });
    expect(v.elements.find((e) => e.id === "i1")).toMatchObject({ fit: "fill", crop: { x: 0.1, width: 0.5 } });
    // el render de la variante usa el encuadre de la variante
    const r = renderDocument(v, { pxPerInch: 300 });
    expect(Math.round(r.widthPx)).toBe(1080);
    expect(Math.round(r.heightPx)).toBe(1350);
    expect(r.background.kind === "image" && r.background.draw?.fit).toBe("contain");
    expect(doc.canvas.backgroundFit).toBeUndefined();
  });
  it("clasifica elementos dentro, cortados y fuera del lienzo de la variante", () => {
    let doc = run(base(), { type: "addDigitalTarget", target: story() });
    doc = run(doc, { type: "setVariantElement", targetId: "v2", elementId: "s1", props: { x: 100, y: 0 } });
    doc = run(doc, { type: "setVariantElement", targetId: "v2", elementId: "t1", props: { x: -0.5, y: 1, width: 2, height: 0.5 } });
    const v = variantDocument(doc, doc.digitalTargets![0] as never);
    const vis = Object.fromEntries(elementVisibility(v).map((x) => [x.id, x.visibility]));
    expect(vis).toEqual({ s1: "outside", t1: "partial" });
  });
});

describe("comandos de variantes", () => {
  it("añade, valida y elimina variantes; rechaza duplicados y destinos inexistentes", () => {
    let doc = run(base(), { type: "addDigitalTarget", target: ig() });
    expect(doc.revision).toBe(1);
    const dup = applyCommand(doc, { type: "addDigitalTarget", target: ig() }, doc.revision);
    expect(dup.ok).toBe(false);
    const bad = applyCommand(doc, { type: "addDigitalTarget", target: { ...story(), widthPx: 0 } }, doc.revision);
    expect(bad.ok).toBe(false);
    expect(applyCommand(doc, { type: "setVariantElement", targetId: "nope", elementId: "s1", props: { x: 1 } }, doc.revision)).toMatchObject({ ok: false, error: { kind: "not_found" } });
    expect(applyCommand(doc, { type: "setVariantElement", targetId: "v1", elementId: "nope", props: { x: 1 } }, doc.revision)).toMatchObject({ ok: false, error: { kind: "not_found" } });
    expect(applyCommand(doc, { type: "setVariantElement", targetId: "v1", elementId: "s1", props: { width: -1 } }, doc.revision).ok).toBe(false);
    doc = run(doc, { type: "removeDigitalTarget", id: "v1" });
    expect(doc.digitalTargets).toEqual([]);
    expect(applyCommand(doc, { type: "removeDigitalTarget", id: "v1" }, doc.revision)).toMatchObject({ ok: false, error: { kind: "not_found" } });
  });
  it("rechaza ediciones con revisión obsoleta", () => {
    const doc = run(base(), { type: "addDigitalTarget", target: ig() });
    expect(applyCommand(doc, { type: "setVariantElement", targetId: "v1", elementId: "s1", props: { x: 1 } }, 0)).toMatchObject({ ok: false, error: { kind: "conflict" } });
  });
  it("editar una variante no altera la otra ni el documento base", () => {
    let doc = run(base(), { type: "addDigitalTarget", target: ig() });
    doc = run(doc, { type: "addDigitalTarget", target: story() });
    const elementsBefore = JSON.stringify(doc.elements);
    const canvasBefore = JSON.stringify(doc.canvas);
    const v2Before = JSON.stringify(doc.digitalTargets![1]);
    doc = run(doc, { type: "setVariantElement", targetId: "v1", elementId: "s1", props: { x: 0.1, y: 0.2 } });
    doc = run(doc, { type: "setVariantBackground", targetId: "v1", props: { fit: "contain" } });
    expect(JSON.stringify(doc.elements)).toBe(elementsBefore);
    expect(JSON.stringify(doc.canvas)).toBe(canvasBefore);
    expect(JSON.stringify(doc.digitalTargets![1])).toBe(v2Before);
    expect(overridesOf(doc.digitalTargets![0]!)).toEqual({ background: { fit: "contain" }, elements: { s1: { x: 0.1, y: 0.2 } } });
    // el ajuste se fusiona con el anterior y puede restablecerse
    doc = run(doc, { type: "setVariantElement", targetId: "v1", elementId: "s1", props: { rotation: 5 } });
    expect(overridesOf(doc.digitalTargets![0]!).elements!.s1).toEqual({ x: 0.1, y: 0.2, rotation: 5 });
    doc = run(doc, { type: "resetVariantElement", targetId: "v1", elementId: "s1" });
    expect(overridesOf(doc.digitalTargets![0]!).elements).toEqual({});
    doc = run(doc, { type: "resetVariant", targetId: "v1" });
    expect(doc.digitalTargets![0]!.layoutOverrides).toEqual({});
  });
  it("cambiar el base se refleja en las variantes derivadas, pero no en sus ajustes", () => {
    let doc = run(base(), { type: "addDigitalTarget", target: ig() });
    doc = run(doc, { type: "setVariantElement", targetId: "v1", elementId: "s1", props: { x: 0.5 } });
    doc = run(doc, { type: "updateElement", id: "s1", props: { fill: "#00ff00", x: 2 } });
    const v = variantDocument(doc, doc.digitalTargets![0] as never);
    const s = v.elements.find((e) => e.id === "s1")!;
    expect(s).toMatchObject({ x: 0.5, fill: "#00ff00" });
  });
  it("borrar un elemento retira sus ajustes en el mismo paso, y deshacer los restaura", () => {
    let h = createHistory(base());
    const step = (c: Command) => {
      const r = execute(h, c, h.present.revision);
      if (!r.ok) throw new Error(JSON.stringify(r.error));
      h = r.history;
    };
    step({ type: "addDigitalTarget", target: ig() });
    step({ type: "setVariantElement", targetId: "v1", elementId: "s1", props: { x: 0.5 } });
    step({ type: "removeElement", id: "s1" });
    expect(overridesOf(h.present.digitalTargets![0]!).elements).toEqual({});
    const u = undo(h);
    if (!u.ok) throw new Error("undo");
    expect(overridesOf(u.history.present.digitalTargets![0]!).elements).toEqual({ s1: { x: 0.5 } });
    const r = redo(u.history);
    if (!r.ok) throw new Error("redo");
    expect(overridesOf(r.history.present.digitalTargets![0]!).elements).toEqual({});
  });
  it("deshacer y rehacer cada edición de variante", () => {
    let h = createHistory(base());
    const exec = (c: Command) => {
      const r = execute(h, c, h.present.revision);
      if (!r.ok) throw new Error("exec");
      h = r.history;
    };
    exec({ type: "addDigitalTarget", target: ig() });
    exec({ type: "setVariantElement", targetId: "v1", elementId: "s1", props: { x: 1.5 } });
    let r = undo(h);
    if (!r.ok) throw new Error("undo");
    expect(overridesOf(r.history.present.digitalTargets![0]!).elements).toBeUndefined();
    r = undo(r.history);
    if (!r.ok) throw new Error("undo2");
    expect(r.history.present.digitalTargets).toBeUndefined();
    r = redo(r.history);
    if (!r.ok) throw new Error("redo");
    expect(r.history.present.digitalTargets).toHaveLength(1);
  });
  it("ida y vuelta JSON del proyecto con variantes y compatibilidad con destinos antiguos", () => {
    let doc = run(base(), { type: "addDigitalTarget", target: ig() });
    doc = run(doc, { type: "setVariantElement", targetId: "v1", elementId: "s1", props: { x: 0.5 } });
    const loaded = loadProject(JSON.parse(JSON.stringify(doc)));
    expect(loaded.ok && loaded.project).toEqual(doc);
    // un destino con el esquema original (sin id ni dimensiones) sigue siendo válido
    const legacy = { ...doc, digitalTargets: [{ presetId: "ig-story", presetVersion: 1, layoutOverrides: { a: 1 } }] };
    expect(loadProject(legacy).ok).toBe(true);
    // ajustes de un elemento inexistente se rechazan en destinos con identidad
    const orphan = { ...doc, digitalTargets: [{ ...ig(), layoutOverrides: { elements: { fantasma: { x: 1 } } } }] };
    expect(loadProject(orphan).ok).toBe(false);
  });
});

describe("límite y informe de exportación", () => {
  it("50 MP exactos se admiten; por encima, error explícito con tamaño sugerido", () => {
    expect(checkExportSize(10000, 5000)).toEqual({ ok: true, megapixels: 50 });
    const r = checkExportSize(10001, 5000);
    expect(r).toMatchObject({ ok: false, error: { kind: "export_too_many_megapixels", limitMegapixels: 50 } });
    if (!r.ok && "suggested" in r) {
      expect(r.suggested.widthPx * r.suggested.heightPx).toBeLessThanOrEqual(50e6);
      expect(r.suggested.widthPx / r.suggested.heightPx).toBeCloseTo(2, 2);
    }
    expect(checkExportSize(0, 10)).toEqual({ ok: false, error: { kind: "invalid_size" } });
    expect(checkExportSize(10.5, 10)).toEqual({ ok: false, error: { kind: "invalid_size" } });
    const f = fitToExportLimit(9000, 9000);
    expect(f.widthPx * f.heightPx).toBeLessThanOrEqual(50e6);
    expect(fitToExportLimit(100, 100)).toEqual({ widthPx: 100, heightPx: 100 });
  });
  it("informe: formato, dimensiones, peso y destino; la calidad solo en formatos con pérdida", () => {
    const png = buildExportReport({ format: "png", widthPx: 1080, heightPx: 1350, bytes: 2048, quality: 90, destination: "Instagram · Feed", projectName: "Mi Novela" });
    expect(png).toMatchObject({ format: "png", mimeType: "image/png", widthPx: 1080, heightPx: 1350, bytes: 2048, destination: "Instagram · Feed" });
    expect(png.quality).toBeUndefined();
    expect(png.megapixels).toBeCloseTo(1.458, 6);
    expect(png.fileName).toBe("mi-novela-instagram-feed-1080x1350.png");
    const jpg = buildExportReport({ format: "jpeg", widthPx: 10, heightPx: 10, bytes: 1, quality: 80, destination: "", projectName: "" });
    expect(jpg.quality).toBe(80);
    expect(jpg.fileName).toBe("portada-10x10.jpg");
    expect(exportFileName("Ñandú", "x", "webp", 1, 2)).toBe("nandu-x-1x2.webp");
  });
  it("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.00 MB");
  });
});
