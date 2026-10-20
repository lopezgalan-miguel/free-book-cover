import { describe, expect, it } from "vitest";
import {
  HARDCOVER, HARDCOVER_TRIMS, applyCommand, kdpGuides, kdpLayout, printSetupSchema, repositionElements, validatePrintSetup,
  type PrintSetup,
} from "../src/index.js";
import { baseProject, textEl } from "./fixtures.js";

const hc = (over: Partial<PrintSetup> = {}): PrintSetup => ({
  trimWidthIn: 5.5, trimHeightIn: 8.5, pageCount: 116, paperAndInk: "bw-cream", readingDirection: "ltr", binding: "hardcover", ...over,
});
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);

describe("tapa dura: geometría contrastada con la plantilla oficial", () => {
  it("5,5 × 8,5, 116 páginas, crema (CASE_LAMINATE_5.500x8.500_116_BW_CREAM)", () => {
    const l = kdpLayout(hc());
    expect(l.binding).toBe("hardcover");
    close(l.widthIn, 939.8721 / 72);
    close(l.heightIn, 714.0472 / 72);
    close(l.spineIn, 0.478976);
    close(l.bleedIn, 42.519653 / 72);
    close(l.folds[0], 452.6929 / 72);
    close(l.folds[1], 487.1792 / 72);
    close(l.hinges![0], 424.3464 / 72);
    close(l.hinges![1], 515.52563 / 72);
    // Tapas: el cartón es el corte + 5 mm de ancho y + 6 mm de alto.
    close(l.back.x, 42.519653 / 72);
    close(l.back.width, 452.6929 / 72 - 42.519653 / 72);
    close(l.back.height, 629.0078 / 72);
    close(l.front.x + l.front.width, (42.519653 + 854.83276) / 72);
    // Zona segura: tapa − 0,125; en el lado del lomo, hasta la bisagra.
    close(l.safe.back.x, 51.519653 / 72);
    close(l.safe.back.y, 51.519684 / 72);
    close(l.safe.back.x + l.safe.back.width, 424.3464 / 72);
    close(l.safe.back.height, 611.0078 / 72);
    close(l.safe.front.x, 515.52563 / 72);
    close(l.safe.front.x + l.safe.front.width, (51.519653 + 836.83276) / 72);
    close(l.spineSafe!.x, 457.1929 / 72);
    close(l.spineSafe!.width, 25.486298 / 72);
    // Código de barras (PDF con origen abajo: y = alto − (y_pdf + alto_caja)).
    close(l.barcode.x, 262.3464 / 72);
    close(l.barcode.y, (714.0472 - 69.51967 - 86.40001) / 72);
    close(l.barcode.width, 2);
    close(l.barcode.height, 1.2);
  });

  it("5,5 × 8,5, 128 páginas, blanco (CASE_LAMINATE_5.500x8.500_128_BW_WHITE)", () => {
    const l = kdpLayout(hc({ pageCount: 128, paperAndInk: "bw-white" }));
    close(l.folds[1], 487.05362 / 72);
    close(l.hinges![1], 515.4001 / 72);
    close(l.front.x + l.front.width, (42.519684 + 854.70715) / 72);
  });

  it("sin binding la tapa blanda no cambia y no tiene bisagras", () => {
    const s = { trimWidthIn: 6, trimHeightIn: 9, pageCount: 200, paperAndInk: "bw-white", readingDirection: "ltr" } as const;
    const l = kdpLayout(s);
    expect(l.binding).toBe("paperback");
    expect(l.hinges).toBeNull();
    close(l.widthIn, 12 + 200 * 0.002252 + 0.25);
    expect(kdpGuides(l).some((g) => g.kind === "hinge")).toBe(false);
  });

  it("las guías de tapa dura incluyen las dos bisagras", () => {
    const l = kdpLayout(hc());
    const hinges = kdpGuides(l).filter((g) => g.kind === "hinge");
    expect(hinges).toHaveLength(2);
  });
});

describe("tapa dura: validación", () => {
  it("cinco cortes oficiales; los de solo tapa blanda se rechazan", () => {
    expect(HARDCOVER_TRIMS.map((t) => `${t.widthIn}x${t.heightIn}`)).toEqual(["5.5x8.5", "6x9", "6.14x9.21", "7x10", "8.25x11"]);
    expect(validatePrintSetup(hc()).ok).toBe(true);
    expect(validatePrintSetup(hc({ trimWidthIn: 5, trimHeightIn: 8 }))).toEqual({ ok: false, issues: [{ kind: "trim_unsupported" }] });
  });
  it("páginas de 76 a 550", () => {
    expect(HARDCOVER.minPages).toBe(76);
    expect(validatePrintSetup(hc({ pageCount: 75 }))).toEqual({ ok: false, issues: [{ kind: "pages_below_min", min: 76 }] });
    expect(validatePrintSetup(hc({ pageCount: 551 }))).toEqual({ ok: false, issues: [{ kind: "pages_above_max", max: 550 }] });
    expect(validatePrintSetup(hc({ pageCount: 550 })).ok).toBe(true);
  });
  it("sin color estándar en tapa dura", () => {
    expect(validatePrintSetup(hc({ paperAndInk: "color-standard" }))).toEqual({ ok: false, issues: [{ kind: "paper_unavailable_for_binding" }] });
    expect(validatePrintSetup(hc({ paperAndInk: "color-premium" })).ok).toBe(true);
  });
  it("el esquema admite binding y rechaza valores desconocidos", () => {
    expect(printSetupSchema.safeParse(hc()).success).toBe(true);
    expect(printSetupSchema.safeParse({ ...hc(), binding: "spiral" }).success).toBe(false);
  });
});

describe("tapa dura: pasar de tapa blanda a dura y volver", () => {
  it("un texto conserva su distancia a los bordes de su tapa", () => {
    const soft = kdpLayout({ ...hc(), binding: undefined });
    const hard = kdpLayout(hc());
    // Título arriba a la derecha de la portada y autor abajo a la izquierda de la contraportada.
    const title = textEl("t", { x: soft.front.x + soft.front.width - 0.5 - 3, y: soft.front.y + 0.4, width: 3, height: 1 });
    const author = textEl("a", { x: soft.back.x + 0.3, y: soft.back.y + soft.back.height - 0.6 - 1, width: 3, height: 1 });
    const [t2, a2] = repositionElements([title, author], soft, hard);
    close(hard.front.x + hard.front.width - (t2!.x + t2!.width), 0.5);
    close(t2!.y - hard.front.y, 0.4);
    close(a2!.x - hard.back.x, 0.3);
    close(hard.back.y + hard.back.height - (a2!.y + a2!.height), 0.6);
  });
  it("aplicar tapa dura y luego blanda deja el documento sin binding y con el lienzo de tapa blanda", () => {
    const p = baseProject();
    const r1 = applyCommand(p, { type: "setPrintSetup", printSetup: hc() }, p.revision);
    if (!r1.ok) throw new Error(JSON.stringify(r1.error));
    expect(r1.doc.printSetup?.binding).toBe("hardcover");
    close(r1.doc.canvas.widthIn, 939.8721 / 72);
    const { binding: _b, ...soft } = hc();
    const r2 = applyCommand(r1.doc, { type: "setPrintSetup", printSetup: soft }, r1.doc.revision);
    if (!r2.ok) throw new Error(JSON.stringify(r2.error));
    expect(r2.doc.printSetup && "binding" in r2.doc.printSetup).toBe(false);
    close(r2.doc.canvas.widthIn, 11 + 116 * 0.0025 + 0.25);
  });
});
