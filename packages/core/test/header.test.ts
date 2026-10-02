import { describe, expect, it } from "vitest";
import { CANVAS_PRESETS, presetSizeIn, readImageHeader, checkAssetLimits } from "../src/index.js";

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const png = (w: number, h: number) => new Uint8Array([0x89, ...ascii("PNG"), 13, 10, 26, 10, ...be32(13), ...ascii("IHDR"), ...be32(w), ...be32(h), 8, 6, 0, 0, 0]);
const jpeg = (w: number, h: number) =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xc0, 0, 11, 8, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 1, 1, 0x11, 0]);
const riff = (chunk: string, payload: number[]) => new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), ...ascii(chunk), 0, 0, 0, 0, ...payload]);

describe("readImageHeader", () => {
  it("PNG con dimensiones grandes (sin pasar por 32 bits con signo)", () => {
    expect(readImageHeader(png(12000, 8000))).toEqual({ format: "png", mimeType: "image/png", widthPx: 12000, heightPx: 8000 });
  });
  it("JPEG saltando segmentos previos al SOF", () => {
    expect(readImageHeader(jpeg(4032, 3024))).toMatchObject({ format: "jpeg", widthPx: 4032, heightPx: 3024 });
  });
  it("WebP VP8, VP8L y VP8X", () => {
    const vp8 = riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(640), ...le16(480)]);
    expect(readImageHeader(vp8)).toMatchObject({ format: "webp", widthPx: 640, heightPx: 480 });
    const bits = ((300 - 1) | ((200 - 1) << 14)) >>> 0;
    const vp8l = riff("VP8L", [0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >>> 24) & 255, 0]);
    expect(readImageHeader(vp8l)).toMatchObject({ widthPx: 300, heightPx: 200 });
    const vp8x = riff("VP8X", [0, 0, 0, 0, ...le24(10000 - 1), ...le24(7000 - 1)]);
    expect(readImageHeader(vp8x)).toMatchObject({ widthPx: 10000, heightPx: 7000 });
  });
  it("GIF", () => {
    expect(readImageHeader(new Uint8Array([...ascii("GIF89a"), ...le16(50), ...le16(40), 0, 0]))).toMatchObject({ format: "gif", widthPx: 50, heightPx: 40 });
  });
  it("devuelve null con formatos desconocidos, truncados o dimensiones cero", () => {
    expect(readImageHeader(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(readImageHeader(png(10, 10).slice(0, 20))).toBeNull();
    expect(readImageHeader(png(0, 10))).toBeNull();
    expect(readImageHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0]))).toBeNull();
  });
  it("las dimensiones leídas alimentan el límite de 80 Mpx", () => {
    const h = readImageHeader(png(10000, 8001))!;
    const r = checkAssetLimits({ kind: "image", sizeBytes: 1000, widthPx: h.widthPx, heightPx: h.heightPx }, 0);
    expect(r).toEqual({ ok: false, error: { kind: "image_too_many_megapixels", limitMegapixels: 80 } });
    const ok = readImageHeader(png(10000, 8000))!;
    expect(checkAssetLimits({ kind: "image", sizeBytes: 1000, widthPx: ok.widthPx, heightPx: ok.heightPx }, 0).ok).toBe(true);
  });
});

describe("preajustes", () => {
  it("convierten píxeles a pulgadas a 300 ppp", () => {
    const kindle = CANVAS_PRESETS.find((p) => p.id === "kindle")!;
    expect(presetSizeIn(kindle)).toEqual({ widthIn: 1600 / 300, heightIn: 2560 / 300 });
    expect(new Set(CANVAS_PRESETS.map((p) => p.id)).size).toBe(CANVAS_PRESETS.length);
  });
});

describe("orientación EXIF en JPEG", () => {
  const u16 = (n: number, le: boolean) => (le ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  // JPEG con APP1 Exif (una entrada de orientación) y SOF0 de w x h almacenados.
  const jpegExif = (w: number, h: number, orientation: number, le = true) => {
    const tiff = [...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42, le), ...(le ? [8, 0, 0, 0] : [0, 0, 0, 8]), ...u16(1, le), ...u16(0x0112, le), ...u16(3, le), ...(le ? [1, 0, 0, 0] : [0, 0, 0, 1]), ...u16(orientation, le), 0, 0, 0, 0, 0, 0];
    const app1 = [...ascii("Exif"), 0, 0, ...tiff];
    const len = app1.length + 2;
    return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...app1, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]);
  };
  it("orientaciones 1-4 mantienen las dimensiones; 5-8 las permutan", () => {
    for (const o of [1, 2, 3, 4]) expect(readImageHeader(jpegExif(4000, 3000, o))).toMatchObject({ widthPx: 4000, heightPx: 3000 });
    for (const o of [5, 6, 7, 8]) expect(readImageHeader(jpegExif(4000, 3000, o))).toMatchObject({ widthPx: 3000, heightPx: 4000, orientation: o });
  });
  it("lee ambos órdenes de bytes y la orientación 1 no añade campo", () => {
    expect(readImageHeader(jpegExif(400, 300, 6, false))).toMatchObject({ widthPx: 300, heightPx: 400 });
    expect(readImageHeader(jpegExif(400, 300, 1))).not.toHaveProperty("orientation");
  });
  it("Exif corrupto o valores fuera de rango se ignoran", () => {
    expect(readImageHeader(jpegExif(400, 300, 9))).toMatchObject({ widthPx: 400, heightPx: 300 });
    const bad = jpegExif(400, 300, 6);
    bad[12] = 0x58; // cabecera TIFF inválida
    expect(readImageHeader(bad)).toMatchObject({ widthPx: 400, heightPx: 300 });
  });
});
