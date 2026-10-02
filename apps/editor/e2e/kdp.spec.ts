import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { decodePng } from "./png";

const canvasSel = "[data-testid=cover-canvas] canvas.lower-canvas";
const BG = [32, 64, 96];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const doc = (page: Page): Promise<any> => page.evaluate(() => (window as any).__editorStore.getState().history.present);
const dispatch = (page: Page, cmd: unknown) => page.evaluate((c) => (window as any).__editorStore.dispatch(c), cmd); // eslint-disable-line @typescript-eslint/no-explicit-any

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => indexedDB.databases().then((dbs) => Promise.all(dbs.map((d) => indexedDB.deleteDatabase(d.name!)))));
  await page.reload();
  await expect(page.locator(canvasSel)).toBeVisible();
});

async function configure(page: Page, pages: string) {
  const form = page.getByRole("form", { name: "Cubierta KDP" });
  await form.getByLabel("Número de páginas").fill(pages);
  await form.getByRole("button", { name: "Aplicar configuración" }).click();
}

// Objetos de guía de la escena Fabric (marcados como no exportables).
const guideCount = (page: Page) =>
  page.evaluate(() => (window as any).__coverScene.canvas.getObjects().filter((o: { excludeFromExport?: boolean }) => o.excludeFromExport).length); // eslint-disable-line @typescript-eslint/no-explicit-any

