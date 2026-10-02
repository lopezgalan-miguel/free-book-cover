import { describe, expect, it } from "vitest";
import {
  BARCODE, applyCommand, backgroundCoversBleed, createHistory, rotatedBounds, elementsOutsideCanvas, execute, kdpGuides, kdpLayout, kdpReview,
  redo, repositionElements, spineTextAllowed, spineWidthIn, spineWithinTolerance, undo, validatePrintSetup, zoneAt,
  type Command, type PrintSetup, type Project,
} from "../src/index.js";
import { baseProject, shapeEl, textEl } from "./fixtures.js";

const setup = (over: Partial<PrintSetup> = {}): PrintSetup => ({ trimWidthIn: 6, trimHeightIn: 9, pageCount: 300, paperAndInk: "bw-cream", readingDirection: "ltr", ...over });
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);
const run = (doc: Project, cmd: Command) => {
  const r = applyCommand(doc, cmd, doc.revision);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.doc;
};

// Casos calculados a mano con el grosor por página oficial (sources.md):
// lomo = páginas × grosor; ancho = 2 × corte + lomo + 2 × 0,125; alto = corte + 2 × 0,125.
// El contraste con la plantilla oficial del calculador es manual (VERIFICACION.md).
describe("fórmulas de lomo y tamaño total", () => {
  const cases: Array<[string, PrintSetup, number, number, number]> = [
    ["6×9, 300 págs, B/N crema: 300 × 0,0025", setup(), 0.75, 13, 9.25],
    ["6×9, 200 págs, B/N blanco: 200 × 0,002252", setup({ pageCount: 200, paperAndInk: "bw-white" }), 0.4504, 12.7004, 9.25],
    ["5×8, 100 págs, color premium: 100 × 0,002347", setup({ trimWidthIn: 5, trimHeightIn: 8, pageCount: 100, paperAndInk: "color-premium" }), 0.2347, 10.4847, 8.25],
    ["6×9, 100 págs, color estándar: 100 × 0,002252", setup({ pageCount: 100, paperAndInk: "color-standard" }), 0.2252, 12.4752, 9.25],
    ["5×8, 24 págs, B/N blanco (mínimo)", setup({ trimWidthIn: 5, trimHeightIn: 8, pageCount: 24, paperAndInk: "bw-white" }), 0.054048, 10.304048, 8.25],
  ];
  it.each(cases)("%s", (_n, s, spine, w, h) => {
    close(spineWidthIn(s.pageCount, s.paperAndInk), spine);
    const l = kdpLayout(s);
    close(l.spineIn, spine);
    close(l.widthIn, w);
    close(l.heightIn, h);
  });
  it("papel no admitido (groundwood) lanza", () => {
    expect(() => spineWidthIn(300, "bw-groundwood")).toThrow();
  });
  it("tolerancia del lomo ±0,0125 in", () => {
    expect(spineWithinTolerance(0.75, 0.75)).toBe(true);
    expect(spineWithinTolerance(0.7625, 0.75)).toBe(true);
    expect(spineWithinTolerance(0.7374, 0.75)).toBe(false);
    expect(spineWithinTolerance(0.7626, 0.75)).toBe(false);
  });
});

describe("zonas, zonas seguras, pliegues y código de barras", () => {
  const l = kdpLayout(setup());
  it("contraportada | lomo | portada con sangrado de 0,125 in", () => {
    expect(l.back).toEqual({ x: 0.125, y: 0.125, width: 6, height: 9 });
    expect(l.spine).toEqual({ x: 6.125, y: 0.125, width: 0.75, height: 9 });
    expect(l.front).toEqual({ x: 6.875, y: 0.125, width: 6, height: 9 });
    expect(l.folds).toEqual([6.125, 6.875]);
    close(l.front.x + l.front.width + l.bleedIn, l.widthIn);
  });
  it("zonas seguras a 0,125 in del corte y del pliegue", () => {
    expect(l.safe.back).toEqual({ x: 0.25, y: 0.25, width: 5.75, height: 8.75 });
    expect(l.safe.front).toEqual({ x: 7, y: 0.25, width: 5.75, height: 8.75 });
  });
  it("texto de lomo con margen de 0,0625 in a cada lado", () => {
    expect(l.spineSafe).toEqual({ x: 6.1875, y: 0.25, width: 0.625, height: 8.75 });
  });
  it("código de barras 2×1,2 in en la esquina inferior derecha de la contraportada, a 0,25 in del lomo y del corte", () => {
    expect(l.barcode.width).toBe(BARCODE.widthIn);
    expect(l.barcode.height).toBe(BARCODE.heightIn);
    close(l.back.x + l.back.width - (l.barcode.x + l.barcode.width), 0.25);
    close(l.back.y + l.back.height - (l.barcode.y + l.barcode.height), 0.25);
  });
  it("zoneAt clasifica por la x del centro", () => {
    expect(zoneAt(l, 3)).toBe("back");
    expect(zoneAt(l, 6.5)).toBe("spine");
    expect(zoneAt(l, 10)).toBe("front");
  });
  it("las guías incluyen sangrado, corte, seguras, pliegues y código de barras", () => {
    const kinds = kdpGuides(l).map((g) => g.kind);
    for (const k of ["bleed", "trim", "safe", "fold", "barcode", "spineSafe"]) expect(kinds).toContain(k);
    expect(kdpGuides(kdpLayout(setup({ pageCount: 50 }))).map((g) => g.kind)).not.toContain("spineSafe");
  });
});

