import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { kdpLayout, type PrintSetup } from "@free-book-cover/core";
import { doc, freshEditor } from "./ui";

// Genera la muestra para el previsualizador de KDP con la cadena real (editor + companion) y la valida con
// herramientas independientes. Con FBC_WRITE_SAMPLE=1 deja el PDF en samples/ (ver samples/SAMPLE.md).
const SETUP: PrintSetup = { trimWidthIn: 6, trimHeightIn: 9, pageCount: 200, paperAndInk: "bw-white", readingDirection: "ltr" };
const L = kdpLayout(SETUP);
const sh = (bin: string, args: string[]) => execFileSync(bin, args, { encoding: "utf8" });
const dispatch = (page: import("@playwright/test").Page, cmd: unknown) => page.evaluate((c) => (window as any).__editorStore.dispatch(c), cmd); // eslint-disable-line @typescript-eslint/no-explicit-any

const text = (id: string, over: Record<string, unknown>, content: string, size: number, color: string, weight = 400) => ({
  id, type: "text", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 1, visible: true,
  runs: [{ text: content, fontFamily: "Georgia", fontSizePt: size, weight, italic: false, underline: false, uppercase: false, color }],
  align: "center", lineHeight: 1.2, letterSpacing: 0.02, shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#000000" }, curvature: 0,
  ...over,
});

test("muestra de portada KDP con la cadena real y comprobación independiente", async ({ page }) => {
  test.setTimeout(240_000);
  await freshEditor(page);
  await dispatch(page, { type: "setPrintSetup", printSetup: SETUP });
  // Fondo: degradado sin ruido, mayor que el lienzo a 300 ppp para conservar la resolución.
  await page.evaluate(async ([w, h]) => {
    const c = document.createElement("canvas");
    c.width = w as number;
    c.height = h as number;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, w as number, h as number);
    grad.addColorStop(0, "#14303f");
    grad.addColorStop(0.55, "#2c5a64");
    grad.addColorStop(1, "#0d1a22");
    g.fillStyle = grad;
    g.fillRect(0, 0, w as number, h as number);
    g.fillStyle = "rgba(201,162,92,.85)";
    g.fillRect(0, (h as number) * 0.58, w as number, 6);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "fondo-muestra.png", { type: "image/png" }));
    const input = document.querySelector<HTMLInputElement>('input[type=file][aria-label="Subir imagen"]')!;
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, [Math.ceil(L.widthIn * 300) + 10, Math.ceil(L.heightIn * 300) + 10] as const);
  await expect.poll(async () => typeof (await doc(page)).canvas.background).toBe("object");

  const sp = L.spine;
  await dispatch(page, { type: "addElement", element: text("titulo", { x: L.front.x + 0.6, y: 2.2, width: 4.8, height: 1.4, zIndex: 2 }, "LA CASA DE LA MUESTRA", 40, "#f4efe6", 700) });
  await dispatch(page, { type: "addElement", element: text("autor", { x: L.front.x + 0.6, y: 7.6, width: 4.8, height: 0.5, zIndex: 3 }, "Autora de Ejemplo", 22, "#c9a25c") });
  await dispatch(page, { type: "addElement", element: text("sinopsis", { x: L.back.x + 0.75, y: 2.4, width: 4.5, height: 3, align: "left", zIndex: 4 }, "Texto de contraportada de prueba para comprobar la zona segura, los márgenes y la legibilidad en el previsualizador de KDP. No es una obra real.", 14, "#f4efe6") });
  if (L.spineTextAllowed) {
    const len = 6.5;
    await dispatch(page, { type: "addElement", element: text("lomo", { x: sp.x + sp.width / 2 - len / 2, y: sp.y + sp.height / 2 - 0.16, width: len, height: 0.32, rotation: 90, zIndex: 5 }, "LA CASA DE LA MUESTRA · AUTORA DE EJEMPLO", 16, "#f4efe6", 700) });
  }

  // PDF con el companion real (puerto 47399, token fijo del arnés E2E).
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Exportar/ });
  await dialog.getByLabel("Dirección del companion").fill("http://127.0.0.1:47399");
  await dialog.getByLabel("Token del companion").fill("e2e-token");
  await dialog.getByRole("button", { name: "Conectar" }).click();
  await expect(dialog.getByTestId("companion-status")).toHaveAttribute("data-status", "connected");
  await dialog.getByRole("radio", { name: /PDF/ }).click();
  await dialog.getByRole("button", { name: "Generar PDF" }).click();
  await expect(dialog.getByTestId("pdf-report")).toHaveAttribute("data-state", "ready", { timeout: 180_000 });
  const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByTestId("pdf-download").click()]);
  const pdf = (await dl.path())!;
  const [rep] = await Promise.all([page.waitForEvent("download"), dialog.getByTestId("pdf-download-report").click()]);
  const report = readFileSync((await rep.path())!, "utf8");
  expect(report).toContain("LISTO PARA KDP");

  const info = sh("pdfinfo", [pdf]);
  const size = info.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/)!;
  expect(Number(size[1])).toBeCloseTo(L.widthIn * 72, 2);
  expect(Number(size[2])).toBeCloseTo(L.heightIn * 72, 2);
  expect(info).toMatch(/Pages:\s+1\b/);
  expect(() => sh("qpdf", ["--check", pdf])).not.toThrow();
  const images = sh("pdfimages", ["-list", pdf]).trim().split("\n").slice(2).map((l) => l.trim().split(/\s+/));
  expect(images[0]![5]).toBe("cmyk");
  expect(Number(images[0]![12])).toBeGreaterThanOrEqual(300);

  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/sample-measured.txt", `${info}\n${sh("pdfimages", ["-list", pdf])}\n${report}\nbytes ${readFileSync(pdf).length}\nspine ${L.spineIn} width ${L.widthIn} height ${L.heightIn}\n`);
  if (process.env.FBC_WRITE_SAMPLE === "1") {
    copyFileSync(pdf, "../../samples/portada-kdp-muestra.pdf");
    writeFileSync("../../samples/informe-preimpresion.txt", report);
  }
});
