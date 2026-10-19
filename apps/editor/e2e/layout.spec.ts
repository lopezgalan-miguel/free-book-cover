import { expect, test } from "@playwright/test";

// U-08: con una ventana baja, los paneles se desplazan por dentro; la página no debe crecer ni moverse
// (los <input> ocultos con position:absolute escapaban de los paneles y alargaban el documento).
test("en escritorio con poca altura la página no se desplaza aunque los paneles sí", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "solo escritorio");
  await page.setViewportSize({ width: 1440, height: 735 });
  await page.goto("/");
  await page.evaluate(() => indexedDB.databases().then((dbs) => Promise.all(dbs.map((d) => indexedDB.deleteDatabase(d.name!)))));
  await page.reload();
  await page.locator("[data-testid=cover-canvas] canvas.upper-canvas").waitFor();
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Añadir capa de texto" }).click();
  // Llevar a la vista los controles del final de ambos paneles (como hace un lector de pantalla o el foco).
  await page.getByLabel("Subir textura").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Añadir variante" }).scrollIntoViewIfNeeded();
  await page.getByTestId("layer-image-input").evaluate((el) => el.scrollIntoView());
  const m = await page.evaluate(() => ({ scrollY: window.scrollY, docH: document.documentElement.scrollHeight, vh: window.innerHeight }));
  expect(m.docH).toBeLessThanOrEqual(m.vh);
  expect(m.scrollY).toBe(0);
});
