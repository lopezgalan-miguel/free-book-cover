import { describe, expect, it, vi } from "vitest";
import { applyCommand, createProject, kdpLayout, type Asset, type CompanionReport, type PrintSetup, type Project } from "@free-book-cover/core";
import { CompanionError, type CompanionClient } from "../src/export/companionClient";
import { runPdfExport, type PdfExportDeps, type PdfStage } from "../src/export/exportPdf";
import { workerEligible } from "../src/export/printRender";
import { checkDetail, checkTitle, reportText } from "../src/export/pdfReportText";
import { ca, es, type DictKey } from "../src/i18n/dictionaries";
import { translate } from "../src/i18n";

const setup: PrintSetup = { trimWidthIn: 6, trimHeightIn: 9, pageCount: 100, paperAndInk: "color-standard", readingDirection: "ltr" };
const L = kdpLayout(setup);
const kdp = (over: Partial<Project> = {}): Project => ({ ...createProject({ id: "p", name: "Mi libro", mode: "kdp-paperback" }), printSetup: setup, canvas: { widthIn: L.widthIn, heightIn: L.heightIn, background: "#204060" }, ...over });
const img = (w: number, h: number): Asset => ({ id: "a", kind: "image", mimeType: "image/png", metadata: { widthPx: w, heightPx: h } });
const report = (over: Partial<CompanionReport> = {}): CompanionReport => ({
  ok: true, checks: [{ id: "size", status: "pass", params: { width: 1, height: 1, expectedWidth: 1, expectedHeight: 1 } }, { id: "ink", status: "pass", params: { percent: 296, limit: 300 } }],
  measured: { pageSizePt: null, expectedSizePt: { width: 1, height: 1 }, minPpi: 300, bytes: 100, maxInkPercent: 296, encoding: "flate" }, ...over,
});
const deps = (over: Partial<PdfExportDeps> = {}, comp: Partial<CompanionClient> = {}) => {
  const order: string[] = [];
  const d: PdfExportDeps = {
    fonts: { ensureDoc: () => void order.push("ensure"), whenSettled: async () => void order.push("settled"), checkFontsReady: () => (order.push("check"), { ok: true }) },
    missingAssets: () => [],
    renderer: { render: vi.fn(async () => ({ blob: new Blob(["png"]), via: "worker" as const })) },
    companion: {
      health: async () => "connected",
      preflight: vi.fn(async () => ({ id: "x", report: report(), proofPng: "UE5H" })),
      downloadPdf: vi.fn(async () => new Blob(["%PDF"])),
      ...comp,
    },
    config: { baseUrl: "http://127.0.0.1:1", token: "t" },
    ...over,
  };
  return { d, order };
};

