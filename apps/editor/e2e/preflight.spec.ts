import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { makePng } from "./png";

// Companion real arrancado por playwright.config.ts (puerto 47399, token fijo).
const COMPANION = "http://127.0.0.1:47399";
const canvasSel = "[data-testid=cover-canvas] canvas.lower-canvas";
const WIDTH_IN = 12.4752; // 6 × 9 in, 100 págs, color estándar
const HEIGHT_IN = 9.25;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dispatch = (page: Page, cmd: unknown) => page.evaluate((c) => (window as any).__editorStore.dispatch(c), cmd);

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.evaluate(() => { sessionStorage.clear(); return indexedDB.databases().then((dbs) => Promise.all(dbs.map((d) => indexedDB.deleteDatabase(d.name!)))); });
  await page.reload();
  await expect(page.locator(canvasSel)).toBeVisible();
  const form = page.getByRole("form", { name: "Cubierta KDP" });
  await form.getByLabel("Número de páginas").fill("100");
  await form.getByRole("button", { name: "Aplicar configuración" }).click();
  await dispatch(page, { type: "setBackground", background: "#204060" });
});

const text = (id: string, family: string, y: number) => ({
  id, type: "text", x: 7, y, width: 4.5, height: 1, rotation: 0, zIndex: 1, visible: true,
  runs: [{ text: `Título ${id}`, fontFamily: family, fontSizePt: 40, weight: 700, italic: false, underline: false, uppercase: false, color: "#f4efe6" }],
  align: "center", lineHeight: 1.2, letterSpacing: 0, shadow: { on: true, intensity: 40 }, outline: { on: false, width: 3, color: "#000000" }, curvature: 0,
});

async function openPdf(page: Page) {
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  return dialog;
}
async function connect(dialog: ReturnType<Page["getByRole"]>) {
  await dialog.getByLabel("Dirección del companion").fill(COMPANION);
  await dialog.getByLabel("Token del companion").fill("e2e-token");
  await dialog.getByRole("button", { name: "Conectar" }).click();
  await expect(dialog.getByTestId("companion-status")).toHaveAttribute("data-status", "connected");
}
const sh = (bin: string, args: string[]) => execFileSync(bin, args, { encoding: "utf8" });

test("sin companion conectado la opción PDF está deshabilitada con explicación; con token se habilita", async ({ page }) => {
  const dialog = await openPdf(page);
  await expect(dialog.getByTestId("companion-status")).toHaveAttribute("data-status", "offline"); // nada en 47321
  await expect(dialog.getByRole("radio", { name: /PDF/ })).toBeDisabled();
  await expect(dialog.getByTestId("pdf-disabled-reason")).toContainText("necesita el companion conectado");
  // Un token incorrecto no conecta.
  await dialog.getByLabel("Dirección del companion").fill(COMPANION);
  await dialog.getByLabel("Token del companion").fill("incorrecto");
  await dialog.getByRole("button", { name: "Conectar" }).click();
  await expect(dialog.getByTestId("companion-status")).toHaveAttribute("data-status", "needs_token");
  await expect(dialog.getByRole("radio", { name: /PDF/ })).toBeDisabled();
  await connect(dialog);
  await expect(dialog.getByRole("radio", { name: /PDF/ })).toBeEnabled();
});

test("proyecto KDP válido: PDF que mide exactamente lo calculado, CMYK, 300 ppp y «Listo para KDP»", async ({ page }) => {
  await dispatch(page, { type: "addElement", element: text("uno", "Arial", 1) });
  await dispatch(page, { type: "addElement", element: { id: "r", type: "shape", shape: "rect", x: 7, y: 4, width: 4, height: 1.5, rotation: 0, zIndex: 0, visible: true, fill: "#a98a5f" } });
  const dialog = await openPdf(page);
  await connect(dialog);
  await dialog.getByRole("radio", { name: /PDF/ }).click();
  await expect(dialog.getByTestId("export-size")).toContainText("3743×2775 px");
  await dialog.getByRole("button", { name: "Generar PDF" }).click();
  await expect(dialog.getByTestId("pdf-report")).toHaveAttribute("data-state", "ready", { timeout: 120_000 });
  await expect(dialog.getByTestId("pdf-state")).toHaveText("Listo para KDP");
  await expect(dialog.getByTestId("pdf-proof")).toBeVisible();
  await expect(dialog.getByTestId("pdf-report")).toContainText("segundo plano (Worker)");
  for (const id of ["size", "ppi", "cmyk", "transparency", "fonts", "encryption", "resolution", "project"]) {
    await expect(dialog.getByTestId(`check-${id}`)).toHaveAttribute("data-status", "pass");
  }
  const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByTestId("pdf-download").click()]);
  expect(dl.suggestedFilename()).toBe("portada-kdp-3743x2775.pdf");
  const pdf = (await dl.path())!;

  // Inspección independiente con Poppler/qpdf (no usa código del companion).
  const info = sh("pdfinfo", [pdf]);
  const size = info.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/)!;
  expect(Number(size[1])).toBeCloseTo(WIDTH_IN * 72, 2);
  expect(Number(size[2])).toBeCloseTo(HEIGHT_IN * 72, 2);
  expect(info).toMatch(/Pages:\s+1\b/);
  expect(info).toMatch(/Encrypted:\s+no/);
  const images = sh("pdfimages", ["-list", pdf]).trim().split("\n").slice(2).map((l) => l.trim().split(/\s+/));
  expect(images).toHaveLength(1);
  expect(images[0]![5]).toBe("cmyk");
  expect(Number(images[0]![12])).toBeGreaterThanOrEqual(300);
  expect(Number(images[0]![13])).toBeGreaterThanOrEqual(300);
  expect(() => sh("qpdf", ["--check", pdf])).not.toThrow();
  expect(sh("pdffonts", [pdf]).trim().split("\n")).toHaveLength(2); // solo cabecera: sin fuentes
  expect(readFileSync(pdf).includes("/SMask")).toBe(false);

  // El informe descargable acompaña al PDF validado.
  const [rep] = await Promise.all([page.waitForEvent("download"), dialog.getByTestId("pdf-download-report").click()]);
  expect(rep.suggestedFilename()).toBe("portada-kdp-3743x2775-informe-preimpresion.txt");
  expect(readFileSync((await rep.path())!, "utf8")).toContain("LISTO PARA KDP");
});

