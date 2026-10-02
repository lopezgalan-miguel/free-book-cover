import { describe, expect, it } from "vitest";
import { applyCommand, canRedo, canUndo, createHistory, execute, redo, undo, type Command, type Project } from "../src/index.js";
import { baseProject, imageEl, shapeEl, textEl } from "./fixtures.js";

const ok = (p: Project, c: Command) => {
  const r = applyCommand(p, c, p.revision);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.doc;
};

describe("applyCommand", () => {
  it("añade, apila en la cima e incrementa revision sin mutar la entrada", () => {
    const p0 = baseProject();
    const snap = structuredClone(p0);
    const p1 = ok(p0, { type: "addElement", element: shapeEl("a", { zIndex: 99 }) });
    const p2 = ok(p1, { type: "addElement", element: textEl("b") });
    expect(p0).toEqual(snap);
    expect(p2.revision).toBe(2);
    expect(p2.elements.map((e) => [e.id, e.zIndex])).toEqual([["a", 0], ["b", 1]]);
  });
  it("updateElement fusiona props permitidas y valida", () => {
    let p = ok(baseProject(), { type: "addElement", element: textEl("t") });
    p = ok(p, { type: "updateElement", id: "t", props: { x: 2, curvature: 50, shadow: { on: true, intensity: 70 } } });
    expect(p.elements[0]).toMatchObject({ x: 2, curvature: 50, shadow: { on: true, intensity: 70 } });
    for (const props of [{ curvature: 500 }, { id: "z" }, { type: "shape" }, { zIndex: 5 }, { fill: "#000000" }] as never[]) {
      const r = applyCommand(p, { type: "updateElement", id: "t", props }, p.revision);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe("invalid");
    }
  });
  it("updateElement puede quitar un campo opcional con undefined", () => {
    let p = ok(baseProject(), { type: "addAsset", asset: { id: "a", kind: "image", mimeType: "image/png", metadata: {} } });
    p = ok(p, { type: "addElement", element: textEl("t", { texture: { assetId: "a" } }) });
    p = ok(p, { type: "updateElement", id: "t", props: { texture: undefined } });
    expect("texture" in p.elements[0]!).toBe(false);
  });
  it("no_encontrado para id inexistente", () => {
    const p = baseProject();
    for (const c of [
      { type: "updateElement", id: "x", props: { x: 1 } },
      { type: "removeElement", id: "x" },
      { type: "reorderElement", id: "x", toIndex: 0 },
      { type: "removeAsset", id: "x" },
    ] as Command[]) {
      expect(applyCommand(p, c, 0)).toEqual({ ok: false, error: { kind: "not_found", id: "x" } });
    }
  });
  it("elimina elementos", () => {
    let p = ok(baseProject(), { type: "addElement", element: shapeEl("a") });
    p = ok(p, { type: "removeElement", id: "a" });
    expect(p.elements).toEqual([]);
  });
  it("reordena la pila y normaliza zIndex", () => {
    let p = baseProject();
    for (const id of ["a", "b", "c"]) p = ok(p, { type: "addElement", element: shapeEl(id) });
    p = ok(p, { type: "reorderElement", id: "c", toIndex: 0 });
    const z = (id: string) => p.elements.find((e) => e.id === id)!.zIndex;
    expect([z("c"), z("a"), z("b")]).toEqual([0, 1, 2]);
    p = ok(p, { type: "reorderElement", id: "c", toIndex: 99 });
    expect([z("a"), z("b"), z("c")]).toEqual([0, 1, 2]);
    p = ok(p, { type: "reorderElement", id: "b", toIndex: -5 });
    expect(z("b")).toBe(0);
    const bad = applyCommand(p, { type: "reorderElement", id: "b", toIndex: NaN }, p.revision);
    expect(bad.ok).toBe(false);
  });
  it("setCanvas y setBackground", () => {
    let p = ok(baseProject(), { type: "setCanvas", widthIn: 8.5, heightIn: 11 });
    p = ok(p, { type: "setBackground", background: "#26231d" });
    expect(p.canvas).toEqual({ widthIn: 8.5, heightIn: 11, background: "#26231d" });
    expect(applyCommand(p, { type: "setCanvas", widthIn: 0, heightIn: 1 }, p.revision).ok).toBe(false);
    expect(applyCommand(p, { type: "setBackground", background: { assetId: "no" } }, p.revision).ok).toBe(false);
  });
  it("assets: referencias protegidas y duplicados", () => {
    const asset = { id: "a", kind: "image" as const, mimeType: "image/png", metadata: {} };
    let p = ok(baseProject(), { type: "addAsset", asset });
    expect(applyCommand(p, { type: "addAsset", asset }, p.revision).ok).toBe(false);
    p = ok(p, { type: "addElement", element: imageEl("i", "a") });
    expect(applyCommand(p, { type: "removeAsset", id: "a" }, p.revision).ok).toBe(false);
    p = ok(p, { type: "removeElement", id: "i" });
    expect(ok(p, { type: "removeAsset", id: "a" }).assets).toEqual([]);
  });
  it("addElement duplicado o con referencia rota es invalid y no cambia nada", () => {
    const p = ok(baseProject(), { type: "addElement", element: shapeEl("a") });
    const dup = applyCommand(p, { type: "addElement", element: shapeEl("a") }, p.revision);
    expect(dup.ok).toBe(false);
    const broken = applyCommand(p, { type: "addElement", element: imageEl("i", "ghost") }, p.revision);
    expect(broken.ok).toBe(false);
    expect(p.elements).toHaveLength(1);
  });
  it("revisión obsoleta o futura: conflicto recuperable con la revisión actual", () => {
    const p = ok(baseProject(), { type: "addElement", element: shapeEl("a") });
    for (const exp of [0, 5]) {
      expect(applyCommand(p, { type: "removeElement", id: "a" }, exp)).toEqual({
        ok: false, error: { kind: "conflict", expectedRevision: exp, actualRevision: 1 },
      });
    }
    // recuperable: reintentar con la revisión actual funciona
    expect(applyCommand(p, { type: "removeElement", id: "a" }, 1).ok).toBe(true);
  });
  it("no comparte referencias con el comando de entrada", () => {
    const el = shapeEl("a");
    const p = ok(baseProject(), { type: "addElement", element: el });
    el.fill = "#ffffff";
    expect((p.elements[0] as { fill: string }).fill).toBe("#000000");
  });
});

