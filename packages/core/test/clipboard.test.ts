import { describe, expect, it } from "vitest";
import { applyCommand, createHistory, createProject, elementAssetIds, execute, preparePaste, undo, PASTE_OFFSET_IN, type Asset, type Command, type Project } from "../src/index.js";
import { baseProject, imageEl, shapeEl, textEl } from "./fixtures.js";

const ok = (p: Project, c: Command) => {
  const r = applyCommand(p, c, p.revision);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.doc;
};
const img = (id: string): Asset => ({ id, kind: "image", mimeType: "image/png", metadata: {} });
const ids = () => { let n = 0; return () => `n${++n}`; };

describe("elementAssetIds", () => {
  it("recoge textura, máscara y fuente sin repetir", () => {
    const doc: Project = { ...baseProject(), assets: [{ id: "f1", kind: "font", mimeType: "font/ttf", metadata: { family: "Roboto Serif" } }] };
    const t = textEl("t", {
      texture: { assetId: "tx" }, mask: { assetId: "tx" } as never,
      runs: [{ ...textEl("x").runs[0]!, fontFamily: "Roboto Serif" }],
    });
    expect(elementAssetIds(doc, t)).toEqual(["tx", "f1"]);
  });
  it("imagen y forma", () => {
    const doc = baseProject();
    expect(elementAssetIds(doc, imageEl("i", "a1"))).toEqual(["a1"]);
    expect(elementAssetIds(doc, shapeEl("s"))).toEqual([]);
  });
});

describe("preparePaste", () => {
  it("desplaza en el mismo proyecto y conserva en otro", () => {
    const target = baseProject();
    const clip = { sourceProjectId: "p1", elements: [shapeEl("a", { x: 1, y: 2 })], assets: [] };
    const same = preparePaste(target, clip, ids());
    expect(same.elements[0]).toMatchObject({ id: "n1", x: 1 + PASTE_OFFSET_IN, y: 2 + PASTE_OFFSET_IN });
    const other = preparePaste(createProject({ id: "p2" }), clip, ids());
    expect(other.elements[0]).toMatchObject({ x: 1, y: 2 });
  });
  it("centra una capa fuera del lienzo conservando tamaño y giro", () => {
    const clip = { sourceProjectId: "p2", elements: [shapeEl("a", { x: 10, y: 10, width: 2, height: 1, rotation: 30 })], assets: [] };
    const e = preparePaste(baseProject(), clip, ids()).elements[0]!;
    expect(e.x + e.width / 2).toBeCloseTo(3);
    expect(e.y + e.height / 2).toBeCloseTo(4.5);
    expect([e.width, e.height, e.rotation]).toEqual([2, 1, 30]);
  });
  it("no incluye recursos que el destino ya tiene", () => {
    const target: Project = { ...baseProject(), assets: [img("a")] };
    const clip = { sourceProjectId: "p2", elements: [shapeEl("s")], assets: [img("a"), img("b")] };
    expect(preparePaste(target, clip, ids()).assets.map((a) => a.id)).toEqual(["b"]);
  });
});

describe("pasteElements", () => {
  it("añade capas arriba y el recurso una sola vez", () => {
    let p = ok(baseProject(), { type: "addElement", element: shapeEl("z") });
    const cmd: Command = { type: "pasteElements", elements: [imageEl("a", "im"), imageEl("b", "im")], assets: [img("im")] };
    p = ok(p, cmd);
    expect(p.elements.map((e) => [e.id, e.zIndex])).toEqual([["z", 0], ["a", 1], ["b", 2]]);
    expect(p.assets.map((a) => a.id)).toEqual(["im"]);
    const again = ok(p, { ...cmd, elements: [imageEl("c", "im")] });
    expect(again.assets).toHaveLength(1);
  });
  it("deshace en un solo paso", () => {
    const h = createHistory(baseProject());
    const r = execute(h, { type: "pasteElements", elements: [imageEl("a", "im"), shapeEl("b")], assets: [img("im")] }, h.present.revision);
    if (!r.ok) throw new Error("x");
    const u = undo(r.history);
    if (!u.ok) throw new Error("x");
    expect(u.history.present.elements).toEqual([]);
    expect(u.history.present.assets).toEqual([]);
  });
  it("rechaza una lista vacía", () => {
    expect(applyCommand(baseProject(), { type: "pasteElements", elements: [], assets: [] }, 0).ok).toBe(false);
  });
});
