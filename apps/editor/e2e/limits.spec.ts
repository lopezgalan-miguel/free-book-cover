import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { doc, freshEditor } from "./ui";
import { decodePng } from "./png";

// Límites de recursos de SDD §6 de extremo a extremo: comportamiento y mensajes en el editor real.
const MiB = 1024 * 1024;
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const pngHead = (w: number, h: number) => [0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0];

// Entrega a un <input type=file> un archivo de `bytes` bytes que empieza por `head` (sin enviar nada por el protocolo).
async function giveFile(page: Page, selector: string, name: string, mime: string, head: number[], bytes: number) {
  await page.evaluate(
    ([selector, name, mime, head, bytes]) => {
      const buf = new Uint8Array(bytes as number);
      buf.set(head as number[]);
      const dt = new DataTransfer();
      dt.items.add(new File([buf], name as string, { type: mime as string }));
      const input = document.querySelector<HTMLInputElement>(selector as string)!;
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    [selector, name, mime, head, bytes] as const,
  );
}
const layerInput = '[data-testid="layer-image-input"]';
const assetCount = async (page: Page) => (await doc(page)).assets.length;

test.setTimeout(240_000);
test.beforeEach(async ({ page }) => {
  await freshEditor(page);
});

test("imagen: 100 MB comprimidos es el máximo; más se rechaza antes de importar, con su mensaje", async ({ page }) => {
  await giveFile(page, layerInput, "enorme.png", "image/png", pngHead(1000, 1000), 100 * MiB + 1);
  await expect(page.getByRole("alert")).toHaveText(/La imagen supera el límite de 100 MB\./);
  expect(await assetCount(page)).toBe(0);
});

test("imagen: 80 megapíxeles es el máximo; 81 se rechaza leyendo solo la cabecera y 79,99 se admite", async ({ page }) => {
  await giveFile(page, layerInput, "ancha.png", "image/png", pngHead(9000, 9000), 4096); // 81 Mpx
  await expect(page.getByRole("alert")).toHaveText(/La imagen supera el límite de 80 megapíxeles\./);
  expect(await assetCount(page)).toBe(0);
  await giveFile(page, layerInput, "justa.png", "image/png", pngHead(8944, 8944), 4096); // 79,995 Mpx
  await expect.poll(() => assetCount(page)).toBe(1);
});

test("fuente: más de 20 MB se rechaza con su mensaje y no se guarda", async ({ page }) => {
  await page.getByRole("button", { name: "Añadir capa de texto" }).click();
  await giveFile(page, 'input[aria-label="Subir fuente"]', "gigante.ttf", "font/ttf", [0, 1, 0, 0], 20 * MiB + 1);
  await expect(page.getByRole("alert")).toHaveText(/La fuente supera el límite de 20 MB\./);
  expect(await assetCount(page)).toBe(0);
});

test("proyecto: aviso al llegar a 400 MB y rechazo al superar 500 MB, sin perder lo ya guardado", async ({ page }) => {
  const add = (mb: number, i: number) => giveFile(page, layerInput, `img${i}.png`, "image/png", pngHead(1000, 1000), mb * MiB);
  for (let i = 1; i <= 4; i++) {
    await add(99, i);
    await expect.poll(() => assetCount(page), { timeout: 60_000 }).toBe(i);
  }
  await expect(page.getByText("El proyecto se acerca al límite de 500 MB.")).toHaveCount(0); // 396 MiB < 400 MiB
  await add(99, 5); // 495 MiB: admitido con aviso
  await expect.poll(() => assetCount(page), { timeout: 60_000 }).toBe(5);
  await expect(page.getByText("El proyecto se acerca al límite de 500 MB.")).toBeVisible();
  await add(10, 6); // 505 MiB: rechazado
  await expect(page.getByRole("alert")).toHaveText(/haría que el proyecto supere los 500 MB/);
  expect(await assetCount(page)).toBe(5);
});

test("exportación: más de 50 MP se bloquea y la reducción ofrecida produce un PNG dentro del límite", async ({ page }) => {
  await page.evaluate(() => (window as any).__editorStore.dispatch({ type: "setCanvas", widthIn: 20, heightIn: 30 })); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Exportar/ });
  await expect(dialog.getByTestId("export-limit")).toContainText("54.0 megapíxeles");
  await expect(dialog.getByTestId("export-limit")).toContainText("el límite es de 50");
  await expect(dialog.getByRole("button", { name: "Descargar PNG" })).toBeDisabled();
  await dialog.getByRole("button", { name: /Reducir a/ }).click();
  await expect(dialog.getByRole("button", { name: "Descargar PNG" })).toBeEnabled();
  const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Descargar PNG" }).click()]);
  const png = decodePng(readFileSync((await dl.path())!));
  expect(png.width * png.height).toBeLessThanOrEqual(50e6);
  expect(png.width * png.height).toBeGreaterThan(49e6);
});

