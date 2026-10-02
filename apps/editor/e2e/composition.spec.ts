import { expect, test, type Page } from "@playwright/test";
import { quadrants } from "./png";

const canvasBox = async (page: Page) => {
  const box = await page.locator("[data-testid=cover-canvas] canvas.upper-canvas").boundingBox();
  if (!box) throw new Error("sin lienzo");
  return box;
};
// Color del píxel del lienzo Fabric en una fracción (u, v) del lienzo.
const pixel = (page: Page, u: number, v: number) =>
  page.evaluate(([u, v]) => {
    const c = document.querySelector<HTMLCanvasElement>("[data-testid=cover-canvas] canvas.lower-canvas")!;
    const d = c.getContext("2d")!.getImageData(Math.floor(u * c.width), Math.floor(v * c.height), 1, 1).data;
    return [d[0]!, d[1]!, d[2]!];
  }, [u, v] as const);
const near = (a: number[], b: number[], tol = 25) => a.every((x, i) => Math.abs(x - b[i]!) <= tol);
const RED = [220, 30, 30], GREEN = [30, 200, 30], BLUE = [30, 30, 220], YELLOW = [230, 220, 30];

// Gancho de desarrollo (solo con vite dev): documento actual del almacén.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const doc = (page: Page): Promise<any> => page.evaluate(() => (window as any).__editorStore.getState().history.present);

async function uploadBackground(page: Page, buf: Buffer) {
  await page.getByLabel("Subir imagen", { exact: true }).setInputFiles({ name: "fondo.png", mimeType: "image/png", buffer: buf });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => indexedDB.databases().then((dbs) => Promise.all(dbs.map((d) => indexedDB.deleteDatabase(d.name!)))));
  await page.reload();
  await expect(page.locator("[data-testid=cover-canvas] canvas.upper-canvas")).toBeVisible();
});

test("el lienzo Fabric pinta el color base y el fondo recién importado", async ({ page }) => {
  await expect.poll(async () => near(await pixel(page, 0.5, 0.5), [255, 255, 255])).toBe(true);
  await uploadBackground(page, quadrants(600, 900));
  await expect.poll(async () => near(await pixel(page, 0.25, 0.25), RED)).toBe(true);
  expect(near(await pixel(page, 0.75, 0.25), GREEN)).toBe(true);
  expect(near(await pixel(page, 0.25, 0.75), BLUE)).toBe(true);
  expect(near(await pixel(page, 0.75, 0.75), YELLOW)).toBe(true);
});

test("la vista previa y el pintor de exportación dan el mismo encuadre con cada política", async ({ page }) => {
  await uploadBackground(page, quadrants(900, 600));
  await expect.poll(async () => (await doc(page)).canvas.background).toEqual({ assetId: expect.any(String) });
  const diff = () =>
    page.evaluate(async () => {
      const modulePath = "/src/canvas/paint.ts"; // servido por vite dev
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
  const fits: string[] = [];
  for (const policy of ["Recortar", "Ajustar", "Estirar"]) {
    await page.getByRole("radio", { name: policy }).check({ force: true });
    await page.getByLabel("Unidad").selectOption("in");
    await page.getByLabel(/^ANCHO/).fill("9");
    await page.getByLabel(/^ALTO/).fill("6");
    await page.getByRole("button", { name: "Aplicar tamaño" }).click();
    await expect.poll(async () => (await doc(page)).canvas.widthIn).toBe(9);
    fits.push((await doc(page)).canvas.backgroundFit);
    await expect.poll(diff).toBeLessThan(4);
    await page.getByRole("button", { name: "Deshacer" }).click(); // un solo paso restaura el tamaño
    await expect.poll(async () => (await doc(page)).canvas.widthIn).toBe(6);
  }
  expect(fits).toEqual(["cover", "contain", "fill"]);
});

test("ajustar deja espacio libre con relleno oscuro y mantiene la proporción", async ({ page }) => {
  await uploadBackground(page, quadrants(900, 600)); // 3:2 sobre lienzo 2:3
  await expect.poll(async () => (await doc(page)).canvas.background).toEqual({ assetId: expect.any(String) });
  await page.getByRole("button", { name: "Ajustar", exact: true }).first().click();
  await expect.poll(async () => near(await pixel(page, 0.5, 0.05), [16, 14, 11], 12)).toBe(true);
  expect(near(await pixel(page, 0.25, 0.4), RED)).toBe(true);
});

test("arrastrar sobre el lienzo recoloca el fondo y se deshace en un paso", async ({ page }) => {
  await uploadBackground(page, quadrants(900, 600));
  await expect.poll(async () => (await doc(page)).canvas.background).toEqual({ assetId: expect.any(String) });
  await expect.poll(async () => near(await pixel(page, 0.1, 0.1), RED) || near(await pixel(page, 0.1, 0.1), BLUE)).toBe(true);
  const b = await canvasBox(page);
  const sx = b.x + b.width / 2, sy = b.y + b.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx - 60, sy, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await doc(page)).canvas.backgroundPos?.x).toBeGreaterThan(0.5);
  expect((await doc(page)).canvas.backgroundPos.y).toBe(0.5);
  await page.getByRole("button", { name: "Deshacer" }).click();
  expect((await doc(page)).canvas.backgroundPos).toBeUndefined();
});

