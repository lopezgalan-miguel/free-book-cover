import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { doc, freshEditor } from "./ui";

const font = readFileSync(new URL("./fixtures/RobotoSerif-subset-VF.ttf", import.meta.url));

// Anchura de la tinta blanca (columnas con algún píxel claro) al pintar la última composición de la vista.
const inkWidth = (page: Page) =>
  page.evaluate(async () => {
    const modulePath = "/src/canvas/paint.ts";
    const { paintDocument } = await import(/* @vite-ignore */ modulePath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sc = (window as any).__coverScene;
    const r = sc.lastRender;
    const c = document.createElement("canvas");
    c.width = Math.round(r.widthPx);
    c.height = Math.round(r.heightPx);
    const ctx = c.getContext("2d")!;
    paintDocument(ctx, r, sc.lastSources);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let min = Infinity, max = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (d[i]! > 200 && d[i + 1]! > 200) { min = Math.min(min, x); max = Math.max(max, x); }
    }
    return max - min;
  });

// Igual, pero con el renderizador del PDF (Worker o hilo principal) a 100 ppp.
const printInkWidth = (page: Page, mode: "worker" | "main") =>
  page.evaluate(async (mode) => {
    const pr = "/src/export/printRender.ts";
    const fr = "/src/fonts/fontRegistry.ts";
    const { browserPrintRenderer } = await import(/* @vite-ignore */ pr);
    const { getFontRegistry } = await import(/* @vite-ignore */ fr);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__editorStore;
    const d = store.getState().history.present;
    const size = { widthPx: Math.round(d.canvas.widthIn * 100), heightPx: Math.round(d.canvas.heightIn * 100) };
    const { blob } = await browserPrintRenderer(getFontRegistry(), () => store.getState().assets, mode).render(d, size, () => {});
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    let min = Infinity, max = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (px[i]! > 200 && px[i + 1]! > 200) { min = Math.min(min, x); max = Math.max(max, x); }
    }
    return max - min;
  }, mode);

test("la anchura (wdth) de una fuente variable subida estrecha el texto en la vista, la exportación y el PDF", async ({ page }) => {
  await freshEditor(page);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).__editorStore.dispatch({ type: "setBackground", background: "#c81e1e" }));
  await page.getByRole("button", { name: "Añadir capa de texto" }).click();
  await page.getByLabel("Contenido del texto").fill("LAMENTOS");
  await page.getByLabel("Subir fuente").setInputFiles({ name: "RobotoSerif-subset-VF.ttf", mimeType: "font/ttf", buffer: font });
  await expect.poll(async () => (await doc(page)).elements[0].runs[0].fontFamily).toBe("RobotoSerif-subset-VF");
  const width = page.getByLabel("Anchura de la fuente (wdth)");
  await expect(width).toBeVisible();
  await page.waitForTimeout(300);
  const normal = await inkWidth(page);
  expect(normal).toBeGreaterThan(50);
  await width.fill("50");
  await expect.poll(async () => (await doc(page)).elements[0].runs[0].stretch).toBe(50);
  await expect.poll(() => inkWidth(page)).toBeLessThan(normal * 0.8);
  // El Worker del PDF registra el mismo alias: mide lo mismo que el hilo principal.
  const viaWorker = await printInkWidth(page, "worker");
  const viaMain = await printInkWidth(page, "main");
  expect(viaWorker).toBeGreaterThan(20);
  expect(Math.abs(viaWorker - viaMain)).toBeLessThanOrEqual(Math.max(2, viaMain * 0.02));
});
