import { describe, expect, it } from "vitest";
import { applyCommand, referencedAssetIds, unusedAssetIds, type Asset, type Project } from "../src/index.js";
import { baseProject, imageEl, textEl } from "./fixtures.js";

const img = (id: string): Asset => ({ id, kind: "image", mimeType: "image/png", metadata: {} });
const font = (id: string, family: string): Asset => ({ id, kind: "font", mimeType: "font/ttf", metadata: { family } });

describe("recursos sin uso", () => {
  it("detecta imágenes sustituidas y fuentes sin texto, y respeta lo que se pinta", () => {
    const p: Project = {
      ...baseProject(),
      assets: [img("bg"), img("old"), img("el"), img("tex"), font("f1", "Mi Fuente"), font("f2", "Otra")],
      canvas: { ...baseProject().canvas, background: { assetId: "bg" } },
      elements: [
        imageEl("i", "el", { visible: false }),
        textEl("t", { texture: { assetId: "tex" }, runs: [{ text: "a", fontFamily: "Mi Fuente", fontSizePt: 20, weight: 400, italic: false, underline: false, uppercase: false, color: "#ffffff" }] }),
      ],
    };
    expect(unusedAssetIds(p)).toEqual(["old", "f2"]);
  });
  it("quitar el elemento deja su imagen sin uso y removeAsset ya no falla", () => {
    let p: Project = { ...baseProject(), assets: [img("el")], elements: [imageEl("i", "el")] };
    const r = applyCommand(p, { type: "removeAsset", id: "el" }, p.revision);
    expect(r.ok).toBe(false);
    const r2 = applyCommand(p, { type: "removeElement", id: "i" }, p.revision);
    if (!r2.ok) throw new Error("x");
    p = r2.doc;
    expect(unusedAssetIds(p)).toEqual(["el"]);
    expect(applyCommand(p, { type: "removeAsset", id: "el" }, p.revision).ok).toBe(true);
  });
  it("referencedAssetIds une los recursos de varios documentos", () => {
    const a: Project = { ...baseProject(), assets: [img("a")] };
    const b: Project = { ...baseProject(), assets: [img("b"), img("a")] };
    expect([...referencedAssetIds([a, b])].sort()).toEqual(["a", "b"]);
  });
});