describe("regla de 79 páginas del texto de lomo", () => {
  it("78 no, 79 sí", () => {
    expect(spineTextAllowed(78, spineWidthIn(78, "bw-white"))).toBe(false);
    expect(spineTextAllowed(79, spineWidthIn(79, "bw-white"))).toBe(true);
    expect(kdpLayout(setup({ pageCount: 78, paperAndInk: "bw-white" })).spineSafe).toBeNull();
    expect(kdpLayout(setup({ pageCount: 79, paperAndInk: "bw-white" })).spineSafe).not.toBeNull();
  });
});

describe("validación de datos de impresión", () => {
  it("válidos", () => {
    expect(validatePrintSetup(setup())).toEqual({ ok: true });
    expect(validatePrintSetup(setup({ trimWidthIn: 5, trimHeightIn: 8 }))).toEqual({ ok: true });
  });
  it("mínimos y máximos de páginas por papel", () => {
    expect(validatePrintSetup(setup({ pageCount: 23 }))).toEqual({ ok: false, issues: [{ kind: "pages_below_min", min: 24 }] });
    expect(validatePrintSetup(setup({ pageCount: 71, paperAndInk: "color-standard" }))).toEqual({ ok: false, issues: [{ kind: "pages_below_min", min: 72 }] });
    expect(validatePrintSetup(setup({ pageCount: 72, paperAndInk: "color-standard" })).ok).toBe(true);
    expect(validatePrintSetup(setup({ pageCount: 776, paperAndInk: "bw-cream" })).ok).toBe(true);
    expect(validatePrintSetup(setup({ pageCount: 777, paperAndInk: "bw-cream" }))).toEqual({ ok: false, issues: [{ kind: "pages_above_max", max: 776 }] });
    expect(validatePrintSetup(setup({ pageCount: 829, paperAndInk: "bw-white" })).ok).toBe(false);
    expect(validatePrintSetup(setup({ pageCount: 601, paperAndInk: "color-standard" })).ok).toBe(false);
    expect(validatePrintSetup(setup({ pageCount: 829, paperAndInk: "color-premium" })).ok).toBe(false);
  });
  it("páginas no enteras o papel desconocido", () => {
    expect(validatePrintSetup(setup({ pageCount: 100.5 }))).toMatchObject({ ok: false, issues: [{ kind: "pages_invalid" }] });
    expect(validatePrintSetup(setup({ paperAndInk: "bw-groundwood" }))).toMatchObject({ ok: false, issues: [{ kind: "paper_unsupported" }] });
  });
  it("tamaño fuera de rango o sin máximo contrastado", () => {
    expect(validatePrintSetup(setup({ trimWidthIn: 3.9 }))).toMatchObject({ ok: false, issues: [{ kind: "trim_out_of_range" }] });
    expect(validatePrintSetup(setup({ trimHeightIn: 11.7 }))).toMatchObject({ ok: false, issues: [{ kind: "trim_out_of_range" }] });
    expect(validatePrintSetup(setup({ trimWidthIn: 8.5, trimHeightIn: 11 }))).toMatchObject({ ok: false, issues: [{ kind: "trim_unsupported" }] });
  });
});

