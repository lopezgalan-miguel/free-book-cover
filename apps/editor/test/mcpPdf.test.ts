import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_EXPORT_BYTES, exportKdpPdfEditorOutput, toolErrorSchema, type CompanionReport, type PrintSetup, type ToolOutcome } from "@free-book-cover/core";
import { CompanionError, type CompanionClient } from "../src/export/companionClient";
import type { PdfExportDeps } from "../src/export/exportPdf";
import { executeTool } from "../src/mcp/executor";
import { createEditorStore, type EditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

let n = 0;
let store: EditorStore;
beforeEach(async () => {
  const storage = await openStorage(`mcp-pdf-${++n}`);
  let i = 0;
  store = createEditorStore({ storage, newId: () => `id${++i}`, downloadParts: vi.fn() });
  await store.init();
});

const doc = () => store.getState().history.present;
const setup: PrintSetup = { trimWidthIn: 6, trimHeightIn: 9, pageCount: 100, paperAndInk: "color-standard", readingDirection: "ltr" };
const report = (): CompanionReport => ({
  ok: true, checks: [{ id: "size", status: "pass", params: { width: 1, height: 1, expectedWidth: 1, expectedHeight: 1 } }, { id: "ink", status: "pass", params: { percent: 296, limit: 300 } }],
  measured: { pageSizePt: null, expectedSizePt: { width: 1, height: 1 }, minPpi: 300, bytes: 100, maxInkPercent: 296, encoding: "flate" },
});
const pdfDeps = (comp: Partial<CompanionClient> = {}): PdfExportDeps => ({
  fonts: { ensureDoc: () => {}, whenSettled: async () => {}, checkFontsReady: () => ({ ok: true }) },
  missingAssets: () => [],
  renderer: { render: vi.fn(async () => ({ blob: new Blob(["png"]), via: "worker" as const })) },
  companion: { health: async () => "connected", preflight: vi.fn(async () => ({ id: "x", report: report(), proofPng: null })), downloadPdf: vi.fn(async () => new Blob(["%PDF-1.4"])), ...comp },
  config: { baseUrl: "http://127.0.0.1:1", token: "t" },
});
const run = (d: PdfExportDeps) =>
  executeTool({ store, authorizedProjectId: () => doc().id, measure: () => null, pdfDeps: () => d }, "export_kdp_pdf", { projectId: doc().id });
const err = (o: ToolOutcome) => {
  expect(o.ok).toBe(false);
  return toolErrorSchema.parse((o as { error: unknown }).error);
};

describe("export_kdp_pdf", () => {
  it("cubierta KDP: devuelve el PDF en base64 y el informe", async () => {
    store.applyRemote({ type: "setPrintSetup", printSetup: setup }, doc().revision);
    const d = pdfDeps();
    const o = await run(d);
    expect(o.ok).toBe(true);
    const data = (o as { data: any }).data;
    exportKdpPdfEditorOutput.parse(data);
    expect(data.state).toBe("ready");
    expect(data.pdfBase64.length).toBeGreaterThan(0);
    expect(Buffer.from(data.pdfBase64, "base64").toString()).toBe("%PDF-1.4");
    expect(data.reportText).toContain(data.fileName);
    expect(data.checks).toContainEqual({ id: "size", status: "pass" });
  });
  it("proyecto libre: invalid_params con set_print_setup y sin renderizar", async () => {
    const d = pdfDeps();
    const e = err(await run(d));
    expect(e.kind).toBe("invalid_params");
    expect(JSON.stringify(e)).toContain("set_print_setup");
    expect(d.renderer.render).not.toHaveBeenCalled();
  });
  it("el companion rechaza la entrada: sin PDF y no validado", async () => {
    store.applyRemote({ type: "setPrintSetup", printSetup: setup }, doc().revision);
    const d = pdfDeps({ preflight: async () => ({ id: null, report: { ...report(), ok: false, checks: [{ id: "input", status: "fail", params: { reason: "x" } }] }, proofPng: null }) });
    const data = (await run(d) as { data: any }).data;
    expect(data.state).toBe("not_validated");
    expect(data.pdfBase64).toBeNull();
    expect(data.reportText.length).toBeGreaterThan(0);
  });
  it("companion desconectado: invalid_params que dice conectar el editor; fallo de render: internal", async () => {
    store.applyRemote({ type: "setPrintSetup", printSetup: setup }, doc().revision);
    const off = err(await run(pdfDeps({ preflight: async () => { throw new CompanionError("offline", "x"); } })));
    expect(off.kind).toBe("invalid_params");
    expect(JSON.stringify(off)).toContain("diálogo de exportación");
    const d = pdfDeps();
    d.renderer = { render: async () => { throw new Error("boom"); } };
    expect(err(await run(d)).kind).toBe("internal");
  });
  it("companion caído: error sin renderizar", async () => {
    store.applyRemote({ type: "setPrintSetup", printSetup: setup }, doc().revision);
    for (const status of ["offline", "needs_token"] as const) {
      const d = pdfDeps({ health: async () => status });
      const e = err(await run(d));
      expect(e.kind).toBe("invalid_params");
      expect(JSON.stringify(e)).toContain("conecta el editor");
      expect(d.renderer.render).not.toHaveBeenCalled();
    }
  });
  it("PDF por encima del límite del canal: invalid_params que remite a Exportar → PDF", async () => {
    store.applyRemote({ type: "setPrintSetup", printSetup: setup }, doc().revision);
    const e = err(await run(pdfDeps({ downloadPdf: async () => new Blob([new Uint8Array(MAX_EXPORT_BYTES + 1)]) })));
    expect(e.kind).toBe("invalid_params");
    expect(JSON.stringify(e)).toContain("Exportar → PDF");
  });
  it("sin pdfDeps: internal", async () => {
    expect(err(await executeTool({ store, authorizedProjectId: () => doc().id, measure: () => null }, "export_kdp_pdf", { projectId: doc().id })).kind).toBe("internal");
  });
});
