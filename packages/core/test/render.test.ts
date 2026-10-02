import { describe, expect, it } from "vitest";
import { applyCommand, dpiReport, drawCenter, renderDocument, type Asset, type Project } from "../src/index.js";
import { baseProject, imageEl, shapeEl, textEl } from "./fixtures.js";

const asset = (id: string, w: number, h: number): Asset => ({ id, kind: "image", mimeType: "image/png", metadata: { widthPx: w, heightPx: h } });
function doc(over: Partial<Project> = {}): Project {
  return { ...baseProject(), assets: [asset("a1", 1800, 2700), asset("a2", 900, 1350)], ...over };
}

describe("renderDocument", () => {
  it("devuelve el tamaño en px según pxPerInch y rechaza escalas inválidas", () => {
    const r = renderDocument(doc(), { pxPerInch: 300 });
    expect([r.widthPx, r.heightPx]).toEqual([1800, 2700]);
    expect(() => renderDocument(doc(), { pxPerInch: 0 })).toThrow(RangeError);
  });

  it("ordena por zIndex, omite invisibles y es determinista", () => {
    const d = doc({ elements: [shapeEl("s1", { zIndex: 2 }), textEl("t1", { zIndex: 0 }), shapeEl("s2", { zIndex: 1, visible: false })] });
    const r = renderDocument(d, { pxPerInch: 100 });
    expect(r.items.map((i) => i.id)).toEqual(["t1", "s1"]);
    expect(JSON.stringify(renderDocument(d, { pxPerInch: 100 }))).toBe(JSON.stringify(r));
  });

  it("mismo encuadre a cualquier escala: la vista previa es la exportación reducida", () => {
    const d = doc({
      canvas: { widthIn: 6, heightIn: 9, background: { assetId: "a1" }, backgroundFit: "cover", backgroundPos: { x: 0.3, y: 0.7 } },
      elements: [imageEl("i1", "a2", { x: 1, y: 2, width: 3, height: 2, fit: "contain", rotation: 15, crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } })],
    });
    const full = renderDocument(d, { pxPerInch: 300 });
    const prev = renderDocument(d, { pxPerInch: 60 });
    const k = 60 / 300;
    const scaleRect = (r: { x: number; y: number; width: number; height: number }) => ({ x: r.x * k, y: r.y * k, width: r.width * k, height: r.height * k });
    if (full.background.kind !== "image" || prev.background.kind !== "image") throw new Error("fondo");
    expect(prev.background.draw!.src).toEqual(full.background.draw!.src); // mismos píxeles de origen
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(prev.background.draw!.dest[key]).toBeCloseTo(scaleRect(full.background.draw!.dest)[key], 9);
    }
    const [fi, pi] = [full.items[0]!, prev.items[0]!];
    if (fi.kind !== "image" || pi.kind !== "image") throw new Error("imagen");
    expect(pi.draw!.src).toEqual(fi.draw!.src);
    expect(pi.draw!.dpi).toBeCloseTo(fi.draw!.dpi!, 9); // los ppp efectivos no dependen de la escala
    expect(pi.draw!.dest.x).toBeCloseTo(fi.draw!.dest.x * k, 9);
    expect(pi.rotation).toBe(15);
  });

  it("recorte, contain y cover producen las regiones de origen esperadas", () => {
    const d = doc({ elements: [imageEl("i1", "a1", { width: 3, height: 3, fit: "cover", crop: { x: 0, y: 0, width: 1, height: 0.5 } })] });
    const it = renderDocument(d, { pxPerInch: 100 }).items[0]!;
    if (it.kind !== "image") throw new Error();
    // región 1800×1350 sobre caja cuadrada: se ve 1350×1350 de origen
    expect(it.draw!.src.width).toBeCloseTo(1350, 6);
    expect(it.draw!.src.height).toBeCloseTo(1350, 6);
  });

  it("calcula ppp efectivos y avisa por debajo de 300", () => {
    const ok = doc({ canvas: { widthIn: 6, heightIn: 9, background: { assetId: "a1" } } });
    expect(dpiReport(ok)).toEqual([{ id: "background", dpi: 300, lowDpi: false }]);
    const low = doc({ canvas: { widthIn: 6, heightIn: 9, background: { assetId: "a2" } }, elements: [imageEl("i1", "a2", { width: 3, height: 4.5 })] });
    const rep = dpiReport(low);
    expect(rep.find((e) => e.id === "background")).toMatchObject({ dpi: 150, lowDpi: true });
    expect(rep.find((e) => e.id === "i1")).toMatchObject({ dpi: 300, lowDpi: false });
  });

  it("el recorte y el ajuste cambian los ppp efectivos (escalar no corrige origen)", () => {
    // 900×1350 px en 6×9 in con cover: 150 ppp; en 12×18 sería 75
    const d = doc({ canvas: { widthIn: 12, heightIn: 18, background: { assetId: "a2" } } });
    expect(dpiReport(d)[0]!.dpi).toBeCloseTo(75, 9);
  });

  it("sin dimensiones conocidas no hay dibujo ni ppp (sin inventar)", () => {
    const d = doc({ assets: [{ id: "a1", kind: "image", mimeType: "image/png", metadata: {} }], elements: [imageEl("i1", "a1")] });
    const it = renderDocument(d, { pxPerInch: 50 }).items[0]!;
    expect(it.kind === "image" && it.draw).toBeNull();
    expect(dpiReport(d)).toEqual([]);
  });

  it("drawCenter gira el destino alrededor del centro de la caja", () => {
    const item = { box: { x: 0, y: 0, width: 100, height: 100 }, rotation: 90 };
    const c = drawCenter(item, { x: 0, y: 0, width: 100, height: 50 }); // centro (50,25) -> gira 90º en torno a (50,50)
    expect(c.x).toBeCloseTo(75, 9);
    expect(c.y).toBeCloseTo(50, 9);
  });
});