test("recurso por debajo de 300 ppp: informe con error de resolución y sin estado validado", async ({ page }) => {
  await page.getByLabel("Subir imagen", { exact: true }).first().setInputFiles({ name: "f.png", mimeType: "image/png", buffer: makePng(100, 100, () => [200, 10, 10]) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await expect.poll(() => page.evaluate(() => typeof (window as any).__editorStore.getState().history.present.canvas.background)).toBe("object");
  const dialog = await openPdf(page);
  await connect(dialog);
  await dialog.getByRole("radio", { name: /PDF/ }).click();
  await dialog.getByRole("button", { name: "Generar PDF" }).click();
  await expect(dialog.getByTestId("pdf-report")).toHaveAttribute("data-state", "not_validated", { timeout: 120_000 });
  await expect(dialog.getByTestId("pdf-state")).toContainText("NO validado");
  await expect(dialog.getByText("Listo para KDP", { exact: true })).toHaveCount(0);
  const res = dialog.getByTestId("check-resolution");
  await expect(res).toHaveAttribute("data-status", "fail");
  await expect(res).toContainText("por debajo de 300 ppp efectivos");
  // El PDF en sí es técnicamente correcto, pero se entrega como prueba no validada.
  await expect(dialog.getByTestId("check-cmyk")).toHaveAttribute("data-status", "pass");
  const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByTestId("pdf-download").click()]);
  expect(dl.suggestedFilename()).toBe("portada-kdp-3743x2775-PRUEBA-NO-VALIDADA.pdf");
  const info = sh("pdfinfo", [(await dl.path())!]);
  expect(Number(info.match(/Page size:\s+([\d.]+) x/)![1])).toBeCloseTo(WIDTH_IN * 72, 2);
});

test("el Worker pinta exactamente los mismos píxeles que el hilo principal (texto, sombra, forma, imagen)", async ({ page }) => {
  await page.getByLabel("Subir imagen", { exact: true }).first().setInputFiles({ name: "f.png", mimeType: "image/png", buffer: makePng(64, 64, (x, y) => [x * 4, y * 4, 128]) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await expect.poll(() => page.evaluate(() => typeof (window as any).__editorStore.getState().history.present.canvas.background)).toBe("object");
  await dispatch(page, { type: "addElement", element: text("a", "Arial", 1) });
  await dispatch(page, { type: "addElement", element: text("b", "Georgia", 2.5) });
  await dispatch(page, { type: "addElement", element: { id: "e", type: "shape", shape: "ellipse", x: 7, y: 4, width: 3, height: 2, rotation: 20, zIndex: 0, visible: true, fill: "#a98a5f" } });
  await expect.poll(() => page.evaluate(() => typeof (window as any).__printRender)).toBe("function"); // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await page.evaluate(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any;
    const doc = w.__editorStore.getState().history.present;
    const size = { widthPx: Math.ceil(doc.canvas.widthIn * 300 - 1e-6), heightPx: Math.ceil(doc.canvas.heightIn * 300 - 1e-6) };
    const a = await w.__printRender("worker", doc, size);
    const b = await w.__printRender("main", doc, size);
    const data = async (blob: Blob) => {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    };
    const [da, db] = [await data(a.blob), await data(b.blob)];
    let diff = 0, drawn = 0;
    for (let i = 0; i < da.length; i += 4) {
      if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2] || da[i + 3] !== db[i + 3]) diff++;
      if (da[i]! > 200 && da[i + 1]! > 190) drawn++; // texto claro presente
    }
    return { via: [a.via, b.via], diff, drawn, len: da.length / 4, w: size.widthPx };
  });
  expect(r.via).toEqual(["worker", "main"]);
  expect(r.w).toBe(3743);
  expect(r.drawn).toBeGreaterThan(500); // hay texto de verdad, no una imagen vacía
  expect(r.diff).toBe(0);
});
