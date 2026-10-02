import { describe, expect, it } from "vitest";
import {
  applyStyleToRange, applyCommand, checkFontsReady, createProject, detectFontFormat, dpiReport, familyFromFileName, fontCss, fontStack,
  layoutText, normalizeRuns, projectSchema, rangeStyle, renderDocument, replaceText, runsToText, textEffects, usedFamilies,
  type FontState, type Project, type TextElement, type TextMeasure, type TextRun,
} from "../src/index.js";
import { baseProject, textEl } from "./fixtures.js";

// Medidor determinista: cada carácter ocupa media vez el cuerpo.
const measure: TextMeasure = (text, css) => text.length * Number(/([\d.]+)px/.exec(css)![1]) * 0.5;
const run = (text: string, over: Partial<TextRun> = {}): TextRun => ({ text, fontFamily: "Lora", fontSizePt: 72, weight: 400, italic: false, underline: false, uppercase: false, color: "#ffffff", ...over });
// A 72 ppi, 72 pt = 72 px; cada carácter mide 36 px.
const el = (over: Partial<TextElement> = {}) => textEl("t", { width: 5, letterSpacing: 0, lineHeight: 1, align: "left", runs: [run("hola mundo")], ...over });

describe("fuentes", () => {
  it("detecta formatos por la firma del archivo", () => {
    expect(detectFontFormat(Uint8Array.from([0, 1, 0, 0, 9]))).toBe("ttf");
    expect(detectFontFormat(Uint8Array.from([..."true"].map((c) => c.charCodeAt(0))))).toBe("ttf");
    expect(detectFontFormat(Uint8Array.from([..."OTTO"].map((c) => c.charCodeAt(0))))).toBe("otf");
    expect(detectFontFormat(Uint8Array.from([..."wOF2"].map((c) => c.charCodeAt(0))))).toBe("woff2");
    expect(detectFontFormat(Uint8Array.from([..."wOFF"].map((c) => c.charCodeAt(0))))).toBeNull();
    expect(detectFontFormat(new Uint8Array(2))).toBeNull();
  });
  it("pila CSS con genérica y nombre de familia a partir del archivo", () => {
    expect(fontStack("Lora")).toBe('"Lora", serif');
    expect(fontStack("Montserrat")).toBe('"Montserrat", sans-serif');
    expect(fontCss({ family: "Lora", weight: 700, italic: true, px: 20 })).toBe('italic 700 20px "Lora", serif');
    expect(familyFromFileName("Mi Fuente-Bold.v2.ttf")).toBe("Mi Fuente-Bold v2");
    expect(familyFromFileName("....ttf")).toBe("Fuente");
  });
});

describe("runs: estilos por fragmento", () => {
  const two = [run("Hola "), run("mundo", { weight: 700 })];
  it("aplica un estilo a un rango partiendo fragmentos y los vuelve a unir", () => {
    const r = applyStyleToRange([run("abcdef")], 2, 4, { italic: true });
    expect(r.map((x) => [x.text, x.italic])).toEqual([["ab", false], ["cd", true], ["ef", false]]);
    expect(applyStyleToRange(r, 2, 4, { italic: false })).toEqual([run("abcdef")]);
  });
  it("sin selección aplica a todo el bloque", () => {
    expect(applyStyleToRange(two, 3, 3, { color: "#000000" }).every((x) => x.color === "#000000")).toBe(true);
  });
  it("rangeStyle devuelve las propiedades comunes y omite las mixtas", () => {
    expect(rangeStyle(two, 0, 5)).toMatchObject({ weight: 400, fontFamily: "Lora" });
    const mixed = rangeStyle(two, 0, 10);
    expect(mixed.weight).toBeUndefined();
    expect(mixed.fontFamily).toBe("Lora");
  });
  it("replaceText: lo insertado hereda el estilo anterior y los fragmentos sobreviven", () => {
    const r = replaceText(two, "Hola, mundo");
    expect(r.map((x) => [x.text, x.weight])).toEqual([["Hola, ", 400], ["mundo", 700]]);
    const del = replaceText(two, "Hmundo");
    expect(runsToText(del)).toBe("Hmundo");
    expect(del.map((x) => x.weight)).toEqual([400, 700]);
    const tail = replaceText(two, "Hola mundo!");
    expect(tail[tail.length - 1]).toMatchObject({ text: "mundo!", weight: 700 });
  });
  it("vaciar el texto conserva un fragmento vacío con el estilo", () => {
    const r = replaceText(two, "");
    expect(r).toEqual([run("")]);
    expect(replaceText(r, "x")).toEqual([run("x")]);
    expect(normalizeRuns([])).toEqual([]);
  });
  it("el resultado siempre valida contra el esquema", () => {
    const doc: Project = { ...baseProject(), elements: [textEl("t", { runs: replaceText(applyStyleToRange(two, 1, 7, { underline: true }), "Hola\nmundo") })] };
    expect(projectSchema.safeParse(doc).success).toBe(true);
  });
});