describe("flujo del PDF de imprenta", () => {
  it("proyecto válido: renderiza a 300 ppp sin redondear a la baja, envía el tamaño físico y queda «ready»", async () => {
    const { d, order } = deps();
    const stages: PdfStage[] = [];
    const out = await runPdfExport(kdp(), "Mi libro", d, (s) => stages.push(s));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.summary.state).toBe("ready");
    expect(out.result.fileName).toBe("mi-libro-kdp-3743x2775.pdf");
    expect(out.result.sizePx).toEqual({ widthPx: 3743, heightPx: 2775 });
    expect(d.renderer.render).toHaveBeenCalledWith(expect.anything(), { widthPx: 3743, heightPx: 2775 }, expect.any(Function));
    expect(d.companion.preflight).toHaveBeenCalledWith(d.config, expect.any(Blob), L.widthIn, L.heightIn);
    expect(order).toEqual(["ensure", "settled", "check"]);
    expect(stages).toEqual(["companion", "download"]);
    expect(out.result.proofPng).toBe("UE5H");
  });
  it("no es una cubierta KDP: error sin renderizar", async () => {
    const { d } = deps();
    expect(await runPdfExport({ ...kdp(), mode: "freeform" }, "x", d)).toEqual({ ok: false, error: { kind: "not_kdp" } });
    expect(d.renderer.render).not.toHaveBeenCalled();
  });
  it("por encima de 50 MP bloquea antes de renderizar", async () => {
    const { d } = deps();
    const big = kdp({ canvas: { widthIn: 40, heightIn: 20, background: "#fff" } });
    const out = await runPdfExport(big, "x", d);
    expect(out).toMatchObject({ ok: false, error: { kind: "limit", limitMegapixels: 50 } });
    expect(d.renderer.render).not.toHaveBeenCalled();
  });
  it("fuentes sin cargar o recursos ausentes bloquean antes de renderizar", async () => {
    const problems = [{ family: "Rota", reason: "failed" as const, elementIds: ["t"] }];
    const a = deps({ fonts: { ensureDoc: () => {}, whenSettled: async () => {}, checkFontsReady: () => ({ ok: false, problems }) } });
    expect(await runPdfExport(kdp(), "x", a.d)).toEqual({ ok: false, error: { kind: "fonts", problems } });
    const b = deps({ missingAssets: () => ["a1"] });
    expect(await runPdfExport(kdp(), "x", b.d)).toEqual({ ok: false, error: { kind: "missing_assets", assetIds: ["a1"] } });
    expect(a.d.renderer.render).not.toHaveBeenCalled();
    expect(b.d.renderer.render).not.toHaveBeenCalled();
  });
  it("fallo de render y errores del companion se devuelven explícitos, sin PDF", async () => {
    const r = deps({ renderer: { render: async () => { throw new Error("boom"); } } });
    expect(await runPdfExport(kdp(), "x", r.d)).toEqual({ ok: false, error: { kind: "render_failed", message: "boom" } });
    for (const kind of ["offline", "unauthorized", "failed"] as const) {
      const c = deps({}, { preflight: async () => { throw new CompanionError(kind, "x"); } });
      expect(await runPdfExport(kdp(), "x", c.d)).toEqual({ ok: false, error: { kind: "companion", reason: kind } });
    }
  });
  it("recurso < 300 ppp: informe con error de resolución y sin estado validado, aunque el PDF salga bien", async () => {
    const low = kdp({ assets: [img(600, 600)], elements: [{ id: "i", type: "image", assetRef: { assetId: "a" }, x: 1, y: 1, width: 3, height: 3, rotation: 0, zIndex: 0, visible: true, fit: "cover", crop: { x: 0, y: 0, width: 1, height: 1 } } as never] });
    const { d } = deps();
    const out = await runPdfExport(low, "Mi libro", d);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.summary.state).toBe("not_validated");
    expect(out.result.summary.failing).toEqual(["resolution"]);
    expect(out.result.fileName).toBe("mi-libro-kdp-3743x2775-PRUEBA-NO-VALIDADA.pdf");
    expect(out.result.pdf).not.toBeNull();
  });
  it("fallo del companion en el PDF (p. ej. CMYK) impide el estado validado y marca la prueba", async () => {
    const { d } = deps({}, { preflight: async () => ({ id: "x", report: report({ ok: false, checks: [{ id: "cmyk", status: "fail", params: { space: "rgb" } }] }), proofPng: null }) });
    const out = await runPdfExport(kdp(), "x", d);
    expect(out.ok && out.result.summary.state).toBe("not_validated");
    expect(out.ok && out.result.fileName.endsWith("-PRUEBA-NO-VALIDADA.pdf")).toBe(true);
  });
  it("entrada rechazada por el companion: sin PDF y no validado", async () => {
    const { d } = deps({}, { preflight: async () => ({ id: null, report: report({ ok: false, checks: [{ id: "input", status: "fail", params: { reason: "x" } }] }), proofPng: null }) });
    const out = await runPdfExport(kdp(), "x", d);
    expect(out.ok && out.result.pdf).toBeNull();
    expect(out.ok && out.result.summary.state).toBe("not_validated");
    expect(d.companion.downloadPdf).not.toHaveBeenCalled();
  });
  it("el documento que se rasteriza es el del proyecto, sin guías (las guías son estado de vista)", async () => {
    const { d } = deps();
    const doc = applyCommand(kdp(), { type: "setBackground", background: "#123456" }, 0);
    await runPdfExport(doc.ok ? doc.doc : kdp(), "x", d);
    const sent = (d.renderer.render as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Project;
    expect(JSON.stringify(sent)).not.toContain("guide");
  });
});

