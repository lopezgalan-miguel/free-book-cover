import { expect, test } from "@playwright/test";
import { doc, editCoverOps, freshEditor, normalizeDoc } from "./ui";
import { quadrants } from "./png";

// Aceptación R-10: las mismas operaciones en móvil (hoja inferior) y en escritorio dan un documento idéntico.
test("las mismas ediciones en móvil y en escritorio producen el mismo documento", async ({ browser }) => {
  const bg = quadrants(600, 900);
  const run = async (mobile: boolean) => {
    const ctx = await browser.newContext(
      mobile
        ? { baseURL: "http://localhost:5199", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
        : { baseURL: "http://localhost:5199", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    );
    const page = await ctx.newPage();
    await freshEditor(page);
    await expect(page.getByTestId("tab-text")).toHaveCount(mobile ? 1 : 0);
    await editCoverOps(page, mobile, bg);
    const d = normalizeDoc(await doc(page));
    await ctx.close();
    return d;
  };
  const desktop = await run(false);
  const mobile = await run(true);
  expect(mobile).toEqual(desktop);
  // Sanidad: el documento contiene de verdad lo editado.
  expect(desktop).toMatchObject({
    canvas: { widthIn: 5.5, heightIn: 8.5, backgroundFit: "cover" },
    elements: [{ type: "text", runs: [{ text: "Título de prueba", fontFamily: "Playfair Display", color: "#b4453a", weight: 700, fontSizePt: 48 }], shadow: { on: true } }],
  });
});