describe("maquetación", () => {
  it("envuelve al ancho de la caja y coloca los fragmentos", () => {
    const l = layoutText(el({ width: 4 }), 72, measure); // 288 px: 8 letras
    expect(l.lines.map((x) => x.pieces.map((p) => p.text).join(""))).toEqual(["hola", "mundo"]);
    expect(l.heightPx).toBe(144);
    expect(l.lines[1]!.top).toBe(72);
  });
  it("respeta saltos de línea explícitos y líneas vacías", () => {
    const l = layoutText(el({ runs: [run("a\n\nb")] }), 72, measure);
    expect(l.lines).toHaveLength(3);
    expect(l.lines[1]!.pieces).toHaveLength(0);
    expect(l.heightPx).toBe(216);
  });
  it("una palabra repartida en dos fragmentos no se parte entre ellos", () => {
    const l = layoutText(el({ width: 2, runs: [run("ab"), run("cd", { weight: 700 })] }), 72, measure);
    expect(l.lines).toHaveLength(1);
    expect(l.lines[0]!.pieces.map((p) => [p.text, p.x, p.style.font.includes("700")])).toEqual([["ab", 0, false], ["cd", 72, true]]);
  });
  it("una palabra más ancha que la caja se parte en trozos", () => {
    const l = layoutText(el({ width: 1, runs: [run("abcdef")] }), 72, measure); // 72 px: 2 letras
    expect(l.lines.map((x) => x.pieces.map((p) => p.text).join(""))).toEqual(["ab", "cd", "ef"]);
  });
  it("alineación, justificado e interlineado", () => {
    const text = [run("ab cd ef")];
    const w = (align: TextElement["align"]) => layoutText(el({ width: 6, align, runs: text }), 72, measure).lines[0]!;
    expect(w("left").pieces[0]!.x).toBe(0);
    expect(w("center").pieces[0]!.x).toBe((432 - 288) / 2);
    expect(w("right").pieces[0]!.x).toBe(432 - 288);
    expect(layoutText(el({ width: 6, align: "justify", runs: text }), 72, measure).lines[0]!.pieces.at(-1)!.x).toBe(216); // última línea: sin justificar
    const j = layoutText(el({ width: 3, align: "justify", runs: [run("ab cd ef")] }), 72, measure); // 216: "ab cd" cabe justo
    expect(j.lines[0]!.pieces.at(-1)!.x + j.lines[0]!.pieces.at(-1)!.width).toBeCloseTo(216);
    expect(layoutText(el({ lineHeight: 1.5 }), 72, measure).lines[0]!.height).toBe(108);
  });
  it("el espaciado entre letras (em) ensancha cada carácter", () => {
    const l = layoutText(el({ runs: [run("abc")], letterSpacing: 0.5, width: 20 }), 72, measure);
    expect(l.lines[0]!.width).toBe(3 * 36 + 3 * 36);
    expect(l.lines[0]!.pieces[0]!.style.spacingPx).toBe(36);
  });
  it("mayúsculas y cuerpo proporcional a la escala", () => {
    const a = layoutText(el({ runs: [run("ab", { uppercase: true })] }), 72, measure);
    expect(a.lines[0]!.pieces[0]!.text).toBe("AB");
    const b = layoutText(el({ runs: [run("ab")] }), 144, measure);
    expect(b.lines[0]!.pieces[0]!.style.fontPx).toBe(144);
    expect(b.heightPx).toBe(144);
  });
  it("sin curvatura no hay letras sobre arco; con curvatura sí, simétricas y sobre un arco", () => {
    expect(layoutText(el(), 72, measure).glyphs).toBeNull();
    const up = layoutText(el({ runs: [run("abcd")], curvature: 50, width: 6 }), 72, measure).glyphs!;
    expect(up).toHaveLength(4);
    expect(up[0]!.x + up[3]!.x).toBeCloseTo(432, 5); // simétrico respecto al centro de la caja
    expect(up[0]!.y).toBeCloseTo(up[3]!.y, 5);
    expect(up[0]!.y).toBeGreaterThan(up[1]!.y); // arco hacia arriba: los extremos caen
    expect(up[0]!.rotation).toBeLessThan(0);
    expect(up[3]!.rotation).toBeGreaterThan(0);
    const down = layoutText(el({ runs: [run("abcd")], curvature: -50, width: 6 }), 72, measure).glyphs!;
    expect(down[0]!.y).toBeLessThan(down[1]!.y);
    expect(down[0]!.rotation).toBeGreaterThan(0);
    // las letras equidistan del centro del arco
    const r = (g: { x: number; y: number }, cy: number) => Math.hypot(g.x - 216, g.y - cy);
    const radius = 144 / (0.5 * Math.PI);
    const baseline = layoutText(el({ runs: [run("abcd")], curvature: 50, width: 6 }), 72, measure).lines[0]!.baseline;
    for (const g of up) expect(r(g, baseline + radius)).toBeCloseTo(radius, 4);
  });
  it("curvatura 100 reparte la línea sobre media circunferencia", () => {
    const g = layoutText(el({ runs: [run("abcdefgh")], curvature: 100, width: 10 }), 72, measure).glyphs!;
    const first = g[0]!, last = g.at(-1)!;
    expect(Math.abs(first.rotation)).toBeLessThan(Math.PI / 2);
    expect(Math.abs(first.rotation) + Math.abs(last.rotation)).toBeGreaterThan(Math.PI * 0.8);
  });
});

