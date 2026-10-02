import { describe, expect, it, vi } from "vitest";
import { createProject, type Project } from "@free-book-cover/core";
import { runExport, usedImageAssets, type ExportDeps, type ExportRequest } from "../src/export/exportImage";
import { FontRegistry, type FontEnv } from "../src/fonts/fontRegistry";

const doc = (): Project => createProject({ id: "p", name: "Mi libro" });
const req = (over: Partial<ExportRequest> = {}): ExportRequest => ({
  doc: doc(), widthPx: 1080, heightPx: 1350, format: "png", quality: 90, destination: "Instagram · Feed", projectName: "Mi libro", ...over,
});
const okFonts: ExportDeps["fonts"] = { ensureDoc: () => {}, whenSettled: async () => {}, checkFontsReady: () => ({ ok: true }) };
const deps = (over: Partial<ExportDeps> = {}): ExportDeps => ({
  fonts: okFonts,
  missingAssets: () => [],
  render: vi.fn(async () => ({ canvas: true })),
  encode: vi.fn(async (_c, mime) => new Blob([new Uint8Array(1234)], { type: mime })),
  ...over,
});

describe("runExport", () => {
  it("devuelve el archivo y el informe con formato, dimensiones, peso y destino", async () => {
    const d = deps();
    const r = await runExport(req(), d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.blob.type).toBe("image/png");
    expect(r.report).toMatchObject({ format: "png", widthPx: 1080, heightPx: 1350, bytes: 1234, destination: "Instagram · Feed", fileName: "mi-libro-instagram-feed-1080x1350.png" });
    expect(d.render).toHaveBeenCalledWith(expect.anything(), { widthPx: 1080, heightPx: 1350 });
    // PNG no recibe calidad
    expect(d.encode).toHaveBeenCalledWith(expect.anything(), "image/png", undefined);
  });
  it("JPEG y WebP reciben la calidad (acotada 1..100) y la reflejan en el informe", async () => {
    const d = deps();
    const r = await runExport(req({ format: "jpeg", quality: 80 }), d);
    expect(d.encode).toHaveBeenLastCalledWith(expect.anything(), "image/jpeg", 0.8);
    expect(r.ok && r.report.quality).toBe(80);
    await runExport(req({ format: "webp", quality: 500 }), d);
    expect(d.encode).toHaveBeenLastCalledWith(expect.anything(), "image/webp", 1);
  });
  it("rechaza un formato que el destino no admite, sin renderizar", async () => {
    const d = deps();
    const r = await runExport(req({ format: "webp", allowedFormats: ["png", "jpeg"] }), d);
    expect(r).toEqual({ ok: false, error: { kind: "format_not_allowed", format: "webp" } });
    expect(d.render).not.toHaveBeenCalled();
  });
  it("bloquea por encima de 50 MP con error explícito y tamaño sugerido, sin renderizar", async () => {
    const d = deps();
    const r = await runExport(req({ widthPx: 10001, heightPx: 5000 }), d);
    expect(r.ok).toBe(false);
    if (r.ok || r.error.kind !== "limit") throw new Error("esperaba límite");
    expect(r.error.limitMegapixels).toBe(50);
    expect(r.error.megapixels).toBeGreaterThan(50);
    expect(r.error.suggested!.widthPx * r.error.suggested!.heightPx).toBeLessThanOrEqual(50e6);
    expect(d.render).not.toHaveBeenCalled();
    expect((await runExport(req({ widthPx: 10000, heightPx: 5000 }), d)).ok).toBe(true);
  });
  it("bloquea si hay fuentes sin cargar o fallidas y lo informa", async () => {
    const problems = [{ family: "Rota", reason: "failed" as const, elementIds: ["t1"] }];
    const d = deps({ fonts: { ...okFonts, checkFontsReady: () => ({ ok: false, problems }) } });
    const r = await runExport(req(), d);
    expect(r).toEqual({ ok: false, error: { kind: "fonts", problems } });
    expect(d.render).not.toHaveBeenCalled();
  });
  it("pide las fuentes del documento y espera a que terminen antes de comprobarlas", async () => {
    const order: string[] = [];
    const d = deps({
      fonts: {
        ensureDoc: () => void order.push("ensure"),
        whenSettled: async () => void order.push("settled"),
        checkFontsReady: () => (order.push("check"), { ok: true }),
      },
    });
    await runExport(req(), d);
    expect(order).toEqual(["ensure", "settled", "check"]);
  });
  it("bloquea si faltan originales de imagen", async () => {
    const d = deps({ missingAssets: () => ["a1"] });
    expect(await runExport(req(), d)).toEqual({ ok: false, error: { kind: "missing_assets", assetIds: ["a1"] } });
  });
  it("si el navegador no codifica el formato pedido no entrega otro en silencio", async () => {
    const d = deps({ encode: async () => new Blob([new Uint8Array(10)], { type: "image/png" }) });
    expect(await runExport(req({ format: "webp" }), d)).toEqual({ ok: false, error: { kind: "encode_unsupported", format: "webp" } });
    const d2 = deps({ encode: async () => null });
    expect((await runExport(req(), d2)).ok).toBe(false);
  });
  it("un fallo al rasterizar se informa", async () => {
    const d = deps({ render: async () => { throw new Error("boom"); } });
    expect(await runExport(req(), d)).toEqual({ ok: false, error: { kind: "render_failed", message: "boom" } });
  });
});

