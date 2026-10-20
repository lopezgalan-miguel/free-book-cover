import { expect, test, type Page } from "@playwright/test";
import { makePng } from "./png";
import { doc, freshEditor, isMobile } from "./ui";

// Franjas verticales negras y blancas: la textura deja píxeles opacos en la caja del texto.
const stripes = makePng(64, 64, (x) => (Math.floor(x / 8) % 2 === 0 ? [0, 0, 0] : [255, 255, 255]));

// Texto grande seleccionado con una textura subida por la interfaz.
async function setup(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__editorStore;
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
  await page.getByLabel("Subir textura").setInputFiles({ name: "franjas.png", mimeType: "image/png", buffer: stripes });
  await expect.poll(async () => (await doc(page)).elements[0].texture?.assetId).toEqual(expect.any(String));
}

// Píxeles de la caja de la primera capa que difieren del de la esquina del lienzo (el fondo), pintando con el pintor de exportación.
const inkInBox = (page: Page) =>
  page.evaluate(async () => {
    const modulePath = "/src/canvas/paint.ts";
    const { paintDocument } = await import(/* @vite-ignore */ modulePath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sc = (window as any).__coverScene;
    const r = sc.lastRender;
    const out = document.createElement("canvas");
    out.width = Math.round(r.widthPx);
    out.height = Math.round(r.heightPx);
    const ctx = out.getContext("2d")!;
    paintDocument(ctx, r, sc.lastSources);
    const box = r.items.find((i: { id: string }) => i.id !== "s1").box;
    const bg = ctx.getImageData(0, 0, 1, 1).data;
    const d = ctx.getImageData(Math.floor(box.x), Math.floor(box.y), Math.ceil(box.width), Math.ceil(box.height)).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i]! - bg[0]!) + Math.abs(d[i + 1]! - bg[1]!) + Math.abs(d[i + 2]! - bg[2]!) > 60) n++;
    return n;
  });

test.beforeEach(async ({ page }, info) => {
  test.skip(isMobile(info), "los paneles y atajos de escritorio");
  await freshEditor(page);
});

test("copiar con textura, proyecto nuevo y pegar: la capa y su textura se pintan, también tras recargar", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Copiar", exact: true }).click();
  const idB = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__editorStore;
    await s.newProject();
    return s.getState().history.present.id as string;
  });
  const layers = page.getByRole("complementary", { name: "Capas" }).locator("li", { hasText: "Arial" });
  await expect(layers).toHaveCount(0);
  // Sin capa seleccionada en el proyecto nuevo, «Pegar» sigue a la vista en Posición y tamaño.
  await page.getByRole("button", { name: "Pegar", exact: true }).click();
  await expect(layers).toHaveCount(1);
  await expect.poll(async () => (await doc(page)).assets.length).toBe(1);
  await expect.poll(() => inkInBox(page)).toBeGreaterThan(100);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).__editorStore.save());
  await page.reload();
  await expect(page.locator("[data-testid=cover-canvas] canvas.upper-canvas")).toBeVisible();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate((id) => (window as any).__editorStore.openProject(id), idB);
  await expect.poll(async () => (await doc(page)).id).toBe(idB);
  await expect(layers).toHaveCount(1);
  await expect.poll(() => inkInBox(page)).toBeGreaterThan(100);
});

test("Ctrl+D duplica la capa seleccionada", async ({ page }) => {
  await setup(page);
  await page.locator("body").press("Control+d");
  await expect.poll(async () => (await doc(page)).elements.length).toBe(2);
  const [a, b] = (await doc(page)).elements;
  expect(b.x).toBeCloseTo(a.x + 0.125);
  expect(b.id).not.toBe(a.id);
});