describe("efectos y renderDocument", () => {
  it("sombra y contorno siguen las fórmulas del mockup", () => {
    const e = el({ shadow: { on: true, intensity: 100 }, outline: { on: true, width: 12, color: "#112233" } });
    const fx = textEffects(e, 72);
    expect(fx.shadow).toMatchObject({ dx: 0, dy: 3.6, blur: 11.52 });
    expect(fx.outline).toEqual({ width: 7.2, color: "#112233" });
    expect(textEffects(el(), 72)).toEqual({ shadow: null, outline: null });
  });
  it("renderDocument incluye maquetación solo con medidor, y la textura cubre la caja", () => {
    const doc: Project = {
      ...baseProject(),
      assets: [{ id: "tx", kind: "image", mimeType: "image/png", metadata: { widthPx: 600, heightPx: 300 } }],
      elements: [textEl("t", { width: 3, height: 1, texture: { assetId: "tx" } })],
    };
    const bare = renderDocument(doc, { pxPerInch: 100 }).items[0]!;
    expect(bare.kind === "text" && bare.layout).toBeNull();
    const full = renderDocument(doc, { pxPerInch: 100, measureText: measure }).items[0]!;
    if (full.kind !== "text") throw new Error("texto");
    expect(full.layout!.lines.length).toBeGreaterThan(0);
    // caja 300x100 sobre imagen 600x300: cubrir recorta la altura de origen a 200
    expect(full.texture).toMatchObject({ assetId: "tx", dest: { x: 0, y: 0, width: 300, height: 100 }, src: { width: 600, height: 200 } });
    expect(dpiReport(doc).find((d) => d.id === "t")).toMatchObject({ dpi: 200, lowDpi: true });
  });
  it("la maquetación es determinista (misma entrada, mismo resultado)", () => {
    const doc: Project = { ...baseProject(), elements: [textEl("t", { runs: [run("uno dos tres"), run(" cuatro", { italic: true })], curvature: 30 })] };
    const a = renderDocument(doc, { pxPerInch: 300, measureText: measure });
    const b = renderDocument(doc, { pxPerInch: 300, measureText: measure });
    expect(a).toEqual(b);
  });
});