describe("usedImageAssets", () => {
  it("fondo, imágenes visibles y texturas; ignora ocultos", () => {
    const p = doc();
    p.canvas.background = { assetId: "bg" };
    p.assets = ["bg", "i1", "i2", "tx"].map((id) => ({ id, kind: "image" as const, mimeType: "image/png", metadata: {} }));
    const base = { x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0 };
    p.elements = [
      { ...base, id: "e1", type: "image", visible: true, assetRef: { assetId: "i1" }, crop: { x: 0, y: 0, width: 1, height: 1 }, fit: "cover" },
      { ...base, id: "e2", type: "image", visible: false, assetRef: { assetId: "i2" }, crop: { x: 0, y: 0, width: 1, height: 1 }, fit: "cover" },
    ];
    expect(usedImageAssets(p).sort()).toEqual(["bg", "i1"]);
  });
});

describe("FontRegistry: reintento y espera", () => {
  const textDoc = (family: string): Project => {
    const p = doc();
    p.elements = [{
      id: "t", type: "text", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0, visible: true,
      runs: [{ text: "x", fontFamily: family, fontSizePt: 12, weight: 400, italic: false, underline: false, uppercase: false, color: "#000000" }],
      align: "left", lineHeight: 1.2, letterSpacing: 0, shadow: { on: false, intensity: 0 }, outline: { on: false, width: 0, color: "#000000" }, curvature: 0,
    }];
    return p;
  };
  it("una fuente de catálogo fallida se reintenta y se recupera", async () => {
    let calls = 0;
    const env: FontEnv = {
      addFace: async () => {},
      loadCatalog: async () => { calls++; if (calls === 1) throw new Error("sin red"); return true; },
    };
    const reg = new FontRegistry(env);
    const d = textDoc("Lora");
    reg.ensureDoc(d);
    await reg.whenSettled(d);
    expect(reg.checkFontsReady(d)).toMatchObject({ ok: false, problems: [{ family: "Lora", reason: "failed" }] });
    // sin reintento seguiría fallida
    reg.ensureDoc(d);
    expect(reg.stateOf("Lora")).toBe("failed");
    await reg.retryFailed(d, []);
    expect(calls).toBe(2);
    expect(reg.checkFontsReady(d)).toEqual({ ok: true });
  });
  it("whenSettled espera mientras carga y respeta el tope de tiempo", async () => {
    let release!: (v: boolean) => void;
    const env: FontEnv = { addFace: async () => {}, loadCatalog: () => new Promise<boolean>((r) => (release = r)) };
    const reg = new FontRegistry(env);
    const d = textDoc("Lora");
    reg.ensureDoc(d);
    let settled = false;
    const p = reg.whenSettled(d).then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    release(true);
    await p;
    expect(reg.stateOf("Lora")).toBe("loaded");
    const slow = new FontRegistry({ addFace: async () => {}, loadCatalog: () => new Promise<boolean>(() => {}) });
    slow.ensureDoc(d);
    await slow.whenSettled(d, 20);
    expect(slow.stateOf("Lora")).toBe("loading");
  });
});