describe("resizeCanvas (políticas) vía applyCommand", () => {
  const base = (): Project => doc({
    canvas: { widthIn: 6, heightIn: 9, background: { assetId: "a1" } },
    elements: [imageEl("i1", "a2", { x: 1, y: 1, width: 4, height: 6 }), imageEl("i2", "a2", { x: 0, y: 0, width: 2, height: 2 })],
  });
  const run = (policy: "crop" | "fit" | "stretch", targets = { background: true, elementIds: ["i1"] }) => {
    const r = applyCommand(base(), { type: "resizeCanvas", widthIn: 9, heightIn: 9, policy, targets }, 0);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return r.doc;
  };

  it.each([["crop", "cover"], ["fit", "contain"], ["stretch", "fill"]] as const)("%s -> fondo y objetivo con ajuste %s", (policy, fit) => {
    const d = run(policy);
    expect(d.canvas).toMatchObject({ widthIn: 9, heightIn: 9, backgroundFit: fit });
    const i1 = d.elements.find((e) => e.id === "i1")!;
    expect(i1).toMatchObject({ fit, x: 1.5, y: 1, width: 6, height: 6 });
    expect(d.revision).toBe(1);
  });

  it("no toca lo que no es objetivo", () => {
    const d = run("stretch");
    expect(d.elements.find((e) => e.id === "i2")).toEqual(base().elements[1]);
    const noBg = run("fit", { background: false, elementIds: [] });
    expect(noBg.canvas.backgroundFit).toBeUndefined();
  });

  it("stretch deforma, crop no: el encuadre resultante lo demuestra", () => {
    const stretched = renderDocument(run("stretch"), { pxPerInch: 100 });
    const cropped = renderDocument(run("crop"), { pxPerInch: 100 });
    if (stretched.background.kind !== "image" || cropped.background.kind !== "image") throw new Error();
    const s = stretched.background.draw!;
    const c = cropped.background.draw!;
    expect(s.src.width / s.src.height).toBeCloseTo(1800 / 2700, 9); // toda la imagen
    expect(s.dest.width / s.dest.height).toBeCloseTo(1, 9); // en caja cuadrada: deformada
    expect(c.src.width / c.src.height).toBeCloseTo(1, 9); // recortada, sin deformar
  });

  it("es atómico: id inexistente no cambia nada, y un tamaño inválido se rechaza", () => {
    const d = base();
    const bad = applyCommand(d, { type: "resizeCanvas", widthIn: 9, heightIn: 9, policy: "crop", targets: { background: true, elementIds: ["nope"] } }, 0);
    expect(bad).toEqual({ ok: false, error: { kind: "not_found", id: "nope" } });
    const huge = applyCommand(d, { type: "resizeCanvas", widthIn: 500, heightIn: 9, policy: "crop", targets: { background: false, elementIds: [] } }, 0);
    expect(huge.ok).toBe(false);
  });

  it("setBackgroundLayout valida la posición y respeta la revisión esperada", () => {
    const d = base();
    const ok = applyCommand(d, { type: "setBackgroundLayout", fit: "contain", pos: { x: 0.2, y: 0.9 } }, 0);
    expect(ok.ok && ok.doc.canvas).toMatchObject({ backgroundFit: "contain", backgroundPos: { x: 0.2, y: 0.9 } });
    expect(applyCommand(d, { type: "setBackgroundLayout", pos: { x: 2, y: 0 } }, 0).ok).toBe(false);
    expect(applyCommand(d, { type: "setBackgroundLayout", fit: "fill" }, 5).ok).toBe(false);
  });
});