describe("checkFontsReady", () => {
  const fontAsset = { id: "f1", kind: "font" as const, mimeType: "font/ttf", metadata: { family: "Mi Fuente" } };
  const doc = (runs: TextRun[], extra: Partial<Project> = {}): Project => ({ ...baseProject(), elements: [textEl("t", { runs })], ...extra });
  const states = (m: Record<string, FontState>) => (f: string) => m[f];
  it("listo cuando todas las fuentes usadas están cargadas; las del sistema no se exigen", () => {
    const d = doc([run("a", { fontFamily: "Lora" }), run("b", { fontFamily: "Georgia" }), run("c", { fontFamily: "Mi Fuente" })], { assets: [fontAsset] });
    expect(checkFontsReady(d, states({ Lora: "loaded", "Mi Fuente": "loaded" }))).toEqual({ ok: true });
  });
  it("informa fuentes fallidas, en carga, sin cargar y desconocidas, con sus elementos", () => {
    const d = doc([run("a", { fontFamily: "Lora" }), run("b", { fontFamily: "Mi Fuente" }), run("c", { fontFamily: "Oswald" }), run("d", { fontFamily: "Rara" })], { assets: [fontAsset] });
    const r = checkFontsReady(d, states({ Lora: "failed", "Mi Fuente": "loading" }));
    expect(r).toEqual({
      ok: false,
      problems: [
        { family: "Lora", reason: "failed", elementIds: ["t"] },
        { family: "Mi Fuente", reason: "loading", elementIds: ["t"] },
        { family: "Oswald", reason: "not_loaded", elementIds: ["t"] },
        { family: "Rara", reason: "missing", elementIds: ["t"] },
      ],
    });
  });
  it("ignora elementos ocultos y fragmentos vacíos", () => {
    const d: Project = { ...baseProject(), elements: [textEl("a", { visible: false, runs: [run("x", { fontFamily: "Lora" })] }), textEl("b", { runs: [run("", { fontFamily: "Lora" })] })] };
    expect(usedFamilies(d).size).toBe(0);
    expect(checkFontsReady(d, () => "failed")).toEqual({ ok: true });
  });
});

describe("comandos con texto enriquecido", () => {
  it("un bloque con dos fragmentos de estilo distinto sobrevive a serializar y reabrir", () => {
    const runs = [run("Título ", { weight: 700, color: "#aa0000" }), run("subtítulo", { italic: true, fontFamily: "Cormorant Garamond", fontSizePt: 30 })];
    const r = applyCommand(createProject({ id: "p" }), { type: "addElement", element: textEl("t", { runs, curvature: 40, shadow: { on: true, intensity: 70 } }) }, 0);
    if (!r.ok) throw new Error("addElement");
    const reopened = projectSchema.parse(JSON.parse(JSON.stringify(r.doc)));
    const t = reopened.elements[0] as TextElement;
    expect(t.runs).toEqual(runs);
    expect(t.curvature).toBe(40);
    expect(t.shadow).toEqual({ on: true, intensity: 70 });
    // y editar un fragmento es un único comando
    const u = applyCommand(reopened, { type: "updateElement", id: "t", props: { runs: applyStyleToRange(t.runs, 0, 3, { underline: true }) } }, reopened.revision);
    expect(u.ok && (u.doc.elements[0] as TextElement).runs.map((x) => x.underline)).toEqual([true, false, false]);
  });
});