test("arrastrar una imagen colocada la mueve y el cambio queda en el documento", async ({ page }) => {
  await page.getByTestId("layer-image-input").setInputFiles({ name: "capa.png", mimeType: "image/png", buffer: quadrants(300, 300) });
  await expect.poll(async () => (await doc(page)).elements.length).toBe(1);
  const before = (await doc(page)).elements[0];
  const b = await canvasBox(page);
  const ppi = b.width / 6;
  const cx = b.x + (before.x + before.width / 2) * ppi, cy = b.y + (before.y + before.height / 2) * ppi;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy + 30, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await doc(page)).elements[0].x).toBeGreaterThan(before.x + 0.1);
  const after = (await doc(page)).elements[0];
  expect(after.x - before.x).toBeCloseTo(40 / ppi, 1);
  expect(after.y - before.y).toBeCloseTo(30 / ppi, 1);
  expect(after.width).toBeCloseTo(before.width, 3);
  await page.getByRole("button", { name: "Deshacer" }).click();
  expect((await doc(page)).elements[0].x).toBeCloseTo(before.x, 6);
});

test("avisa de ppp efectivos bajos y el zoom cambia el tamaño en pantalla", async ({ page }) => {
  await uploadBackground(page, quadrants(600, 900)); // 100 ppp en 6x9
  await expect(page.getByTestId("dpi-warning")).toContainText("100 ppp");
  const w0 = (await canvasBox(page)).width;
  await page.getByRole("button", { name: "Acercar" }).click();
  await expect.poll(async () => Math.round((await canvasBox(page)).width / w0 * 100)).toBe(125);
  await page.getByRole("button", { name: "Ajustar a la ventana" }).click();
  await expect.poll(async () => Math.round((await canvasBox(page)).width)).toBe(Math.round(w0));
});

test("el fondo guardado se recupera tras recargar", async ({ page }) => {
  await uploadBackground(page, quadrants(1800, 2700));
  await expect.poll(async () => near(await pixel(page, 0.25, 0.25), RED)).toBe(true);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(async () => near(await pixel(page, 0.25, 0.25), RED)).toBe(true);
  expect(near(await pixel(page, 0.75, 0.75), YELLOW)).toBe(true);
});

test("un solo gesto de clic y arrastre sobre un elemento no seleccionado lo selecciona y lo mueve", async ({ page }) => {
  await page.getByTestId("layer-image-input").setInputFiles({ name: "capa.png", mimeType: "image/png", buffer: quadrants(300, 300) });
  await expect.poll(async () => (await doc(page)).elements.length).toBe(1);
  const before = (await doc(page)).elements[0];
  const b = await canvasBox(page);
  const ppi = b.width / 6;
  // Clic en una esquina vacía: deselecciona.
  await page.mouse.click(b.x + 4, b.y + 4);
  await expect.poll(() => page.evaluate(() => (window as any).__editorStore.getState().selectedId)).toBeNull();
  const cx = b.x + (before.x + before.width / 2) * ppi, cy = b.y + (before.y + before.height / 2) * ppi;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 50, cy + 20, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await doc(page)).elements[0].x).toBeGreaterThan(before.x + 0.1);
  const after = (await doc(page)).elements[0];
  expect(after.x - before.x).toBeCloseTo(50 / ppi, 1);
  expect(after.y - before.y).toBeCloseTo(20 / ppi, 1);
  expect(await page.evaluate(() => (window as any).__editorStore.getState().selectedId)).toBe(after.id);
});
