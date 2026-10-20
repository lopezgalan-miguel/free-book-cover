import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_TOOLS, toolErrorSchema, type ToolOutcome } from "@free-book-cover/core";
import { executeTool } from "../src/mcp/executor";
import { createEditorStore, type EditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

let n = 0;
let store: EditorStore;

beforeEach(async () => {
  const storage = await openStorage(`mcp-gestion-${++n}`);
  let i = 0;
  store = createEditorStore({ storage, newId: () => `id${++i}`, downloadParts: vi.fn() });
  await store.init();
});

const doc = () => store.getState().history.present;
const run = (tool: Parameters<typeof executeTool>[1], args: unknown) =>
  executeTool({ store, authorizedProjectId: () => doc().id, measure: () => null, makeThumbnail: async () => null }, tool, args);
const ok = (o: ToolOutcome) => {
  expect(o.ok).toBe(true);
  return (o as { data: any }).data;
};
const err = (o: ToolOutcome) => {
  expect(o.ok).toBe(false);
  return toolErrorSchema.parse((o as { error: unknown }).error);
};
const mut = (extra: object = {}) => ({ projectId: doc().id, expectedRevision: doc().revision, ...extra });
const addText = async (text: string) => ok(await run("add_text_element", mut({ text, y: 0 }))).elementId as string;
const order = () => [...doc().elements].sort((a, b) => a.zIndex - b.zIndex).map((e) => e.id);

describe("rename_project", () => {
  it("cambia el nombre del proyecto", async () => {
    const out = ok(await run("rename_project", mut({ name: "  Mi portada  " })));
    MCP_TOOLS.rename_project.output.parse(out);
    expect(out).toMatchObject({ name: "Mi portada", saved: true });
    expect(ok(await run("get_canvas_state", { projectId: doc().id })).name).toBe("Mi portada");
  });
  it("121 caracteres: invalid_params; revisión obsoleta: conflict", async () => {
    const before = doc();
    expect(err(await run("rename_project", mut({ name: "x".repeat(121) }))).kind).toBe("invalid_params");
    expect(err(await run("rename_project", mut({ name: "" }))).kind).toBe("invalid_params");
    expect(err(await run("rename_project", { projectId: before.id, expectedRevision: 99, name: "a" })).kind).toBe("conflict");
    expect(doc()).toBe(before);
  });
});

describe("remove_element", () => {
  it("quita el elemento y sus ajustes de variante; deshacer lo recupera todo", async () => {
    const id = await addText("Título");
    const v = ok(await run("add_variant", mut({ presetId: "instagram-feed-portrait" })));
    ok(await run("update_variant", mut({ targetId: v.targetId, elements: { [id]: { fontScale: 0.9 } } })));
    expect(JSON.stringify(doc().digitalTargets)).toContain("fontScale");
    const out = ok(await run("remove_element", mut({ elementId: id })));
    MCP_TOOLS.remove_element.output.parse(out);
    expect(doc().elements).toHaveLength(0);
    expect(JSON.stringify(doc().digitalTargets)).not.toContain("fontScale");
    store.undo();
    expect(doc().elements.map((e) => e.id)).toEqual([id]);
    expect(JSON.stringify(doc().digitalTargets)).toContain("fontScale");
  });
  it("id inexistente: not_found element; revisión obsoleta: conflict", async () => {
    const id = await addText("A");
    expect(err(await run("remove_element", mut({ elementId: "nada" })))).toEqual({ kind: "not_found", resource: "element", id: "nada" });
    expect(err(await run("remove_element", { projectId: doc().id, expectedRevision: 0, elementId: id })).kind).toBe("conflict");
    expect(doc().elements).toHaveLength(1);
  });
  it("es destructiva en el contrato", () => {
    expect((MCP_TOOLS.remove_element as { destructive?: boolean }).destructive).toBe(true);
  });
});

describe("reorder_element", () => {
  it("0 lo lleva al fondo y un índice enorme al frente", async () => {
    const a = await addText("A");
    const b = await addText("B");
    const c = await addText("C");
    const down = ok(await run("reorder_element", mut({ elementId: c, toIndex: 0 })));
    MCP_TOOLS.reorder_element.output.parse(down);
    expect(down.order).toEqual([c, a, b]);
    expect(order()).toEqual([c, a, b]);
    const up = ok(await run("reorder_element", mut({ elementId: c, toIndex: 99 })));
    expect(up.order).toEqual([a, b, c]);
    store.undo();
    expect(order()).toEqual([c, a, b]);
  });
  it("id inexistente: not_found; obsoleta: conflict; índice negativo: invalid_params", async () => {
    const a = await addText("A");
    expect(err(await run("reorder_element", mut({ elementId: "nada", toIndex: 0 })))).toEqual({ kind: "not_found", resource: "element", id: "nada" });
    expect(err(await run("reorder_element", { projectId: doc().id, expectedRevision: 0, elementId: a, toIndex: 0 })).kind).toBe("conflict");
    expect(err(await run("reorder_element", mut({ elementId: a, toIndex: -1 }))).kind).toBe("invalid_params");
  });
});
