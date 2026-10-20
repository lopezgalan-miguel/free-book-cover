import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { makePng } from "./png";

// Companion real arrancado por playwright.config.ts (puerto 47399, token fijo).
const COMPANION = "http://127.0.0.1:47399";
const canvasSel = "[data-testid=cover-canvas] canvas.lower-canvas";
// Plantilla oficial CASE_LAMINATE_5.500x8.500_116_BW_CREAM: 939,8721 × 714,0472 pt.
const TEMPLATE_PT = { width: 939.8721, height: 714.0472 };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const doc = (page: Page): Promise<any> => page.evaluate(() => (window as any).__editorStore.getState().history.present);
const dispatch = (page: Page, cmd: unknown) => page.evaluate((c) => (window as any).__editorStore.dispatch(c), cmd); // eslint-disable-line @typescript-eslint/no-explicit-any
// Líneas de bisagra de la escena (guías de trazo y punto).
const hingeGuides = (page: Page) =>
  page.evaluate(() => (window as any).__coverScene.canvas.getObjects().filter((o: { excludeFromExport?: boolean; strokeDashArray?: number[] }) => o.excludeFromExport && o.strokeDashArray?.join(",") === "1,4,6,4").length); // eslint-disable-line @typescript-eslint/no-explicit-any

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.evaluate(() => { sessionStorage.clear(); return indexedDB.databases().then((dbs) => Promise.all(dbs.map((d) => indexedDB.deleteDatabase(d.name!)))); });
  await page.reload();
  await expect(page.locator(canvasSel)).toBeVisible();
});

test("tapa dura: un fondo pequeño la deshabilita; con fondo liso se aplica con bisagras, el PDF mide como la plantilla y una imagen ampliada lo bloquea", async ({ page }) => {
  const form = page.getByRole("form", { name: "Cubierta KDP" });

  // Fondo de 400 × 300 px: muy por debajo de 300 ppp en cualquier tapa dura.
  await page.getByLabel("Subir imagen", { exact: true }).first().setInputFiles({ name: "f.png", mimeType: "image/png", buffer: makePng(400, 300, () => [120, 20, 20]) });
  await expect.poll(async () => typeof (await doc(page)).canvas.background).toBe("object");
  await expect(form.getByRole("button", { name: "Tapa dura" })).toBeDisabled();
  await expect(page.getByTestId("hardcover-dpi")).toContainText("no llega al mínimo de 300 ppp");
  await expect(page.getByTestId("hardcover-dpi")).toContainText("Imagen de fondo");

  // Con un fondo liso no hay imágenes que medir: se aplica la tapa dura de «Lamentos».
  await dispatch(page, { type: "setBackground", background: "#204060" });
  await form.getByRole("button", { name: "Tapa dura" }).click();
  await form.getByLabel("Tamaño de corte").selectOption("5.5x8.5");
  await form.getByLabel("Número de páginas").fill("116");
  await form.getByLabel("Papel y tinta").selectOption("bw-cream");
  await expect(page.getByTestId("kdp-summary")).toContainText("13.0538 × 9.9173 in");
  await form.getByRole("button", { name: "Aplicar configuración" }).click();
  const d = await doc(page);
  expect(d.printSetup).toMatchObject({ binding: "hardcover", trimWidthIn: 5.5, trimHeightIn: 8.5, pageCount: 116, paperAndInk: "bw-cream" });
  expect(d.canvas.widthIn).toBeCloseTo(TEMPLATE_PT.width / 72, 5);
  await expect.poll(() => hingeGuides(page)).toBe(2);

  // PDF con el companion real: mide exactamente lo que la plantilla oficial.
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Dirección del companion").fill(COMPANION);
  await dialog.getByLabel("Token del companion").fill("e2e-token");
  await dialog.getByRole("button", { name: "Conectar" }).click();
  await expect(dialog.getByTestId("companion-status")).toHaveAttribute("data-status", "connected");
  await dialog.getByRole("radio", { name: /PDF/ }).click();
  await dialog.getByRole("button", { name: "Generar PDF" }).click();
  await expect(dialog.getByTestId("pdf-report")).toHaveAttribute("data-state", "ready", { timeout: 120_000 });
  await expect(dialog.getByTestId("check-size")).toHaveAttribute("data-status", "pass");
  // Gama medida por el companion real (Ghostscript + sharp): un azul oscuro liso no cambia al imprimir.
  await expect(dialog.getByTestId("check-gamut")).toHaveAttribute("data-status", "pass");
  const proofSrc = await dialog.getByTestId("pdf-proof").getAttribute("src");
  await dialog.getByRole("switch", { name: "Ver colores que cambian al imprimir" }).click();
  await expect(dialog.getByTestId("pdf-proof")).not.toHaveAttribute("src", proofSrc!);
  const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByTestId("pdf-download").click()]);
  const info = execFileSync("pdfinfo", [(await dl.path())!], { encoding: "utf8" });
  const m = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(info)!;
  expect(Number(m[1])).toBeCloseTo(TEMPLATE_PT.width, 1);
  expect(Number(m[2])).toBeCloseTo(TEMPLATE_PT.height, 1);
  await page.keyboard.press("Escape");

  // Después se añade una capa de imagen de 100 px a 4 in de ancho (25 ppp): el PDF queda bloqueado.
  await dispatch(page, { type: "addAsset", asset: { id: "small", kind: "image", mimeType: "image/png", metadata: { widthPx: 100, heightPx: 100 } } });
  await dispatch(page, {
    type: "addElement",
    element: { id: "foto", type: "image", x: 8, y: 2, width: 4, height: 4, rotation: 0, zIndex: 1, visible: true, assetRef: { assetId: "small" }, crop: { x: 0, y: 0, width: 1, height: 1 }, fit: "cover" },
  });
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  await expect(dialog.getByRole("radio", { name: /PDF/ })).toBeDisabled();
  await expect(dialog.getByTestId("pdf-low-dpi")).toContainText("Capa de imagen: 25 ppp");
});
