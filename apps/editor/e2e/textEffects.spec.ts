import { expect, test, type Page } from "@playwright/test";
import { makePng } from "./png";
import { doc, freshEditor } from "./ui";

// Franjas verticales negras y blancas de 8 px: la mitad de cada letra cae en negro.
const stripes = makePng(64, 64, (x) => (Math.floor(x / 8) % 2 === 0 ? [0, 0, 0] : [255, 255, 255]));
const RED = "#c81e1e";

// Prepara fondo rojo y un texto blanco «HHHH» seleccionado; sube la textura por la interfaz.
async function setup(page: Page) {
  await page.evaluate((red) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__editorStore;
    s.dispatch({ type: "setBackground", background: red });
    s.dispatch({
      type: "addElement",
      element: {
        id: "t1", type: "text", x: 0.5, y: 2, width: 5, height: 2, rotation: 0, zIndex: 0, visible: true,
        runs: [{ text: "HHHH", fontFamily: "Arial", fontSizePt: 120, weight: 700, italic: false, underline: false, uppercase: false, color: "#ffffff" }],
        align: "center", lineHeight: 1.2, letterSpacing: 0, shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#000000" }, curvature: 0,
      },
    });
    s.select("t1");
  }, RED);
  await page.getByLabel("Subir textura").setInputFiles({ name: "franjas.png", mimeType: "image/png", buffer: stripes });
  await expect.poll(async () => (await doc(page)).elements[0].texture?.assetId).toEqual(expect.any(String));
}

const update = (page: Page, props: Record<string, unknown>) =>
  page.evaluate((props) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__editorStore;
    return s.dispatch({ type: "updateElement", id: "t1", props });
  }, props);

// Cuenta píxeles blancos, negros y no rojos dentro y fuera de la caja del texto, pintando la última
// composición de la vista con el pintor de exportación.
const counts = (page: Page) =>
  page.evaluate(async () => {
    const modulePath = "/src/canvas/paint.ts";
    const { paintDocument } = await import(/* @vite-ignore */ modulePath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sc = (window as any).__coverScene;
    const r = sc.lastRender;
    const out = document.createElement("canvas");
    out.width = Math.round(r.widthPx);
    out.height = Math.round(r.heightPx);
    const ctx = out.getContext("2d")!;
    paintDocument(ctx, r, sc.lastSources);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const box = r.items.find((i: any) => i.id === "t1").box;
    const d = ctx.getImageData(0, 0, out.width, out.height).data;
    const c = { white: 0, black: 0, outsideInk: 0 };
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        const i = (y * out.width + x) * 4;
        const [R, G, B] = [d[i]!, d[i + 1]!, d[i + 2]!];
        const inside = x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height;
        const red = R > 150 && G < 80 && B < 80;
        if (!inside) {
          if (!red) c.outsideInk++;
          continue;
        }
        if (R > 200 && G > 200 && B > 200) c.white++;
        else if (R < 50 && G < 50 && B < 50) c.black++;
      }
    }
    return c;
  });

