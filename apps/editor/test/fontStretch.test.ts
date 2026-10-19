import { describe, expect, it } from "vitest";
import { createProject, type Project } from "@free-book-cover/core";
import { FontRegistry, type FontEnv } from "../src/fonts/fontRegistry";

const doc = (stretch?: number): Project => ({
  ...createProject({ id: "p" }),
  assets: [{ id: "f1", kind: "font", mimeType: "font/ttf", metadata: { family: "RS" } }],
  elements: [{
    id: "t", type: "text", x: 0, y: 0, width: 3, height: 1, rotation: 0, zIndex: 0, visible: true,
    runs: [{ text: "x", fontFamily: "RS", fontSizePt: 24, weight: 900, italic: false, underline: false, uppercase: false, color: "#ffffff", ...(stretch !== undefined ? { stretch } : {}) }],
    align: "left", lineHeight: 1.2, letterSpacing: 0, shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#000000" }, curvature: 0,
  }],
});
const env = () => {
  const calls: Array<[string, Record<string, string> | undefined]> = [];
  const e: FontEnv = { async addFace(family, _data, d) { calls.push([family, d]); }, loadCatalog: async () => true };
  return { e, calls };
};
const blob = new Blob([new Uint8Array([0, 1, 0, 0])]);

describe("FontRegistry: anchura de fuentes variables", () => {
  it("registra un alias con la anchura fija a partir del archivo subido", async () => {
    const { e, calls } = env();
    const reg = new FontRegistry(e);
    await reg.syncAssets(doc(60).assets, [{ id: "f1", blob }]);
    reg.ensureStretch("RS", 60);
    await reg.whenSettled(doc(60));
    expect(calls).toContainEqual(["RS @wdth 60", { weight: "100 900", stretch: "60%" }]);
    expect(reg.stateOf("RS @wdth 60")).toBe("loaded");
    expect(reg.checkFontsReady(doc(60))).toEqual({ ok: true });
  });
  it("si se pide antes de cargar el archivo, se registra en cuanto carga y la exportación espera", async () => {
    const { e, calls } = env();
    const reg = new FontRegistry(e);
    reg.ensureDoc(doc(75));
    const sync = reg.syncAssets(doc(75).assets, [{ id: "f1", blob }]);
    await reg.whenSettled(doc(75));
    await sync;
    await reg.whenSettled(doc(75));
    expect(calls.map((c) => c[0])).toEqual(["RS", "RS @wdth 75"]);
    expect(reg.checkFontsReady(doc(75))).toEqual({ ok: true });
  });
  it("sin archivo de la fuente, la anchura no se da por cargada", async () => {
    const { e } = env();
    const reg = new FontRegistry(e);
    reg.ensureStretch("RS", 60);
    expect(reg.checkFontsReady(doc(60)).ok).toBe(false);
  });
});