// PDF KDP: objetivo de 40 MB y máximo de 200 MB. Requiere el companion real (puerto 47399, token fijo).
async function pdfDialog(page: Page) {
  await page.evaluate(() => (window as any).__editorStore.dispatch({ type: "setPrintSetup", printSetup: { trimWidthIn: 6, trimHeightIn: 9, pageCount: 828, paperAndInk: "bw-white", readingDirection: "ltr" } })); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Exportar/ });
  await dialog.getByLabel("Dirección del companion").fill("http://127.0.0.1:47399");
  await dialog.getByLabel("Token del companion").fill("e2e-token");
  await dialog.getByRole("button", { name: "Conectar" }).click();
  await expect(dialog.getByTestId("companion-status")).toHaveAttribute("data-status", "connected");
  await dialog.getByRole("radio", { name: /PDF/ }).click();
  return dialog;
}

test("PDF: el peor caso real (828 páginas, ruido a pantalla completa) queda bajo el objetivo de 40 MB", async ({ page }) => {
  // Cubierta de 14,11 × 9,25 in = 4235 × 2775 px a 300 ppp con una imagen de ruido sin compresión útil.
  await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 4240;
    c.height = 2780;
    const g = c.getContext("2d")!;
    const img = g.createImageData(4240, 2780);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = Math.random() * 255; img.data[i + 1] = Math.random() * 255; img.data[i + 2] = Math.random() * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.95));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "ruido.jpg", { type: "image/jpeg" }));
    const input = document.querySelector<HTMLInputElement>('input[type=file][aria-label="Subir imagen"]')!;
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(async () => typeof (await doc(page)).canvas.background).toBe("object");
  const dialog = await pdfDialog(page);
  await dialog.getByRole("button", { name: "Generar PDF" }).click();
  await expect(dialog.getByTestId("pdf-report")).toHaveAttribute("data-state", /ready|not_validated/, { timeout: 240_000 });
  await expect(dialog.getByTestId("check-weight")).toHaveAttribute("data-status", "pass");
  await expect(dialog.getByTestId("check-resolution")).toHaveAttribute("data-status", "pass");
  const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByTestId("pdf-download").click()]);
  const bytes = readFileSync((await dl.path())!).length;
  expect(bytes).toBeLessThan(40 * MiB);
  expect(bytes).toBeGreaterThan(5 * MiB); // el ruido no se comprime: la prueba pesa de verdad
});

test("PDF: por encima de 200 MB el informe falla y el archivo no se marca como listo", async ({ page }) => {
  // Con las medidas y los 300 ppp permitidos por la versión 1 no se puede generar un PDF de 200 MB de verdad, así que
  // se parte de la respuesta real del companion y solo se sustituye el peso medido por 210 MiB.
  await page.route("**/preflight?*", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const res = await route.fetch();
    const j = await res.json();
    j.report.ok = false;
    j.report.measured.bytes = 210 * MiB;
    j.report.checks = j.report.checks.map((c: { id: string; params?: object }) =>
      c.id === "weight" ? { ...c, status: "fail", params: { ...c.params, bytes: 210 * MiB } } : c);
    return route.fulfill({ response: res, json: j });
  });
  const dialog = await pdfDialog(page);
  await dialog.getByRole("button", { name: "Generar PDF" }).click();
  await expect(dialog.getByTestId("pdf-report")).toHaveAttribute("data-state", "not_validated", { timeout: 240_000 });
  await expect(dialog.getByTestId("pdf-state")).toContainText("NO validado");
  await expect(dialog.getByText("Listo para KDP", { exact: true })).toHaveCount(0);
  await expect(dialog.getByTestId("check-weight")).toHaveAttribute("data-status", "fail");
  await expect(dialog.getByTestId("check-weight")).toContainText("supera el máximo de 200 MB");
});
