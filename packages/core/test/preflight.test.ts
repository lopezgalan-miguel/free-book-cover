import { describe, expect, it } from "vitest";
import { buildPreflightSummary, kdpLayout, printPixelSize, projectChecks, type Asset, type CompanionReport, type PrintSetup, type Project } from "../src/index.js";
import { baseProject, imageEl, textEl } from "./fixtures.js";

const setup: PrintSetup = { trimWidthIn: 6, trimHeightIn: 9, pageCount: 100, paperAndInk: "color-standard", readingDirection: "ltr" };
const L = kdpLayout(setup);
const asset = (id: string, w: number, h: number): Asset => ({ id, kind: "image", mimeType: "image/png", metadata: { widthPx: w, heightPx: h } });
const kdp = (over: Partial<Project> = {}): Project => ({
  ...baseProject(), mode: "kdp-paperback", printSetup: setup, canvas: { widthIn: L.widthIn, heightIn: L.heightIn, background: "#204060" }, ...over,
});
const companion = (over: Partial<CompanionReport> = {}): CompanionReport => ({
  ok: true, checks: [{ id: "pages", status: "pass" }, { id: "ink", status: "pass" }],
  measured: { pageSizePt: null, expectedSizePt: { width: 1, height: 1 }, minPpi: 300, bytes: 1, maxInkPercent: 10, encoding: "flate" }, ...over,
});
const status = (checks: { id: string; status: string }[], id: string) => checks.find((c) => c.id === id)?.status;

describe("tamaño de rasterización", () => {
  it("redondea hacia arriba para no bajar de 300 ppp", () => {
    expect(printPixelSize(12.4752, 9.25)).toEqual({ widthPx: 3743, heightPx: 2775 });
    expect(printPixelSize(13, 9.25)).toEqual({ widthPx: 3900, heightPx: 2775 });
  });
});

describe("comprobaciones del proyecto", () => {
  it("proyecto KDP coherente y sin imágenes: todo pasa", () => {
    const c = projectChecks(kdp());
    expect(status(c, "project")).toBe("pass");
    expect(status(c, "resolution")).toBe("pass");
  });
  it("sin modo KDP, sin datos o con lienzo que no coincide: project falla", () => {
    expect(status(projectChecks({ ...kdp(), mode: "freeform" }), "project")).toBe("fail");
    expect(status(projectChecks(kdp({ printSetup: undefined })), "project")).toBe("fail");
    expect(status(projectChecks(kdp({ canvas: { widthIn: L.widthIn + 0.01, heightIn: L.heightIn, background: "#fff" } })), "project")).toBe("fail");
  });
  it("recurso por debajo de 300 ppp efectivos: resolution falla e informa el mínimo", () => {
    const d = kdp({ assets: [asset("a", 600, 600)], elements: [imageEl("i", "a", { x: 1, y: 1, width: 3, height: 3 })] });
    const r = projectChecks(d).find((c) => c.id === "resolution")!;
    expect(r.status).toBe("fail");
    expect(r.params).toMatchObject({ count: 1, min: 200, target: 300 });
  });
  it("recurso a exactamente 300 ppp pasa", () => {
    const d = kdp({ assets: [asset("a", 900, 900)], elements: [imageEl("i", "a", { x: 1, y: 1, width: 3, height: 3 })] });
    expect(status(projectChecks(d), "resolution")).toBe("pass");
  });
  it("la revisión KDP aparece como aviso, no como fallo", () => {
    const d = kdp({ elements: [textEl("t", { x: 0.05, y: 1, width: 2, height: 1 })] });
    expect(status(projectChecks(d), "review")).toBe("warn");
  });
});

describe("estado final", () => {
  it("listo solo con inspección del companion y sin fallos", () => {
    const s = buildPreflightSummary(kdp(), companion());
    expect(s.state).toBe("ready");
    expect(s.failing).toEqual([]);
  });
  it("sin informe del companion nunca es validado", () => {
    expect(buildPreflightSummary(kdp(), null).state).toBe("not_validated");
  });
  it("un fallo del companion o del editor impide el estado validado; los avisos no", () => {
    const bad = buildPreflightSummary(kdp(), companion({ ok: false, checks: [{ id: "cmyk", status: "fail" }] }));
    expect(bad.state).toBe("not_validated");
    expect(bad.failing).toEqual(["cmyk"]);
    const lowRes = kdp({ assets: [asset("a", 600, 600)], elements: [imageEl("i", "a", { width: 3, height: 3 })] });
    const s = buildPreflightSummary(lowRes, companion());
    expect(s.state).toBe("not_validated");
    expect(s.failing).toEqual(["resolution"]);
    const warn = buildPreflightSummary(kdp(), companion({ checks: [{ id: "ink", status: "warn" }, { id: "weight", status: "warn" }] }));
    expect(warn.state).toBe("ready");
  });
  it("aunque el companion diga ok, un fallo del editor gana", () => {
    expect(buildPreflightSummary({ ...kdp(), mode: "freeform" }, companion()).state).toBe("not_validated");
  });
});