describe("comando setPrintSetup", () => {
  it("fija modo, datos y tamaño del lienzo; revision + 1", () => {
    const d = run(baseProject(), { type: "setPrintSetup", printSetup: setup() });
    expect(d.mode).toBe("kdp-paperback");
    expect(d.printSetup).toEqual(setup());
    close(d.canvas.widthIn, 13);
    close(d.canvas.heightIn, 9.25);
    expect(d.revision).toBe(1);
  });
  it("rechaza datos inválidos sin tocar nada y detecta conflictos", () => {
    const doc = baseProject();
    const r = applyCommand(doc, { type: "setPrintSetup", printSetup: setup({ pageCount: 10 }) }, 0);
    expect(r).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(applyCommand(doc, { type: "setPrintSetup", printSetup: setup() }, 5)).toMatchObject({ ok: false, error: { kind: "conflict" } });
  });
  it("al cambiar páginas los elementos no se deforman: la contraportada no se mueve, el lomo se recentra y la portada se desplaza", () => {
    let d = run(baseProject(), { type: "setPrintSetup", printSetup: setup() });
    d = run(d, { type: "addElement", element: shapeEl("back", { x: 1, y: 1, width: 2, height: 1 }) });
    d = run(d, { type: "addElement", element: shapeEl("backRight", { x: 4, y: 1, width: 1, height: 1 }) });
    d = run(d, { type: "addElement", element: textEl("spine", { x: 6.2, y: 2, width: 0.6, height: 4, rotation: 90 }) });
    d = run(d, { type: "addElement", element: shapeEl("front", { x: 8, y: 1, width: 3, height: 2 }) });
    const before = new Map(d.elements.map((e) => [e.id, e]));
    const d2 = run(d, { type: "setPrintSetup", printSetup: setup({ pageCount: 400 }) }); // lomo 1,0 (+0,25)
    const get = (id: string) => d2.elements.find((e) => e.id === id)!;
    expect(get("back")).toEqual(before.get("back"));
    expect(get("backRight")).toEqual(before.get("backRight"));
    close(get("spine").x, 6.2 + 0.125);
    close(get("front").x, 8.25);
    for (const e of d2.elements) {
      expect([e.width, e.height, e.rotation]).toEqual([before.get(e.id)!.width, before.get(e.id)!.height, before.get(e.id)!.rotation]);
    }
    close(d2.canvas.widthIn, 13.25);
  });
  it("al cambiar el alto se anclan arriba o abajo según la mitad", () => {
    let d = run(baseProject(), { type: "setPrintSetup", printSetup: setup() });
    d = run(d, { type: "addElement", element: shapeEl("top", { x: 1, y: 1, width: 1, height: 1 }) });
    d = run(d, { type: "addElement", element: shapeEl("bottom", { x: 1, y: 7, width: 1, height: 1 }) });
    const d2 = run(d, { type: "setPrintSetup", printSetup: setup({ trimWidthIn: 5, trimHeightIn: 8 }) });
    const top = d2.elements.find((e) => e.id === "top")!;
    const bottom = d2.elements.find((e) => e.id === "bottom")!;
    expect(top.y).toBe(1);
    close(bottom.y, 6);
  });
  it("deshacer y rehacer restauran datos, lienzo y posiciones", () => {
    let h = createHistory(baseProject());
    const ex = (c: Command) => {
      const r = execute(h, c, h.present.revision);
      if (!r.ok) throw new Error("fallo");
      h = r.history;
    };
    ex({ type: "setPrintSetup", printSetup: setup() });
    ex({ type: "addElement", element: shapeEl("f", { x: 8, y: 1 }) });
    ex({ type: "setPrintSetup", printSetup: setup({ pageCount: 500 }) });
    const moved = h.present;
    const u = undo(h);
    if (!u.ok) throw new Error();
    expect(u.history.present.printSetup?.pageCount).toBe(300);
    expect(u.history.present.elements[0]!.x).toBe(8);
    close(u.history.present.canvas.widthIn, 13);
    const r = redo(u.history);
    if (!r.ok) throw new Error();
    expect(r.history.present.printSetup?.pageCount).toBe(500);
    expect(r.history.present.elements[0]!.x).toBeCloseTo(moved.elements[0]!.x, 9);
  });
  it("repositionElements no modifica los elementos que no se mueven", () => {
    const a = kdpLayout(setup());
    const els = [shapeEl("b", { x: 1, y: 1 })];
    expect(repositionElements(els, a, a)[0]).toBe(els[0]);
  });
});

