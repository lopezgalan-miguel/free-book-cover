import { expect, test } from "@playwright/test";
import { closeSheet, doc, freshEditor, isMobile, openTab } from "./ui";
import { decodePng, quadrants } from "./png";
import { readFileSync } from "node:fs";

// Flujos críticos: se ejecutan en el proyecto de escritorio y en el móvil (hoja inferior).
test.beforeEach(async ({ page }) => {
  await freshEditor(page);
});

test("crear proyecto, editar texto, fuente, color, estilo y lienzo, y exportar PNG", async ({ page }, info) => {
  const mobile = isMobile(info);
  // Proyecto nuevo: 6 × 9 in, sin capas.
  expect(await doc(page)).toMatchObject({ canvas: { widthIn: 6, heightIn: 9 }, elements: [] });
  expect(await page.getByTestId("tab-text").count()).toBe(mobile ? 1 : 0);

  await openTab(page, mobile, "text");
  await page.getByRole("button", { name: "Añadir capa de texto" }).click();
  await page.getByLabel("Contenido del texto").fill("Portada");
  await closeSheet(page, mobile);
  await expect.poll(async () => (await doc(page)).elements[0]?.runs[0].text).toBe("Portada");

  await openTab(page, mobile, "font");
  await page.getByRole("button", { name: "Playfair Display", exact: true }).click();
  await closeSheet(page, mobile);
  await expect.poll(async () => (await doc(page)).elements[0].runs[0].fontFamily).toBe("Playfair Display");

  await openTab(page, mobile, "color");
  await page.getByLabel("Color hexadecimal").fill("#112233");
  await closeSheet(page, mobile);
  await expect.poll(async () => (await doc(page)).elements[0].runs[0].color).toBe("#112233");

  await openTab(page, mobile, "style");
  await page.getByRole("button", { name: "Cursiva" }).click();
  await page.getByRole("switch", { name: "Contorno" }).click();
  await closeSheet(page, mobile);
  const t = (await doc(page)).elements[0];
  expect(t.runs[0].italic).toBe(true);
  expect(t.outline.on).toBe(true);

  await openTab(page, mobile, "canvas");
  await page.getByLabel("Subir imagen", { exact: true }).setInputFiles({ name: "f.png", mimeType: "image/png", buffer: quadrants(900, 1350) });
  await expect.poll(async () => (await doc(page)).canvas.background).toEqual({ assetId: expect.any(String) });
  await closeSheet(page, mobile);

  // Exportar PNG: el archivo descargado tiene el tamaño del lienzo a 300 ppp.
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Exportar/ });
  const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Descargar PNG" }).click()]);
  const png = decodePng(readFileSync((await dl.path())!));
  expect([png.width, png.height]).toEqual([1800, 2700]);
});

test("guardar y recargar conserva el proyecto", async ({ page }, info) => {
  const mobile = isMobile(info);
  await openTab(page, mobile, "text");
  await page.getByRole("button", { name: "Añadir capa de texto" }).click();
  await page.getByLabel("Contenido del texto").fill("Persistente");
  await closeSheet(page, mobile);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(async () => (await doc(page)).elements[0]?.runs[0].text).toBe("Persistente");
});

test("cubierta KDP: el PDF queda deshabilitado con explicación sin companion y se habilita al conectarlo", async ({ page }, info) => {
  const mobile = isMobile(info);
  // Puerto cerrado a propósito: sin companion.
  await page.evaluate(() => sessionStorage.setItem("kdp.companion", JSON.stringify({ baseUrl: "http://127.0.0.1:47398", token: "" })));
  await openTab(page, mobile, "canvas");
  const form = page.getByRole("form", { name: "Cubierta KDP" });
  await form.getByLabel("Número de páginas").fill("100");
  await form.getByRole("button", { name: "Aplicar configuración" }).click();
  await expect.poll(async () => (await doc(page)).mode).toBe("kdp-paperback");
  await closeSheet(page, mobile);

  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Exportar/ });
  // Las exportaciones digitales siguen disponibles en móvil.
  await expect(dialog.getByRole("radio", { name: /PNG/ })).toBeEnabled();
  await expect(dialog.getByTestId("companion-status")).toHaveAttribute("data-status", "offline");
  await expect(dialog.getByRole("radio", { name: /PDF/ })).toBeDisabled();
  await expect(dialog.getByTestId("pdf-disabled-reason")).toContainText("necesita el companion");

  await dialog.getByLabel("Dirección del companion").fill("http://127.0.0.1:47399");
  await dialog.getByLabel("Token del companion").fill("e2e-token");
  await dialog.getByRole("button", { name: "Conectar" }).click();
  await expect(dialog.getByTestId("companion-status")).toHaveAttribute("data-status", "connected");
  await expect(dialog.getByRole("radio", { name: /PDF/ })).toBeEnabled();
});