// Diferencia media por canal entre el lienzo Fabric y el pintor de exportación; con onlyText, solo en la
// caja del texto ampliada medio alto (donde caen sombras y máscara), para que el resto no la diluya.
const previewVsExport = (page: Page, onlyText = false) =>
  page.evaluate(async (onlyText) => {
    const modulePath = "/src/canvas/paint.ts";
    const { paintDocument } = await import(/* @vite-ignore */ modulePath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sc = (window as any).__coverScene;
    const r = sc.lastRender;
    const out = document.createElement("canvas");
    out.width = Math.round(r.widthPx);
    out.height = Math.round(r.heightPx);
    const octx = out.getContext("2d")!;
    paintDocument(octx, r, sc.lastSources);
    const low = document.querySelector<HTMLCanvasElement>("[data-testid=cover-canvas] canvas.lower-canvas")!;
    const cmp = document.createElement("canvas");
    cmp.width = out.width;
    cmp.height = out.height;
    const cctx = cmp.getContext("2d")!;
    cctx.drawImage(low, 0, 0, out.width, out.height);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const box = r.items.find((i: any) => i.id === "t1").box;
    const pad = onlyText ? box.height / 2 : 0;
    const x = onlyText ? Math.max(0, Math.floor(box.x - pad)) : 0;
    const y = onlyText ? Math.max(0, Math.floor(box.y - pad)) : 0;
    const w = onlyText ? Math.min(out.width - x, Math.ceil(box.width + 2 * pad)) : out.width;
    const h = onlyText ? Math.min(out.height - y, Math.ceil(box.height + 2 * pad)) : out.height;
    const a = octx.getImageData(x, y, w, h).data;
    const b = cctx.getImageData(x, y, w, h).data;
    let sum = 0;
    for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
    return sum / (a.length / 4) / 3;
  }, onlyText);

const texture = async (page: Page) => (await doc(page)).elements[0].texture;

test.beforeEach(async ({ page }) => {
  await freshEditor(page);
  await setup(page);
});

test("la máscara oscura deja ver el fondo por las franjas negras y conserva las blancas", async ({ page }) => {
  await update(page, { texture: { ...(await texture(page)), fit: "tile", tileIn: 0.5 } });
  await page.waitForTimeout(200);
  const before = await counts(page);
  expect(before.black).toBeGreaterThan(1000);
  await update(page, { mask: { ...(await texture(page)), mode: "dark", threshold: 0.5, softness: 0 } });
  await expect.poll(async () => (await counts(page)).black).toBeLessThan(before.black * 0.05);
  const after = await counts(page);
  expect(after.white).toBeGreaterThan(before.white * 0.85);
  expect(after.white).toBeLessThan(before.white * 1.15);
  await expect.poll(() => previewVsExport(page)).toBeLessThan(4);
});

test("lo que sobresale de la caja (texto en arco) no se recorta", async ({ page }) => {
  await update(page, { texture: { ...(await texture(page)), fit: "tile", tileIn: 0.5 }, curvature: 60 });
  await page.waitForTimeout(200);
  const before = await counts(page);
  expect(before.outsideInk).toBeGreaterThan(500);
  await update(page, { mask: { ...(await texture(page)), mode: "dark", threshold: 0.5, softness: 0 } });
  await expect.poll(async () => (await counts(page)).black).toBeLessThan(before.black * 0.05);
  const after = await counts(page);
  expect(Math.abs(after.outsideInk - before.outsideInk)).toBeLessThan(before.outsideInk * 0.05);
});

test("sombra interior, sombra configurable y opacidad: la vista coincide con la exportación", async ({ page }) => {
  await update(page, {
    shadow: { on: true, intensity: 60, color: "#000000", opacity: 0.8, angle: 45, distance: 0.08 },
    innerShadow: { on: true, color: "#000000", opacity: 0.7, angle: 90, distance: 0.04, blur: 0.06 },
    opacity: 0.8,
  });
  await expect.poll(() => previewVsExport(page, true)).toBeLessThan(4);
});

test("la sombra interior oscurece la letra por dentro", async ({ page }) => {
  await page.waitForTimeout(200);
  const before = await counts(page);
  await update(page, { innerShadow: { on: true, color: "#000000", opacity: 1, angle: 90, distance: 0, blur: 0.15 } });
  await expect.poll(async () => (await counts(page)).white).toBeLessThan(before.white * 0.8);
});

// Luminancia (0-255) de los píxeles de la fila central de la caja del texto, con el pintor de exportación,
// y si cada uno es «tinta» (no es el fondo rojo).
const centerRow = (page: Page) =>
  page.evaluate(async () => {
    const modulePath = "/src/canvas/paint.ts";
    const { paintDocument } = await import(/* @vite-ignore */ modulePath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sc = (window as any).__coverScene;
    const r = sc.lastRender;
    const out = document.createElement("canvas");
    out.width = Math.round(r.widthPx);
    out.height = Math.round(r.heightPx);
    const ctx = out.getContext("2d")!;
    paintDocument(ctx, r, sc.lastSources);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const box = r.items.find((i: any) => i.id === "t1").box;
    const y = Math.round(box.y + box.height / 2);
    const d = ctx.getImageData(0, y, out.width, 1).data;
    const lum: number[] = [];
    const ink: boolean[] = [];
    for (let x = 0; x < out.width; x++) {
      const [R, G, B] = [d[x * 4]!, d[x * 4 + 1]!, d[x * 4 + 2]!];
      lum.push(0.2126 * R + 0.7152 * G + 0.0722 * B);
      ink.push(!(R > 150 && G < 80 && B < 80));
    }
    return { lum, ink };
  });

test("la sombra interior no marca los bordes que abre la máscara", async ({ page }) => {
  // Franjas de 40 px alternas (negro/blanco) como máscara oscura.
  const stripesId = (await texture(page))?.assetId;
  const wide = makePng(320, 64, (x) => (Math.floor(x / 40) % 2 === 0 ? [0, 0, 0] : [255, 255, 255]));
  await page.getByLabel("Subir textura").setInputFiles({ name: "franjas40.png", mimeType: "image/png", buffer: wide });
  await expect.poll(async () => (await texture(page))?.assetId).not.toBe(stripesId);
  const maskTex = await texture(page);
  await update(page, { texture: undefined, innerShadow: { on: true, color: "#000000", opacity: 1, angle: 90, distance: 0, blur: 0.08 } });
  await page.waitForTimeout(200);
  // Referencia sin máscara: dónde hay letra.
  const full = await centerRow(page);
  await update(page, { mask: { ...maskTex, fit: "tile", tileIn: 2, mode: "dark", threshold: 0.5, softness: 0 } });
  await page.waitForTimeout(200);
  const masked = await centerRow(page);
  const lums = edgeLums(full, masked);
  expect(lums.length).toBeGreaterThanOrEqual(2);
  for (const l of lums) expect(l).toBeGreaterThan(200);
});

// Borde de grieta: fin de un tramo conservado donde la letra sin máscara continúa. A 3 px dentro, sigue claro.
// Solo cuenta donde la letra, sin máscara, ya era clara a 3 px: así no se confunde con su propio contorno.
function edgeLums(full: { lum: number[]; ink: boolean[] }, masked: { lum: number[]; ink: boolean[] }): number[] {
  const lums: number[] = [];
  for (let e = 4; e < masked.ink.length - 5; e++) {
    if (masked.ink[e] && !masked.ink[e + 1] && full.ink[e + 1] && full.ink[e + 5] && full.lum[e - 3]! > 200) lums.push(masked.lum[e - 3]!);
    if (masked.ink[e + 1] && !masked.ink[e] && full.ink[e] && full.ink[e - 4] && full.lum[e + 4]! > 200) lums.push(masked.lum[e + 4]!);
  }
  return lums;
}

test("la sombra interior no marca los huecos de una textura con alfa usada también como máscara alpha", async ({ page }) => {
  // Textura blanca con franjas transparentes (bordes nítidos al escalarla) (como las grietas del mármol «con huecos»).
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 3200;
    c.height = 64;
    const x = c.getContext("2d")!;
    x.fillStyle = "#fff";
    for (let i = 0; i < 3200; i += 800) x.fillRect(i, 0, 400, 64);
    return c.toDataURL("image/png");
  });
  const buffer = Buffer.from(dataUrl.split(",")[1]!, "base64");
  const stripesId = (await texture(page))?.assetId;
  await page.getByLabel("Subir textura").setInputFiles({ name: "huecos.png", mimeType: "image/png", buffer });
  await expect.poll(async () => (await texture(page))?.assetId).not.toBe(stripesId);
  const holes = await texture(page);
  await update(page, { texture: undefined, innerShadow: { on: true, color: "#000000", opacity: 1, angle: 90, distance: 0, blur: 0.08 } });
  await page.waitForTimeout(200);
  const full = await centerRow(page);
  const placed = { ...holes, fit: "tile", tileIn: 2 };
  await update(page, { texture: placed, mask: { ...placed, mode: "alpha", threshold: 0.5, softness: 0 } });
  await page.waitForTimeout(200);
  const masked = await centerRow(page);
  // 3 px dentro de cada borde de hueco donde la letra sin textura sigue: no debe ser más oscuro que sin huecos.
  const drops: number[] = [];
  for (let e = 4; e < masked.ink.length - 5; e++) {
    if (masked.ink[e] && !masked.ink[e + 1] && full.ink[e + 1] && full.ink[e - 3]) drops.push(full.lum[e - 3]! - masked.lum[e - 3]!);
    if (masked.ink[e + 1] && !masked.ink[e] && full.ink[e] && full.ink[e + 4]) drops.push(full.lum[e + 4]! - masked.lum[e + 4]!);
  }
  expect(drops.length).toBeGreaterThanOrEqual(2);
  for (const d of drops) expect(d).toBeLessThan(15);
});

test.describe("en pantalla retina", () => {
  test.use({ deviceScaleFactor: 2 });
  test("la sombra de la vista cae donde en la exportación", async ({ page }) => {
    // Sombra opaca y lejana: si la vista no la escalase a px de dispositivo, caería a mitad de distancia.
    await update(page, { shadow: { on: true, intensity: 10, color: "#000000", opacity: 1, angle: 90, distance: 0.3 } });
    await page.waitForTimeout(200);
    await expect.poll(() => previewVsExport(page, true)).toBeLessThan(3.5);
  });
});