describe("textos del informe", () => {
  const combos: Array<[string, string]> = [
    ["project", "pass"], ["project", "fail"], ["resolution", "pass"], ["resolution", "fail"], ["review", "warn"], ["input", "fail"],
    ["pages", "pass"], ["pages", "fail"], ["size", "pass"], ["size", "fail"], ["ppi", "pass"], ["ppi", "fail"], ["cmyk", "pass"], ["cmyk", "fail"],
    ["transparency", "pass"], ["transparency", "fail"], ["fonts", "pass"], ["fonts", "fail"], ["encryption", "pass"], ["encryption", "fail"],
    ["structure", "pass"], ["structure", "fail"], ["weight", "pass"], ["weight", "warn"], ["weight", "fail"], ["ink", "pass"], ["ink", "warn"],
  ];
  it("toda combinación posible tiene texto en español y catalán, sin llaves sin sustituir", () => {
    for (const [id, status] of combos) {
      for (const lang of ["es", "ca"] as const) {
        const t = (k: DictKey, v?: Record<string, string | number>) => translate(lang, k, v);
        const c = { id, status, params: { count: 1, min: 200, ppi: 300, percent: 310, limit: 300, bytes: 5 * 1024 * 1024, width: 1, height: 1, expectedWidth: 1, expectedHeight: 1, pages: 2, space: "rgb", reason: "x" } } as never;
        expect(checkTitle(t, c)).not.toMatch(/\{/);
        expect(checkDetail(t, c)).not.toMatch(/\{/);
      }
      expect((es as Record<string, string>)[`pfd_${id}_${status}`]).toBeTruthy();
      expect((ca as Record<string, string>)[`pfd_${id}_${status}`]).toBeTruthy();
    }
  });
  it("el informe descargable declara el estado y lista las comprobaciones", async () => {
    const { d } = deps({}, { preflight: async () => ({ id: "x", report: report({ ok: false, checks: [{ id: "cmyk", status: "fail", params: { space: "rgb" } }] }), proofPng: null }) });
    const out = await runPdfExport(kdp(), "Mi libro", d);
    if (!out.ok) throw new Error("esperaba resultado");
    const es_ = reportText((k, v) => translate("es", k, v), out.result);
    expect(es_).toContain("NO validado");
    expect(es_).toContain("[Error] Color CMYK: Espacio de color rgb");
    expect(reportText((k, v) => translate("ca", k, v), out.result)).toContain("NO validat");
  });
});

describe("render en Worker o en el hilo principal", () => {
  it("catálogo de Google Fonts -> hilo principal; sistema, genéricas y subidas -> Worker", () => {
    const text = (family: string) => ({ id: family, type: "text", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0, visible: true, runs: [{ text: "a", fontFamily: family, fontSizePt: 12, weight: 400, italic: false, underline: false, uppercase: false, color: "#000" }] }) as never;
    expect(workerEligible(kdp({ elements: [text("Playfair Display")] }))).toBe(false);
    expect(workerEligible(kdp({ elements: [text("Georgia")] }))).toBe(true);
    expect(workerEligible(kdp({ elements: [text("sans-serif")] }))).toBe(true);
    expect(workerEligible(kdp({ elements: [text("Mi Fuente Subida")] }))).toBe(true);
    expect(workerEligible(kdp())).toBe(true);
  });
});