describe("historial undo/redo", () => {
  const run = () => {
    let h = createHistory(baseProject());
    for (const id of ["a", "b"]) {
      const r = execute(h, { type: "addElement", element: shapeEl(id) }, h.present.revision);
      if (!r.ok) throw new Error("x");
      h = r.history;
    }
    return h;
  };
  it("deshace y rehace restaurando contenido con revisión monótona", () => {
    let h = run();
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);
    const u = undo(h);
    if (!u.ok) throw new Error("x");
    h = u.history;
    expect(h.present.elements.map((e) => e.id)).toEqual(["a"]);
    expect(h.present.revision).toBe(3);
    expect(canRedo(h)).toBe(true);
    const r = redo(h);
    if (!r.ok) throw new Error("x");
    expect(r.history.present.elements.map((e) => e.id)).toEqual(["a", "b"]);
    expect(r.history.present.revision).toBe(4);
  });
  it("una edición nueva descarta el futuro", () => {
    let h = run();
    const u = undo(h); if (!u.ok) throw new Error("x"); h = u.history;
    const e = execute(h, { type: "removeElement", id: "a" }, h.present.revision);
    if (!e.ok) throw new Error("x");
    expect(canRedo(e.history)).toBe(false);
  });
  it("errores: nada que deshacer/rehacer, conflicto y comando inválido sin tocar el historial", () => {
    const h = run();
    expect(undo(createHistory(baseProject())).ok).toBe(false);
    expect(redo(h).ok).toBe(false);
    const c = undo(h, 0);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error.kind).toBe("conflict");
    expect(redo(h, 0).ok).toBe(false);
    const bad = execute(h, { type: "removeElement", id: "zz" }, h.present.revision);
    expect(bad.ok).toBe(false);
    expect(h.past).toHaveLength(2);
  });
  it("una edición con revisión anterior a un undo sigue siendo conflicto", () => {
    let h = run();
    const staleRev = h.present.revision; // 2
    const u = undo(h); if (!u.ok) throw new Error("x"); h = u.history;
    const e = execute(h, { type: "removeElement", id: "a" }, staleRev);
    expect(e.ok).toBe(false);
  });
  it("respeta el límite de la pila", () => {
    let h = createHistory(baseProject(), 2);
    for (const id of ["a", "b", "c", "d"]) {
      const r = execute(h, { type: "addElement", element: shapeEl(id) }, h.present.revision);
      if (!r.ok) throw new Error("x");
      h = r.history;
    }
    expect(h.past).toHaveLength(2);
  });
});
