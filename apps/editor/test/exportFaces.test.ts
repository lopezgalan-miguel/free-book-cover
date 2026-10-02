import { describe, expect, it, vi } from "vitest";
import { createProject, type Project, type TextElement } from "@free-book-cover/core";
import { runExport, type ExportDeps } from "../src/export/exportImage";
import { FontRegistry, type FontEnv } from "../src/fonts/fontRegistry";

const el = (family: string, over: { weight?: number; italic?: boolean } = {}): TextElement => ({
  id: "t", type: "text", x: 0, y: 0, width: 3, height: 1, rotation: 0, zIndex: 0, visible: true,
  runs: [{ text: "x", fontFamily: family, fontSizePt: 24, weight: over.weight ?? 400, italic: over.italic ?? false, underline: false, uppercase: false, color: "#ffffff" }],
  align: "left", lineHeight: 1.2, letterSpacing: 0, shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#000000" }, curvature: 0,
});
const docWith = (e: TextElement): Project => ({ ...createProject({ id: "p", name: "L" }), elements: [e] });
// El navegador «encuentra» siempre alguna cara (la más próxima): justo lo que ocultaba la sustitución.
const lenientEnv = (asked: string[]): FontEnv => ({ addFace: async () => undefined, loadCatalog: async (f, w, i) => (asked.push(`${f}|${w}|${i}`), true) });

describe("exportación con caras inexistentes (R-04)", () => {
  const deps = (fonts: FontRegistry): ExportDeps => ({
    fonts, missingAssets: () => [], render: vi.fn(async () => ({})), encode: vi.fn(async (_c, mime) => new Blob(["x"], { type: mime })),
  });
  const req = (doc: Project) => ({ doc, widthPx: 100, heightPx: 100, format: "png" as const, quality: 90, destination: "d", projectName: "L" });

  it("cursiva sin cara real: bloquea la exportación en lugar de dar por cargada la cara más próxima", async () => {
    const asked: string[] = [];
    const fonts = new FontRegistry(lenientEnv(asked));
    const d = deps(fonts);
    const r = await runExport(req(docWith(el("Oswald", { italic: true }))), d);
    expect(r).toMatchObject({ ok: false, error: { kind: "fonts", problems: [{ family: "Oswald", reason: "face_missing", faces: [{ weight: 400, italic: true }] }] } });
    expect(d.render).not.toHaveBeenCalled();
    expect(asked).toEqual([]);
  });
  it("peso inexistente (Cinzel 300) también bloquea; los pesos reales exportan", async () => {
    const fonts = new FontRegistry(lenientEnv([]));
    const d = deps(fonts);
    expect((await runExport(req(docWith(el("Cinzel", { weight: 300 }))), d)).ok).toBe(false);
    expect((await runExport(req(docWith(el("Cinzel", { weight: 700 }))), d)).ok).toBe(true);
  });
  it("fuente del sistema con peso que no tiene (Georgia 500) bloquea", async () => {
    const d = deps(new FontRegistry(lenientEnv([])));
    expect(await runExport(req(docWith(el("Georgia", { weight: 500 }))), d)).toMatchObject({ ok: false, error: { kind: "fonts", problems: [{ reason: "face_missing" }] } });
  });
});
