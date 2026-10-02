import { describe, expect, it } from "vitest";
import { canUndo, createHistory, endMerge, execute, redo, undo, type Command, type History } from "../src/index.js";
import { baseProject, textEl } from "./fixtures.js";

const run = (h: History, c: Command, merge?: { key: string; at: number; windowMs?: number }) => {
  const r = execute(h, c, h.present.revision, merge);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.history;
};
const setX = (x: number): Command => ({ type: "updateElement", id: "t", props: { x } });
const withText = () => run(createHistory(baseProject()), { type: "addElement", element: textEl("t") });

describe("fusión de gestos en el historial", () => {
  it("comandos consecutivos con la misma clave dentro de la ventana son un solo paso", () => {
    let h = withText();
    h = run(h, setX(5), { key: "t:x", at: 0 });
    h = run(h, setX(2), { key: "t:x", at: 200 });
    h = run(h, setX(3), { key: "t:x", at: 400 });
    expect(h.past).toHaveLength(2);
    expect(h.present.elements[0]).toMatchObject({ x: 3 });
    const u = undo(h);
    expect(u.ok && u.history.present.elements[0]).toMatchObject({ x: 1 });
  });
  it("deshacer vuelve al estado previo al gesto y rehacer al final del gesto", () => {
    let h = withText();
    const before = h.present.elements[0]!;
    h = run(h, setX(1), { key: "t:x", at: 0 });
    h = run(h, setX(2), { key: "t:x", at: 100 });
    const u = undo(h);
    if (!u.ok) throw new Error("undo");
    expect(u.history.present.elements[0]).toEqual(before);
    const r = redo(u.history);
    expect(r.ok && r.history.present.elements[0]).toMatchObject({ x: 2 });
  });
  it("otra clave, fuera de ventana o tras endMerge abren paso nuevo", () => {
    let h = withText();
    h = run(h, setX(1), { key: "a", at: 0 });
    h = run(h, setX(2), { key: "b", at: 10 });
    expect(h.past).toHaveLength(3);
    h = run(h, setX(3), { key: "b", at: 5000 });
    expect(h.past).toHaveLength(4);
    h = endMerge(h);
    h = run(h, setX(4), { key: "b", at: 5010 });
    expect(h.past).toHaveLength(5);
    h = run(h, setX(5));
    h = run(h, setX(6), { key: "b", at: 5020 });
    expect(h.past).toHaveLength(7);
  });
  it("deshacer corta la fusión y mantiene las revisiones monótonas y la atomicidad", () => {
    let h = withText();
    h = run(h, setX(1), { key: "k", at: 0 });
    const rev = h.present.revision;
    const u = undo(h);
    if (!u.ok) throw new Error("undo");
    expect(u.history.merge).toBeUndefined();
    const bad = execute(u.history, { type: "updateElement", id: "nada", props: { x: 1 } }, u.history.present.revision, { key: "k", at: 10 });
    expect(bad.ok).toBe(false);
    expect(u.history.present.revision).toBe(rev + 1);
    // Revisión esperada obsoleta: conflicto también al fusionar.
    const stale = execute(h, setX(2), rev - 1, { key: "k", at: 20 });
    expect(stale.ok).toBe(false);
  });
  it("la fusión respeta el límite de pasos y vacía rehacer", () => {
    let h = createHistory(baseProject(), 3);
    h = run(h, { type: "addElement", element: textEl("t") });
    for (let i = 0; i < 50; i++) h = run(h, setX(i), { key: "k", at: i });
    expect(h.past).toHaveLength(2);
    expect(canUndo(h)).toBe(true);
    expect(h.future).toHaveLength(0);
  });
  it("setName: nombra, recorta, valida longitud y se deshace", () => {
    let h = createHistory(baseProject());
    h = run(h, { type: "setName", name: "  Mi portada  " });
    expect(h.present.name).toBe("Mi portada");
    const bad = execute(h, { type: "setName", name: "x".repeat(121) }, h.present.revision);
    expect(bad.ok).toBe(false);
    const u = undo(h);
    expect(u.ok && u.history.present.name).toBe(baseProject().name);
    const r = u.ok ? redo(u.history) : u;
    expect(r.ok && r.history.present.name).toBe("Mi portada");
  });
});
