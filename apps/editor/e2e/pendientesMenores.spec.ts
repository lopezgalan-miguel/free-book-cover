import { expect, test, type Page } from "@playwright/test";
import { doc, freshEditor } from "./ui";

// Elementos de prueba: una forma con opacidad propia en el base y un texto para la textura.
async function addShape(page: Page) {
  await page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__editorStore.dispatch({
      type: "addElement",
      element: { id: "s1", type: "shape", shape: "rect", x: 1, y: 2, width: 2, height: 1, rotation: 0, zIndex: 0, visible: true, fill: "#ff00ff", opacity: 0.5 },
    }));
}
const select = (page: Page, id: string) =>
  page.evaluate((id) => (window as unknown as { __editorStore: { select(id: string): void } }).__editorStore.select(id), id);
const baseOpacity = async (page: Page) => (await doc(page)).elements.find((e: { id: string }) => e.id === "s1").opacity;

test.beforeEach(async ({ page }) => {
  await freshEditor(page);
});

test("la opacidad de una variante no toca el diseño base y «Restablecer elemento» recupera la del base", async ({ page }) => {
  await addShape(page);
  await page.getByLabel("Destino", { exact: true }).first().selectOption("instagram-feed-portrait");
  await page.getByRole("button", { name: "Añadir variante" }).click();
  await select(page, "s1");

  const slider = page.getByLabel("Opacidad", { exact: true });
  await expect(slider).toHaveValue("50"); // hereda la del base
  await slider.fill("40");
  await expect.poll(async () => (await doc(page)).digitalTargets[0].layoutOverrides.elements.s1?.opacity).toBe(0.4);
  expect(await baseOpacity(page)).toBe(0.5);

  // Vuelve al diseño base: sigue en 50 %.
  await page.getByRole("button", { name: "Diseño base" }).click();
  await select(page, "s1");
  await expect(page.getByLabel("Opacidad", { exact: true })).toHaveValue("50");
  expect(await baseOpacity(page)).toBe(0.5);

  // De nuevo en la variante: conserva el 40 % y «Restablecer elemento» vuelve al valor del base.
  await page.getByRole("button", { name: /^Instagram · Feed vertical 4:5/ }).click();
  await select(page, "s1");
  await expect(page.getByLabel("Opacidad", { exact: true })).toHaveValue("40");
  await page.getByRole("button", { name: "Restablecer elemento" }).click();
  await expect(page.getByLabel("Opacidad", { exact: true })).toHaveValue("50");
  await expect.poll(async () => (await doc(page)).digitalTargets[0].layoutOverrides.elements?.s1?.opacity).toBeUndefined();
  expect(await baseOpacity(page)).toBe(0.5);
});

test("el generador de texturas aplica escala, color base y suavizado y la vista sigue pintando", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__editorStore;
    s.dispatch({ type: "setBackground", background: "#c81e1e" });
    s.dispatch({
      type: "addElement",
      element: {
        id: "t1", type: "text", x: 0.5, y: 2, width: 5, height: 2, rotation: 0, zIndex: 0, visible: true,
        runs: [{ text: "HHHH", fontFamily: "Arial", fontSizePt: 120, weight: 700, italic: false, underline: false, uppercase: false, color: "#ffffff" }],
        align: "center", lineHeight: 1.2, letterSpacing: 0, shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#000000" }, curvature: 0,
      },
    });
    s.select("t1");
  });
  const group = page.getByRole("group", { name: "Textura incluida" });
  await group.scrollIntoViewIfNeeded();
  await group.getByLabel("Tipo de textura").selectOption("stone");
  const scale = group.getByLabel("Escala", { exact: true });
  await scale.fill("4"); await scale.blur();
  await group.getByLabel("Color base", { exact: true }).fill("#336699");
  const soften = group.getByLabel("Suavizado", { exact: true });
  await soften.fill("3"); await soften.blur();
  await group.getByRole("button", { name: "Generar textura" }).click();

  await expect.poll(async () => (await doc(page)).elements[0].texture?.assetId).toEqual(expect.any(String));
  const d = await doc(page);
  expect(d.elements[0].texture).toMatchObject({ fit: "tile" });
  expect(d.assets.some((a: { id: string }) => a.id === d.elements[0].texture.assetId)).toBe(true);

  // La vista sigue viva y el texto ya no es blanco liso: hay píxeles con el color base azulado.
  await expect(page.locator("[data-testid=cover-canvas] canvas.lower-canvas")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>("[data-testid=cover-canvas] canvas.lower-canvas")!;
    const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let blue = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 2]! > data[i]! + 20) blue++;
    return blue > 100;
  })).toBe(true);
  expect(errors).toEqual([]);
});