describe("revisión de la cubierta", () => {
  const kdp = (els: Project["elements"], over: Partial<PrintSetup> = {}): Project => {
    let d = run(baseProject(), { type: "setPrintSetup", printSetup: setup(over) });
    for (const e of els) d = run(d, { type: "addElement", element: e });
    return d;
  };
  it("sin cubierta KDP no hay revisión", () => {
    expect(kdpReview(baseProject())).toBeNull();
  });
  it("texto dentro de las zonas seguras: sin avisos", () => {
    const d = kdp([textEl("t1", { x: 1, y: 1, width: 3, height: 1 }), textEl("t2", { x: 8, y: 1, width: 3, height: 1 })]);
    expect(kdpReview(d)!.issues).toEqual([]);
  });
  it("texto fuera de la zona segura se identifica", () => {
    const d = kdp([textEl("t1", { x: 0.2, y: 1, width: 3, height: 1 }), textEl("t2", { x: 8, y: 8.6, width: 3, height: 0.5 })]);
    expect(kdpReview(d)!.issues).toEqual([{ kind: "text_outside_safe", elementId: "t1" }, { kind: "text_outside_safe", elementId: "t2" }]);
  });
  it("texto a justo 0,125 in del corte es válido (límite)", () => {
    const d = kdp([textEl("t1", { x: 0.25, y: 0.25, width: 3, height: 1 })]);
    expect(kdpReview(d)!.issues).toEqual([]);
  });
  it("texto de portada que invade el lomo cruza el pliegue", () => {
    const d = kdp([textEl("t1", { x: 6.5, y: 1, width: 3, height: 1 })]);
    // centro en 8: portada; invade el lomo
    expect(kdpReview(d)!.issues).toEqual([{ kind: "text_over_fold", elementId: "t1" }]);
  });
  it("texto de lomo: inválido con menos de 79 páginas, válido con 79 y dentro del margen", () => {
    const lomo = (pages: number) => kdp([textEl("s", { x: 6.15, y: 1, width: 0.1, height: 5 })], { pageCount: pages, paperAndInk: "bw-white" });
    expect(kdpReview(lomo(78))!.issues).toEqual([{ kind: "spine_text_invalid", elementId: "s", reason: "too_few_pages" }]);
    // 79 págs: lomo 0,177908 → útil 0,0529 in; el texto de 0,1 in no cabe
    expect(kdpReview(lomo(79))!.issues).toEqual([{ kind: "spine_text_invalid", elementId: "s", reason: "outside_spine_safe" }]);
    const ok = kdp([textEl("s", { x: 6.2, y: 1, width: 0.5, height: 5 })]);
    expect(kdpReview(ok)!.issues).toEqual([]);
  });
  it("texto de lomo girado se mide con su caja envolvente", () => {
    const e = textEl("s", { x: 5.5, y: 4.5, width: 4, height: 0.4, rotation: 90 });
    const b = rotatedBounds(e);
    close(b.width, 0.4);
    close(b.height, 4);
    const d = kdp([e]);
    expect(kdpReview(d)!.issues).toEqual([]);
  });
  it("fondo que no cubre el sangrado", () => {
    let d = kdp([]);
    d = { ...d, assets: [{ id: "a", kind: "image", mimeType: "image/png", metadata: { widthPx: 100, heightPx: 100 } }], canvas: { ...d.canvas, background: { assetId: "a" } } };
    expect(backgroundCoversBleed(d)).toBe(true);
    d = { ...d, canvas: { ...d.canvas, backgroundFit: "contain" } };
    expect(backgroundCoversBleed(d)).toBe(false);
    expect(kdpReview(d)!.issues).toContainEqual({ kind: "background_not_covering_bleed" });
    d = { ...d, canvas: { ...d.canvas, backgroundFit: "fill" } };
    expect(backgroundCoversBleed(d)).toBe(true);
    // contain con la misma proporción que el lienzo sí cubre
    d = { ...d, assets: [{ id: "a", kind: "image", mimeType: "image/png", metadata: { widthPx: 1300, heightPx: 925 } }], canvas: { ...d.canvas, backgroundFit: "contain" } };
    expect(backgroundCoversBleed(d)).toBe(true);
  });
  it("texto sobre el código de barras", () => {
    const l = kdpLayout(setup());
    const d = kdp([textEl("t", { x: l.barcode.x + 0.2, y: l.barcode.y + 0.2, width: 1, height: 0.5 })]);
    expect(kdpReview(d)!.issues).toContainEqual({ kind: "barcode_overlap", elementId: "t" });
  });
  it("los elementos ocultos no se revisan y los que quedan fuera del lienzo se avisan tras recalcular", () => {
    const d = kdp([textEl("h", { x: 0, y: 0, width: 1, height: 1, visible: false }), shapeEl("s", { x: 12.5, y: 0.2, width: 0.4, height: 8.8 })]);
    expect(kdpReview(d)!.issues).toEqual([]);
    // con un corte más bajo la forma, que no se deforma, deja de caber
    const small = run(d, { type: "setPrintSetup", printSetup: setup({ trimWidthIn: 5, trimHeightIn: 8 }) });
    expect(elementsOutsideCanvas(small)).toEqual(["s"]);
    expect(kdpReview(small)!.issues).toContainEqual({ kind: "outside_canvas", elementId: "s" });
  });
  it("lienzo que ya no coincide con los datos de impresión", () => {
    const d = run(kdp([]), { type: "setCanvas", widthIn: 10, heightIn: 9.25 });
    expect(kdpReview(d)!.issues).toContainEqual({ kind: "canvas_mismatch" });
  });
});