test("configuración, guías visibles en la vista y ausentes de la exportación", async ({ page }) => {
  await dispatch(page, { type: "setBackground", background: "#204060" });
  await configure(page, "100");
  const d = await doc(page);
  expect(d.mode).toBe("kdp-paperback");
  expect(d.printSetup).toMatchObject({ trimWidthIn: 6, trimHeightIn: 9, pageCount: 100, paperAndInk: "bw-white" });
  expect(d.canvas.widthIn).toBeCloseTo(12.4752, 6);
  expect(d.canvas.heightIn).toBeCloseTo(9.25, 6);
  await expect(page.getByTestId("kdp-summary")).toContainText("0.2252 in");
  await expect(page.getByTestId("kdp-summary")).toContainText("12.4752 × 9.25 in");

  // Vista: las guías están en la escena y se pintan (banda de sangrado y código de barras sobre el fondo).
  await expect.poll(() => guideCount(page)).toBeGreaterThan(5);
  const view = await page.evaluate(() => (window as any).__coverScene.toDataURL()); // eslint-disable-line @typescript-eslint/no-explicit-any
  const vp = decodePng(Buffer.from(view.split(",")[1], "base64"));
  const ppi = vp.height / 9.25;
  const at = (xIn: number, yIn: number) => vp.px(Math.round(xIn * ppi), Math.round(yIn * ppi));
  expect(at(6, 0.06).slice(0, 3)).not.toEqual(BG); // banda de sangrado superior
  expect(at(0.06, 4).slice(0, 3)).not.toEqual(BG); // banda izquierda
  const bx = 0.125 + 6 - 0.25 - 1; // centro horizontal del código de barras
  const by = 0.125 + 9 - 0.25 - 0.6;
  expect(at(bx, by).slice(0, 3)).not.toEqual(BG);

  // Exportación a 300 ppp: ninguna guía; los mismos puntos son el color de fondo exacto.
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Destino").selectOption("base");
  await dialog.getByRole("radio", { name: /PNG/ }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Descargar PNG" }).click()]);
  const out = decodePng(readFileSync((await dl.path())!));
  expect([out.width, out.height]).toEqual([Math.round(12.4752 * 300), 2775]);
  const e = (xIn: number, yIn: number) => out.px(Math.round(xIn * 300), Math.round(yIn * 300)).slice(0, 3);
  expect(e(6, 0.06)).toEqual(BG);
  expect(e(0.06, 4)).toEqual(BG);
  expect(e(bx, by)).toEqual(BG);
  expect(e(6.125, 4)).toEqual(BG); // pliegue del lomo
  expect(e(0.125, 4)).toEqual(BG); // línea de corte
  expect(e(0.25, 0.25)).toEqual(BG); // esquina de la zona segura
  await dialog.getByRole("button", { name: "Cerrar" }).click();

  // El interruptor oculta las guías en la vista sin tocar el documento.
  const rev = (await doc(page)).revision;
  await page.getByRole("switch", { name: "Guías" }).click();
  await expect.poll(() => guideCount(page)).toBe(0);
  expect((await doc(page)).revision).toBe(rev);
});

test("recalcular al cambiar páginas reposiciona sin deformar, avisa y se deshace", async ({ page }) => {
  await configure(page, "100");
  await dispatch(page, { type: "addElement", element: { id: "b", type: "shape", shape: "rect", x: 1, y: 1, width: 2, height: 1, rotation: 0, zIndex: 0, visible: true, fill: "#ff0000" } });
  await dispatch(page, { type: "addElement", element: { id: "f", type: "shape", shape: "rect", x: 8, y: 1, width: 3, height: 2, rotation: 0, zIndex: 0, visible: true, fill: "#00ff00" } });
  await configure(page, "400");
  let d = await doc(page);
  const f = d.elements.find((e: { id: string }) => e.id === "f");
  expect(f.x).toBeCloseTo(8 + (400 - 100) * 0.002252, 6);
  expect([f.width, f.height]).toEqual([3, 2]);
  expect(d.elements.find((e: { id: string }) => e.id === "b").x).toBe(1);
  expect(d.canvas.widthIn).toBeCloseTo(12 + 0.9008 + 0.25, 6);
  await page.getByRole("button", { name: "Deshacer" }).click();
  d = await doc(page);
  expect(d.printSetup.pageCount).toBe(100);
  expect(d.elements.find((e: { id: string }) => e.id === "f").x).toBe(8);

  // Un corte menor deja fuera lo que no cabe y se avisa.
  await dispatch(page, { type: "addElement", element: { id: "big", type: "shape", shape: "rect", x: 11.5, y: 0.2, width: 0.9, height: 8.8, rotation: 0, zIndex: 0, visible: true, fill: "#0000ff" } });
  await page.getByRole("form", { name: "Cubierta KDP" }).getByLabel("Tamaño de corte").selectOption("5x8");
  await page.getByRole("form", { name: "Cubierta KDP" }).getByRole("button", { name: "Aplicar configuración" }).click();
  await expect(page.getByRole("status").filter({ hasText: "quedan fuera del lienzo" })).toBeVisible();
  await expect(page.getByTestId("kdp-issue")).toHaveCount(1);
});

test("revisión: texto fuera de zona segura, texto de lomo inválido y fondo sin sangrado", async ({ page }) => {
  await configure(page, "50");
  const text = (id: string, x: number, w: number) => ({
    id, type: "text", x, y: 1, width: w, height: 1, rotation: 0, zIndex: 0, visible: true,
    runs: [{ text: id, fontFamily: "sans-serif", fontSizePt: 24, weight: 400, italic: false, underline: false, uppercase: false, color: "#000000" }],
    align: "left", lineHeight: 1.2, letterSpacing: 0, shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#000000" }, curvature: 0,
  });
  await dispatch(page, { type: "addElement", element: text("fuera", 0.2, 3) });
  await dispatch(page, { type: "addElement", element: text("lomo", 6.15, 0.05) });
  const issues = page.getByTestId("kdp-issue");
  await expect(issues).toHaveCount(2);
  await expect(issues.nth(0)).toContainText("fuera: texto fuera de la zona segura");
  await expect(issues.nth(1)).toContainText("lomo: texto de lomo no válido");
  await issues.nth(0).getByRole("button").click();
  expect(await page.evaluate(() => (window as any).__editorStore.getState().selectedId)).toBe("fuera"); // eslint-disable-line @typescript-eslint/no-explicit-any

  await page.getByLabel("Subir imagen", { exact: true }).first().setInputFiles({
    name: "f.png", mimeType: "image/png",
    buffer: (await import("./png")).makePng(100, 100, () => [200, 10, 10]),
  });
  await expect.poll(async () => typeof (await doc(page)).canvas.background).toBe("object");
  await dispatch(page, { type: "setBackgroundLayout", fit: "contain" });
  await expect(page.getByText("El fondo no cubre el sangrado")).toBeVisible();
});
