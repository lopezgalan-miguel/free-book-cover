import { describe, expect, it } from "vitest";
import { availableFaces, availableWeights, checkFontsReady, hasFace, nearestFace, type Project, type TextRun } from "../src/index.js";
import { baseProject, textEl } from "./fixtures.js";

const run = (text: string, over: Partial<TextRun> = {}): TextRun => ({ text, fontFamily: "Lora", fontSizePt: 72, weight: 400, italic: false, underline: false, uppercase: false, color: "#ffffff", ...over });

describe("caras disponibles por familia (R-04)", () => {
  const doc = (runs: TextRun[], extra: Partial<Project> = {}): Project => ({ ...baseProject(), elements: [textEl("t", { runs })], ...extra });
  const loaded = () => "loaded" as const;
  it("lista solo los pesos y cursivas publicados", () => {
    expect(availableWeights("Oswald", false)).toEqual([300, 400, 500, 600, 700]);
    expect(availableWeights("Oswald", true)).toEqual([]);
    expect(availableWeights("Lora", true)).toEqual([400]);
    expect(hasFace("Cinzel", 700, true)).toBe(false);
    expect(hasFace("Playfair Display", 800, false)).toBe(true);
    expect(availableFaces("Desconocida")).toBeNull();
  });
  it("una fuente subida es una cara sin cursiva", () => {
    const own = new Set(["Mi Fuente"]);
    expect(hasFace("Mi Fuente", 700, false, own)).toBe(true);
    expect(hasFace("Mi Fuente", 400, true, own)).toBe(false);
    expect(availableWeights("Mi Fuente", false, own)).toEqual([400]);
  });
  it("nearestFace prefiere la cursiva y, si no existe, cae a la normal", () => {
    expect(nearestFace("Lora", 700, true)).toEqual({ weight: 400, italic: true });
    expect(nearestFace("Oswald", 700, true)).toEqual({ weight: 700, italic: false });
    expect(nearestFace("Marcellus", 700, false)).toEqual({ weight: 400, italic: false });
    expect(nearestFace("Desconocida", 400, false)).toBeNull();
  });
  it("checkFontsReady no da por buena la cara más próxima: cursiva sin cara real", () => {
    const d = doc([run("a", { fontFamily: "Oswald", italic: true }), run("b", { fontFamily: "Lora", weight: 700, italic: true })]);
    expect(checkFontsReady(d, loaded)).toEqual({
      ok: false,
      problems: [
        { family: "Oswald", reason: "face_missing", elementIds: ["t"], faces: [{ weight: 400, italic: true }] },
        { family: "Lora", reason: "face_missing", elementIds: ["t"], faces: [{ weight: 700, italic: true }] },
      ],
    });
  });
  it("peso inexistente en catálogo y en fuentes del sistema; los existentes pasan", () => {
    const bad = doc([run("a", { fontFamily: "Marcellus", weight: 700 }), run("b", { fontFamily: "Georgia", weight: 500 })]);
    const r = checkFontsReady(bad, loaded);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problems.map((p) => [p.family, p.reason])).toEqual([["Marcellus", "face_missing"], ["Georgia", "face_missing"]]);
    expect(checkFontsReady(doc([run("a", { fontFamily: "Lora", weight: 500 }), run("b", { fontFamily: "Georgia", weight: 700, italic: true })]), loaded)).toEqual({ ok: true });
  });
  it("fuente subida con cursiva pedida es face_missing; con otro peso no", () => {
    const asset = { id: "f1", kind: "font" as const, mimeType: "font/ttf", metadata: { family: "Mi Fuente" } };
    expect(checkFontsReady(doc([run("a", { fontFamily: "Mi Fuente", weight: 700 })], { assets: [asset] }), loaded)).toEqual({ ok: true });
    const r = checkFontsReady(doc([run("a", { fontFamily: "Mi Fuente", italic: true })], { assets: [asset] }), loaded);
    expect(!r.ok && r.problems[0]).toMatchObject({ reason: "face_missing" });
  });
  it("una fuente fallida se informa como failed antes que por sus caras", () => {
    const r = checkFontsReady(doc([run("a", { fontFamily: "Oswald", italic: true })]), () => "failed");
    expect(!r.ok && r.problems[0]?.reason).toBe("failed");
  });
});
