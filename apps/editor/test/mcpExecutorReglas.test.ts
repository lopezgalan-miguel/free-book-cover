import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Element, ToolOutcome } from "@free-book-cover/core";
import { executeTool, type ExecutorDeps } from "../src/mcp/executor";
import { createEditorStore, type EditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

let n = 0;
let store: EditorStore;
let deps: ExecutorDeps;

beforeEach(async () => {
  const storage = await openStorage(`mcp-reglas-${++n}`);
  let i = 0;
  store = createEditorStore({ storage, newId: () => `id${++i}`, downloadParts: vi.fn() });
  await store.init();
  // Medidor fijo: la altura medida debe ser la del medidor, no la provisional.
  deps = { store, authorizedProjectId: () => store.getState().history.present.id, measure: () => ((t: string) => t.length * 0.1) as never, makeThumbnail: async () => null };
});

const doc = () => store.getState().history.present;
const run = (tool: Parameters<typeof executeTool>[1], args: unknown) => executeTool(deps, tool, args);
const msgs = (o: ToolOutcome) => JSON.stringify((o as { error: unknown }).error);

describe("update_element_style: propiedades de otro tipo", () => {
  it("rechaza fill en un texto y fontFamily en una forma con el mensaje de siempre", async () => {
    const t = await run("add_text_element", { projectId: doc().id, expectedRevision: doc().revision, text: "Hola" });
    const tid = (t as { data: { elementId: string } }).data.elementId;
    const a = await run("update_element_style", { projectId: doc().id, expectedRevision: doc().revision, elementId: tid, style: { fill: "#ffffff" } });
    expect(a.ok).toBe(false);
    expect(msgs(a)).toContain("style.fill: no aplicable a un elemento de tipo text");

    store.dispatch({ type: "addElement", element: { id: "s1", type: "shape", shape: "rect", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0, visible: true, fill: "#000000" } as Element });
    const b = await run("update_element_style", { projectId: doc().id, expectedRevision: doc().revision, elementId: "s1", style: { fontFamily: "Lora", fill: "#ffffff" } });
    expect(b.ok).toBe(false);
    expect(msgs(b)).toContain("style.fontFamily: no aplicable a un elemento de tipo shape");
    expect(msgs(b)).not.toContain("style.fill");
    expect(doc().elements.find((e) => e.id === "s1")).toMatchObject({ fill: "#000000" });
  });
});

describe("add_text_element: elemento por defecto", () => {
  it("coincide con el literal que construía el executor antes de mover las reglas a core", async () => {
    const c = doc().canvas;
    const r = await run("add_text_element", { projectId: doc().id, expectedRevision: doc().revision, text: "Título" });
    const id = (r as { data: { elementId: string } }).data.elementId;
    const el = doc().elements.find((e) => e.id === id) as Element;
    expect(el).toMatchObject({
      type: "text", x: (c.widthIn - c.widthIn / 2) / 2, y: c.heightIn * 0.65, width: c.widthIn / 2, rotation: 0, zIndex: expect.any(Number), visible: true,
      align: "center", lineHeight: 1.2, letterSpacing: 0.02, shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#1a1712" }, curvature: 0,
      runs: [{ text: "Título", fontFamily: "Lora", fontSizePt: 36, weight: 500, italic: false, underline: false, uppercase: false, color: "#f4efe6" }],
    });
    expect(el.height).not.toBe(1);
  });
});
