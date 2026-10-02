import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { createProject, type Project, type TextElement } from "@free-book-cover/core";
import { FontRegistry, type FontEnv } from "../src/fonts/fontRegistry";
import { importFont } from "../src/fonts/importFont";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

const run = (family: string, over = {}) => ({ text: "x", fontFamily: family, fontSizePt: 24, weight: 400, italic: false, underline: false, uppercase: false, color: "#ffffff", ...over });
const textEl = (id: string, family: string): TextElement => ({
  id, type: "text", x: 0, y: 0, width: 3, height: 1, rotation: 0, zIndex: 0, visible: true, runs: [run(family)], align: "left", lineHeight: 1.2, letterSpacing: 0,
  shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#000000" }, curvature: 0,
});
const docWith = (...families: string[]): Project => ({ ...createProject({ id: "p" }), elements: families.map((f, i) => textEl(`t${i}`, f)) });
const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeEnv(opts: { addOk?: (family: string) => boolean; catalog?: (family: string) => boolean | Error } = {}): FontEnv & { added: string[]; asked: string[] } {
  const added: string[] = [], asked: string[] = [];
  return {
    added, asked,
    async addFace(family) {
      if (opts.addOk && !opts.addOk(family)) throw new Error("fuente corrupta");
      added.push(family);
    },
    async loadCatalog(family, weight, italic) {
      asked.push(`${family}|${weight}|${italic}`);
      const r = opts.catalog?.(family) ?? true;
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

describe("FontRegistry", () => {
  it("las fuentes del sistema siempre están listas; las del catálogo pasan de loading a loaded", async () => {
    const reg = new FontRegistry(fakeEnv());
    expect(reg.stateOf("Georgia")).toBe("loaded");
    expect(reg.stateOf("Lora")).toBeUndefined();
    reg.ensureDoc(docWith("Lora"));
    expect(reg.stateOf("Lora")).toBe("loading");
    await tick();
    expect(reg.stateOf("Lora")).toBe("loaded");
  });
  it("pide cada combinación familia/peso/cursiva una sola vez", async () => {
    const env = fakeEnv();
    const reg = new FontRegistry(env);
    const d = docWith("Lora", "Lora");
    reg.ensureDoc(d);
    reg.ensureDoc(d);
    expect(env.asked).toEqual(["Lora|400|false"]);
  });
  it("un fallo de red o una fuente sin cara definida queda como failed y notifica", async () => {
    const reg = new FontRegistry(fakeEnv({ catalog: (f) => (f === "Lora" ? new Error("red") : false) }));
    const seen = vi.fn();
    reg.subscribe(seen);
    reg.ensureDoc(docWith("Lora", "Oswald"));
    await tick();
    expect(reg.stateOf("Lora")).toBe("failed");
    expect(reg.stateOf("Oswald")).toBe("failed");
    expect(seen).toHaveBeenCalled();
  });
  it("sin soporte de FontFace todo lo que no es del sistema falla de forma visible", async () => {
    const reg = new FontRegistry(null);
    reg.ensureDoc(docWith("Lora"));
    expect(reg.stateOf("Lora")).toBe("failed");
    expect((await reg.registerUpload("Mia", new ArrayBuffer(8))).ok).toBe(false);
  });
  it("registerUpload: carga correcta y fallo sin dejar rastro", async () => {
    const reg = new FontRegistry(fakeEnv({ addOk: (f) => f !== "Mala" }));
    expect(await reg.registerUpload("Buena", new ArrayBuffer(4))).toEqual({ ok: true });
    expect(reg.stateOf("Buena")).toBe("loaded");
    const bad = await reg.registerUpload("Mala", new ArrayBuffer(4));
    expect(bad).toMatchObject({ ok: false, message: "fuente corrupta" });
    expect(reg.stateOf("Mala")).toBeUndefined();
  });
  it("syncAssets: recarga las fuentes guardadas; sin blob o con blob corrupto quedan failed", async () => {
    const env = fakeEnv({ addOk: (f) => f !== "Rota" });
    const reg = new FontRegistry(env);
    const asset = (id: string, family: string) => ({ id, kind: "font" as const, mimeType: "font/ttf", metadata: { family } });
    await reg.syncAssets([asset("a", "Ok"), asset("b", "Rota"), asset("c", "SinBlob")], [{ id: "a", blob: new Blob(["1"]) }, { id: "b", blob: new Blob(["2"]) }]);
    expect(reg.stateOf("Ok")).toBe("loaded");
    expect(reg.stateOf("Rota")).toBe("failed");
    expect(reg.stateOf("SinBlob")).toBe("failed");
    expect(reg.failureOf("SinBlob")).toBe("missing-blob");
    expect(env.added).toEqual(["Ok"]);
  });
  it("checkFontsReady bloquea fuentes fallidas, sin cargar y desconocidas", async () => {
    const reg = new FontRegistry(fakeEnv({ catalog: (f) => f !== "Oswald" }));
    const d = docWith("Lora", "Oswald", "Georgia", "Rara");
    expect(reg.checkFontsReady(d)).toMatchObject({ ok: false });
    reg.ensureDoc(d);
    await tick();
    const r = reg.checkFontsReady(d);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problems.map((p) => [p.family, p.reason])).toEqual([["Oswald", "failed"], ["Rara", "missing"]]);
    expect(reg.checkFontsReady(docWith("Lora", "Georgia"))).toEqual({ ok: true });
  });
});

// Blob con un tamaño declarado (no se reservan cientos de MB en la prueba).
const sized = (mb: number) => Object.defineProperty(new Blob(["x"]), "size", { value: mb * 1024 * 1024 });
async function fill(store: Awaited<ReturnType<typeof mk>>["store"]) {
  for (let i = 0; i < 5; i++) await store.addAsset({ id: `img${i}`, kind: "image", mimeType: "image/png", metadata: {} }, sized(99), { widthPx: 1, heightPx: 1 });
}
const ttf = (extra = 0) => new Uint8Array([0, 1, 0, 0, ...new Array(extra).fill(7)]);
const file = (name: string, bytes: Uint8Array) => new File([bytes as BlobPart], name);
let n = 0;
async function mk(env: FontEnv) {
  let i = 0;
  const store = createEditorStore({ storage: await openStorage(`fnt-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  await store.init();
  return { store, reg: new FontRegistry(env) };
}

describe("importFont", () => {
  it("carga, guarda el blob como recurso de fuente y fija una familia única", async () => {
    const { store, reg } = await mk(fakeEnv());
    const r = await importFont(store, reg, file("Mi Fuente.ttf", ttf(10)));
    expect(r).toEqual({ ok: true, family: "Mi Fuente", assetId: "id2" });
    const doc = store.getState().history.present;
    expect(doc.assets[0]).toMatchObject({ kind: "font", mimeType: "font/ttf", metadata: { family: "Mi Fuente", name: "Mi Fuente.ttf", format: "ttf" } });
    expect(store.getState().assets.find((a) => a.id === "id2")!.blob.size).toBe(14);
    const again = await importFont(store, reg, file("Mi Fuente.ttf", ttf()));
    expect(again).toMatchObject({ ok: true, family: "Mi Fuente 2" });
    const clash = await importFont(store, reg, file("Lora.otf", Uint8Array.from([..."OTTO"].map((c) => c.charCodeAt(0)))));
    expect(clash).toMatchObject({ ok: true, family: "Lora 2" });
  });
  it("rechaza extensiones y firmas no admitidas sin guardar nada", async () => {
    const { store, reg } = await mk(fakeEnv());
    expect(await importFont(store, reg, file("a.woff", ttf()))).toEqual({ ok: false, reason: "unsupported" });
    expect(store.getState().error).toEqual({ kind: "unsupported_font" });
    expect(await importFont(store, reg, file("a.ttf", new Uint8Array([1, 2, 3, 4, 5])))).toEqual({ ok: false, reason: "unsupported" });
    expect(store.getState().assets).toHaveLength(0);
  });
  it("una fuente que no carga se informa y no se guarda", async () => {
    const { store, reg } = await mk(fakeEnv({ addOk: () => false }));
    expect(await importFont(store, reg, file("Rota.ttf", ttf()))).toEqual({ ok: false, reason: "load" });
    expect(store.getState().error).toEqual({ kind: "font_load_failed", family: "Rota" });
    expect(store.getState().assets).toHaveLength(0);
    expect(store.getState().history.present.assets).toHaveLength(0);
  });
  it("respeta el límite de 20 MB antes de leer el archivo", async () => {
    const { store, reg } = await mk(fakeEnv());
    const big = file("Grande.ttf", ttf());
    Object.defineProperty(big, "size", { value: 20 * 1024 * 1024 + 1 });
    const spy = vi.spyOn(big, "arrayBuffer");
    expect(await importFont(store, reg, big)).toEqual({ ok: false, reason: "limit" });
    expect(store.getState().error).toMatchObject({ kind: "limit", error: { kind: "font_too_large" } });
    expect(spy).not.toHaveBeenCalled();
  });
  it("si el proyecto no admite el recurso, la fuente se olvida (sin blob huérfano)", async () => {
    const env = fakeEnv();
    const { store, reg } = await mk(env);
    const big = file("Casi.ttf", ttf(6 * 1024 * 1024));
    // proyecto casi lleno: el blob nuevo superaría los 500 MB
    await fill(store);
    const r = await importFont(store, reg, big);
    expect(r).toMatchObject({ ok: false, reason: "limit" });
    expect(reg.stateOf("Casi")).toBeUndefined();
  });
});

describe("addDerivedBlob y el máximo del proyecto", () => {
  it("rechaza un derivado que haría superar los 500 MB", async () => {
    const { store } = await mk(fakeEnv());
    await fill(store);
    expect(await store.addDerivedBlob("img.thumb", sized(6))).toBe(false);
    expect(store.getState().assets.some((a) => a.id === "img.thumb")).toBe(false);
    expect(await store.addDerivedBlob("img.thumb", new Blob(["y"]))).toBe(true);
  });
});
