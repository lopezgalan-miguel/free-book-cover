import { expect, test, type Page } from "@playwright/test";
import { makePng } from "./png";
import { doc, freshEditor } from "./ui";

// Mitad izquierda negra y derecha blanca.
const halves = makePng(600, 900, (x) => (x < 300 ? [0, 0, 0] : [255, 255, 255]));
const gray = makePng(200, 200, () => [200, 100, 50]);

const dispatch = (page: Page, cmd: unknown) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.evaluate((cmd) => (window as any).__editorStore.dispatch(cmd), cmd);

// Pinta la última composición de la vista con el pintor de exportación y devuelve el color en (u, v).
const exportPixel = (page: Page, u: number, v: number) =>
  page.evaluate(async ([u, v]) => {
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
    const d = ctx.getImageData(Math.min(out.width - 1, Math.floor(u * out.width)), Math.min(out.height - 1, Math.floor(v * out.height)), 1, 1).data;
    return [d[0]!, d[1]!, d[2]!];
  }, [u, v] as const);

const previewVsExport = (page: Page) =>
  page.evaluate(async () => {
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
    const a = octx.getImageData(0, 0, out.width, out.height).data;
    const b = cctx.getImageData(0, 0, out.width, out.height).data;
    let sum = 0;
    for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
    return sum / (a.length / 4) / 3;
  });

test.beforeEach(async ({ page }) => freshEditor(page));

test("el fondo desenfocado no tiene halo en los bordes y la vista coincide con la exportación", async ({ page }) => {
  await page.getByLabel("Subir imagen", { exact: true }).setInputFiles({ name: "mitades.png", mimeType: "image/png", buffer: halves });
  await expect.poll(async () => (await doc(page)).canvas.background).toEqual({ assetId: expect.any(String) });
  await dispatch(page, { type: "setBackgroundFilters", filters: { blur: 20 } });
  await page.waitForTimeout(200);
  // Esquinas: siguen negra y blanca (sin oscurecer ni aclarar por el borde).
  const tl = await exportPixel(page, 0, 0);
  const br = await exportPixel(page, 0.999, 0.999);
  expect(Math.max(...tl)).toBeLessThan(20);
  expect(Math.min(...br)).toBeGreaterThan(235);
  // El centro (la frontera entre mitades) queda gris intermedio.
  const mid = await exportPixel(page, 0.5, 0.5);
  expect(mid[0]).toBeGreaterThan(60);
  expect(mid[0]).toBeLessThan(200);
  await expect.poll(() => previewVsExport(page)).toBeLessThan(4);
});

test("una capa de imagen con brillo al 50 % y opacidad", async ({ page }) => {
  await page.getByTestId("layer-image-input").setInputFiles({ name: "color.png", mimeType: "image/png", buffer: gray });
  await expect.poll(async () => (await doc(page)).elements.length).toBe(1);
  const id = (await doc(page)).elements[0].id;
  await dispatch(page, { type: "updateElement", id, props: { filters: { brightness: 50 } } });
  await page.waitForTimeout(200);
  const c = await exportPixel(page, 0.5, 0.5);
  expect(Math.abs(c[0]! - 100)).toBeLessThanOrEqual(3);
  expect(Math.abs(c[1]! - 50)).toBeLessThanOrEqual(3);
  expect(Math.abs(c[2]! - 25)).toBeLessThanOrEqual(3);
  await expect.poll(() => previewVsExport(page)).toBeLessThan(4);
  // Opacidad 0,5 sobre fondo blanco: (100,50,25) -> (178,153,140).
  await dispatch(page, { type: "updateElement", id, props: { opacity: 0.5 } });
  await page.waitForTimeout(200);
  const o = await exportPixel(page, 0.5, 0.5);
  expect(Math.abs(o[0]! - 178)).toBeLessThanOrEqual(4);
  await expect.poll(() => previewVsExport(page)).toBeLessThan(4);
});
