import { describe, expect, it } from "vitest";
import type { PdfInspection } from "../src/preflight/inspect.js";
import { WEIGHT_MAX_BYTES, WEIGHT_TARGET_BYTES, buildReport } from "../src/preflight/report.js";
import { maxInkOfPam } from "../src/preflight/ink.js";

const expected = { widthIn: 12.4752, heightIn: 9.25 };
const good = (): PdfInspection => ({
  pageCount: 1, pageSizePt: { width: 12.4752 * 72, height: 666 }, encrypted: false,
  images: [{ page: 1, type: "image", width: 3743, height: 2775, color: "cmyk", encoding: "image", ppiX: 300, ppiY: 300 }],
  fonts: [], transparency: [], structureOk: true, fileSizeBytes: 5_000_000,
});
const status = (r: ReturnType<typeof buildReport>, id: string) => r.checks.find((c) => c.id === id)!.status;
const mk = (over: Partial<PdfInspection> = {}, ink = 200) => buildReport({ inspection: { ...good(), ...over }, maxInkPercent: ink, expected, encoding: "flate" });

describe("informe de preimpresión", () => {
  it("todo correcto: ok y sin fallos", () => {
    const r = mk();
    expect(r.ok).toBe(true);
    expect(r.checks.every((c) => c.status === "pass")).toBe(true);
    expect(r.checks.map((c) => c.id)).toEqual(["pages", "size", "ppi", "cmyk", "transparency", "fonts", "encryption", "structure", "weight", "ink"]);
  });
  it.each([
    ["pages", { pageCount: 2 }],
    ["size", { pageSizePt: { width: 12.4752 * 72 + 0.02, height: 666 } }],
    ["ppi", { images: [{ ...good().images[0]!, ppiX: 299, ppiY: 300 }] }],
    ["cmyk", { images: [{ ...good().images[0]!, color: "rgb" }] }],
    ["transparency", { transparency: ["1: /SMask"] }],
    ["fonts", { fonts: [{ name: "X", embedded: false }] }],
    ["encryption", { encrypted: true }],
    ["structure", { structureOk: false }],
    ["weight", { fileSizeBytes: WEIGHT_MAX_BYTES + 1 }],
  ] as const)("falla %s y no queda ok", (id, over) => {
    const r = mk(over as Partial<PdfInspection>);
    expect(status(r, id)).toBe("fail");
    expect(r.ok).toBe(false);
  });
  it("sin imágenes no se concede nada", () => {
    expect(mk({ images: [] }).ok).toBe(false);
  });
  it("peso: aviso por encima de 40 MB, fallo por encima de 200 MB, exacto en el límite pasa", () => {
    expect(status(mk({ fileSizeBytes: WEIGHT_TARGET_BYTES }), "weight")).toBe("pass");
    const warn = mk({ fileSizeBytes: WEIGHT_TARGET_BYTES + 1 });
    expect(status(warn, "weight")).toBe("warn");
    expect(warn.ok).toBe(true);
    expect(status(mk({ fileSizeBytes: WEIGHT_MAX_BYTES }), "weight")).toBe("warn");
  });
  it("tinta total: aviso por encima de 300 %, no bloqueante", () => {
    expect(status(mk({}, 300), "ink")).toBe("pass");
    const r = mk({}, 310.4);
    expect(status(r, "ink")).toBe("warn");
    expect(r.checks.find((c) => c.id === "ink")!.params).toEqual({ percent: 310, limit: 300 });
    expect(r.ok).toBe(true);
  });
});

describe("medición de tinta en PAM", () => {
  const pam = (px: number[][]) =>
    Buffer.concat([Buffer.from(`P7\nWIDTH ${px.length}\nHEIGHT 1\nDEPTH 4\nMAXVAL 255\nTUPLTYPE CMYK\nENDHDR\n`), Buffer.from(px.flat())]);
  it("devuelve la suma máxima por píxel en %", () => {
    expect(maxInkOfPam(pam([[0, 0, 0, 0], [255, 255, 255, 255], [10, 10, 10, 10]]))).toBeCloseTo(400, 6);
    expect(maxInkOfPam(pam([[255, 0, 0, 0], [51, 51, 51, 51]]))).toBeCloseTo(100, 6);
  });
  it("rechaza un PAM que no es CMYK", () => {
    expect(() => maxInkOfPam(Buffer.from("P7\nDEPTH 3\nENDHDR\nabc"))).toThrow(/canales/);
  });
});
