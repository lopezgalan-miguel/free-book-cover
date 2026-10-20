import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toolErrorSchema, type TextElement, type ToolOutcome } from "@free-book-cover/core";
import { executeTool, type ExecutorDeps } from "../src/mcp/executor";
import { createEditorStore, type EditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

let n = 0;
let store: EditorStore;
let deps: ExecutorDeps;

beforeEach(async () => {
  const storage = await openStorage(`mcp-runs-${++n}`);
  let i = 0;
  store = createEditorStore({ storage, newId: () => `id${++i}`, downloadParts: vi.fn() });
  await store.init();
  deps = { store, authorizedProjectId: () => store.getState().history.present.id, measure: () => null, makeThumbnail: async () => null };
});

const doc = () => store.getState().history.present;
const run = (tool: Parameters<typeof executeTool>[1], args: unknown) => executeTool(deps, tool, args);
const ok = (o: ToolOutcome) => {
  expect(o.ok).toBe(true);
  return (o as { data: any }).data;
};
const err = (o: ToolOutcome) => {
  expect(o.ok).toBe(false);
  return toolErrorSchema.parse((o as { error: unknown }).error);
};
const base = () => ({ projectId: doc().id, expectedRevision: doc().revision });
const textEl = (id: string) => doc().elements.find((e) => e.id === id) as TextElement;

describe("runs por MCP", () => {
  it("add_text_element: el estilo del elemento es el valor por defecto de cada fragmento", async () => {
    const { elementId } = ok(await run("add_text_element", { ...base(), italic: true, runs: [{ text: "La segunda entrega de " }, { text: "Susurros de terror", italic: false }] }));
    const el = textEl(elementId);
    expect(el.runs.map((r) => [r.text, r.italic])).toEqual([["La segunda entrega de ", true], ["Susurros de terror", false]]);
    const s = ok(await run("get_canvas_state", {})).elements[0];
    expect(s.runs).toHaveLength(2);
    expect(s.text).toBe("La segunda entrega de Susurros de terror");
  });

  it("text y runs a la vez, o ninguno: invalid_params", async () => {
    expect(err(await run("add_text_element", { ...base(), text: "a", runs: [{ text: "a" }] })).kind).toBe("invalid_params");
    expect(err(await run("add_text_element", base())).kind).toBe("invalid_params");
  });

  it("una cara inexistente en un fragmento se rechaza sin cambiar la revisión", async () => {
    const rev = doc().revision;
    const e = err(await run("add_text_element", { ...base(), runs: [{ text: "x", fontFamily: "EB Garamond", weight: 500, italic: true }] }));
    expect(e.kind).toBe("invalid_params");
    expect(JSON.stringify(e)).toContain("EB Garamond");
    expect(JSON.stringify(e)).toContain("disponibles");
    expect(doc().revision).toBe(rev);
  });

  it("update_element_style con runs: fragmentos de 20 pt, el segundo rojo, y la caja se recalcula", async () => {
    const { elementId } = ok(await run("add_text_element", { ...base(), text: "Título" }));
    const h = textEl(elementId).height;
    const out = ok(await run("update_element_style", { ...base(), elementId, style: { runs: [{ text: "A" }, { text: "B", color: "#ff0000" }], fontSizePt: 20 } }));
    const el = textEl(elementId);
    expect(el.runs.map((r) => [r.text, r.fontSizePt, r.color])).toEqual([["A", 20, el.runs[0]!.color], ["B", 20, "#ff0000"]]);
    expect(el.height).not.toBe(h);
    expect(out.element.runs).toHaveLength(2);
  });

  it("un texto de un solo fragmento no lleva runs en el resumen", async () => {
    ok(await run("add_text_element", { ...base(), text: "Hola" }));
    expect(ok(await run("get_canvas_state", {})).elements[0].runs).toBeUndefined();
  });

  it("runs respeta los límites de text: todos vacíos o más de 5000 en total son invalid_params", async () => {
    const { elementId } = ok(await run("add_text_element", { ...base(), text: "Hola" }));
    const rev = doc().revision;
    const long = [{ text: "a".repeat(3000) }, { text: "b".repeat(2001) }];
    expect(err(await run("add_text_element", { ...base(), runs: [{ text: "" }, { text: "" }] })).kind).toBe("invalid_params");
    expect(err(await run("add_text_element", { ...base(), runs: long })).kind).toBe("invalid_params");
    expect(err(await run("update_element_style", { ...base(), elementId, style: { runs: [{ text: "" }] } })).kind).toBe("invalid_params");
    expect(err(await run("update_element_style", { ...base(), elementId, style: { runs: long } })).kind).toBe("invalid_params");
    expect(doc().revision).toBe(rev);
    ok(await run("add_text_element", { ...base(), runs: [{ text: "a".repeat(3000) }, { text: "b".repeat(2000) }] }));
  });

  it("update_element_style: un fragmento de otra familia sin peso toma el publicado más próximo, como al crear", async () => {
    const { elementId } = ok(await run("add_text_element", { ...base(), text: "Hola" }));
    ok(await run("update_element_style", { ...base(), elementId, style: { runs: [{ text: "B", fontFamily: "Bebas Neue" }] } }));
    expect(textEl(elementId).runs.map((r) => [r.fontFamily, r.weight])).toEqual([["Bebas Neue", 400]]);
    const rev = doc().revision;
    const e = err(await run("update_element_style", { ...base(), elementId, style: { runs: [{ text: "x", fontFamily: "EB Garamond", weight: 500, italic: true }] } }));
    expect(e.kind).toBe("invalid_params");
    expect(doc().revision).toBe(rev);
  });
});
