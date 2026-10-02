import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { quadrants } from "./png";

const here = dirname(fileURLToPath(import.meta.url));
// Fuente TrueType real que ya está en el repo (la de iconos de Playwright): evita depender de la red.
function findTtf(): Buffer {
  const pnpmDir = join(here, "../../../node_modules/.pnpm");
  const pkg = readdirSync(pnpmDir).find((d) => d.startsWith("playwright-core@"))!;
  const root = join(pnpmDir, pkg, "node_modules/playwright-core/lib/vite/recorder/assets");
  return readFileSync(join(root, readdirSync(root).find((f) => f.endsWith(".ttf"))!));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const doc = (page: Page): Promise<any> => page.evaluate(() => (window as any).__editorStore.getState().history.present);
const canvasSel = "[data-testid=cover-canvas] canvas.lower-canvas";

// Cuenta píxeles del lienzo Fabric cercanos a un color.
const countColor = (page: Page, rgb: number[], tol = 60) =>
  page.evaluate(([rgb, tol, sel]) => {
    const c = document.querySelector<HTMLCanvasElement>(sel as string)!;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i]! - (rgb as number[])[0]!) < (tol as number) && Math.abs(d[i + 1]! - (rgb as number[])[1]!) < (tol as number) && Math.abs(d[i + 2]! - (rgb as number[])[2]!) < (tol as number)) n++;
    return n;
  }, [rgb, tol, canvasSel] as const);

const selectRange = (page: Page, a: number, b: number) =>
  page.getByLabel("Contenido del texto").evaluate((el, [a, b]) => {
    const ta = el as HTMLTextAreaElement;
    ta.setSelectionRange(a as number, b as number);
    ta.dispatchEvent(new Event("select", { bubbles: true }));
  }, [a, b] as const);

async function newText(page: Page, content: string) {
  await page.getByRole("button", { name: "Añadir capa de texto" }).click();
  await page.getByLabel("Contenido del texto").fill(content);
  await page.getByLabel("Tamaño", { exact: true }).fill("64");
  // fondo oscuro para que los colores del texto destaquen
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => indexedDB.databases().then((dbs) => Promise.all(dbs.map((d) => indexedDB.deleteDatabase(d.name!)))));
  await page.reload();
  await expect(page.locator(canvasSel)).toBeVisible();
  await page.waitForFunction(() => Boolean((window as unknown as { __coverTools?: unknown }).__coverTools));
});

test("un bloque con dos fragmentos de estilo distinto se pinta con ambos y se recupera tras guardar y recargar", async ({ page }) => {
  await newText(page, "ROJO AZUL");
  await selectRange(page, 0, 5);
  await page.getByLabel("Color hexadecimal").fill("FF0000");
  await selectRange(page, 5, 9);
  await page.getByLabel("Color hexadecimal").fill("0000FF");
  await page.getByRole("button", { name: "Negrita" }).click();
  await expect.poll(async () => (await doc(page)).elements[0].runs.length).toBe(2);
  // Fabric pinta los dos fragmentos, cada uno con su color
  await expect.poll(() => countColor(page, [255, 0, 0])).toBeGreaterThan(200);
  expect(await countColor(page, [0, 0, 255])).toBeGreaterThan(200);

  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
  const saved = (await doc(page)).elements[0].runs;
  await page.reload();
  await expect(page.locator(canvasSel)).toBeVisible();
  await expect.poll(async () => (await doc(page)).elements.length).toBe(1);
  const reopened = (await doc(page)).elements[0].runs;
  expect(reopened).toEqual(saved);
  expect(reopened.map((r: { text: string; color: string; weight: number }) => [r.text, r.color])).toEqual([["ROJO ", "#ff0000"], ["AZUL", "#0000ff"]]);
  expect(reopened[0].weight).not.toBe(reopened[1].weight);
  await expect.poll(() => countColor(page, [255, 0, 0])).toBeGreaterThan(200);
  expect(await countColor(page, [0, 0, 255])).toBeGreaterThan(200);
});

// Diferencia media por píxel entre la vista previa y el pintor de exportación a la misma escala,
// y a escala 300 ppp reducida, dentro de la caja del texto.
async function previewVsExport(page: Page) {
  return page.evaluate(async (sel) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const tools = w.__coverTools;
    const store = w.__editorStore;
    const r = w.__coverScene.lastRender;
    const low = document.querySelector<HTMLCanvasElement>(sel)!;
    const W = low.width, H = low.height;
    const view = document.createElement("canvas");
    view.width = W; view.height = H;
    view.getContext("2d")!.drawImage(low, 0, 0);
    const mk = (ppi: number) => {
      const rr = tools.renderDocument(store.getState().history.present, { pxPerInch: ppi, measureText: tools.measure });
      const c = document.createElement("canvas");
      c.width = Math.round(rr.widthPx); c.height = Math.round(rr.heightPx);
      tools.paintDocument(c.getContext("2d")!, rr, w.__coverScene.lastSources);
      return c;
    };
    const same = mk(r.pxPerInch);
    const big = mk(300);
    const down = document.createElement("canvas");
    down.width = W; down.height = H;
    down.getContext("2d")!.drawImage(big, 0, 0, W, H);
    const mean = (a: HTMLCanvasElement, b: HTMLCanvasElement) => {
      const da = a.getContext("2d")!.getImageData(0, 0, W, H).data, db = b.getContext("2d")!.getImageData(0, 0, W, H).data;
      let s = 0;
      for (let i = 0; i < da.length; i += 4) s += (Math.abs(da[i]! - db[i]!) + Math.abs(da[i + 1]! - db[i + 1]!) + Math.abs(da[i + 2]! - db[i + 2]!)) / 3;
      return s / (da.length / 4);
    };
    // fracción de píxeles que no son del color de fondo (para comprobar que hay texto que comparar)
    const d = view.getContext("2d")!.getImageData(0, 0, W, H).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i]! < 250 || d[i + 1]! < 250 || d[i + 2]! < 250) ink++;
    return { sameScale: mean(view, same), at300: mean(view, down), ink: ink / (d.length / 4), flat: view.toDataURL() };
  }, canvasSel);
}

test("un bloque curvado y con textura se ve igual en la vista previa y en la exportación", async ({ page }) => {
  await newText(page, "CURVA");
  await page.getByLabel("Subir textura").setInputFiles({ name: "tex.png", mimeType: "image/png", buffer: quadrants(300, 300) });
  await expect.poll(async () => (await doc(page)).elements[0].texture).toEqual({ assetId: expect.any(String) });
  await expect.poll(async () => (await previewVsExport(page)).ink).toBeGreaterThan(0.01);
  // la textura rellena el texto: aparecen los colores de los cuadrantes
  await expect.poll(() => countColor(page, [220, 30, 30], 50)).toBeGreaterThan(30);
  expect(await countColor(page, [30, 30, 220], 50)).toBeGreaterThan(30);
  const flat = await previewVsExport(page);

  await page.getByTestId("curve-slider").fill("70");
  await expect.poll(async () => (await doc(page)).elements[0].curvature).toBe(70);
  await expect.poll(async () => (await previewVsExport(page)).flat).not.toBe(flat.flat); // la curva cambia la forma
  const curved = await previewVsExport(page);
  expect(curved.sameScale).toBeLessThan(1.5);
  expect(curved.at300).toBeLessThan(6);

  await page.getByRole("switch", { name: "Sombra" }).click();
  await page.getByRole("switch", { name: "Contorno" }).click();
  await expect.poll(async () => (await doc(page)).elements[0].outline.on).toBe(true);
  await expect.poll(async () => (await previewVsExport(page)).sameScale).toBeLessThan(1.5);
  expect((await previewVsExport(page)).at300).toBeLessThan(6);

  // curvatura negativa: otra forma, misma coincidencia
  await page.getByTestId("curve-slider").fill("-70");
  await expect.poll(async () => (await doc(page)).elements[0].curvature).toBe(-70);
  await expect.poll(async () => (await previewVsExport(page)).sameScale).toBeLessThan(1.5);
});

test("subir una fuente real la registra con FontFace, la guarda en IndexedDB y se recarga al reabrir; una corrupta se rechaza", async ({ page }) => {
  await newText(page, "Fuente");
  await page.getByLabel("Subir fuente").setInputFiles({ name: "Iconos.ttf", mimeType: "font/ttf", buffer: findTtf() });
  await expect.poll(async () => (await doc(page)).elements[0].runs[0].fontFamily).toBe("Iconos");
  const asset = (await doc(page)).assets.find((a: { kind: string }) => a.kind === "font");
  expect(asset).toMatchObject({ mimeType: "font/ttf", metadata: { family: "Iconos", format: "ttf" } });
  expect(await page.evaluate(() => [...document.fonts].some((f) => f.family === "Iconos" && f.status === "loaded"))).toBe(true);
  await expect(page.getByTestId("font-warning")).toHaveCount(0);

  await page.getByLabel("Subir fuente").setInputFiles({ name: "Rota.ttf", mimeType: "font/ttf", buffer: Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(64, 7)]) });
  await expect(page.getByRole("alert")).toContainText("No se pudo cargar la fuente «Rota»");
  expect((await doc(page)).assets.filter((a: { kind: string }) => a.kind === "font")).toHaveLength(1);

  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(() => page.evaluate(() => [...document.fonts].map((f) => `${f.family}:${f.status}`).filter((x) => x.startsWith("Iconos")))).toEqual(["Iconos:loaded"]);
  await expect(page.getByTestId("font-warning")).toHaveCount(0);
});

test("una fuente subida cuyo archivo se pierde queda marcada como no disponible", async ({ page }) => {
  await newText(page, "Perdida");
  await page.getByLabel("Subir fuente").setInputFiles({ name: "Perdida.ttf", mimeType: "font/ttf", buffer: findTtf() });
  await expect.poll(async () => (await doc(page)).elements[0].runs[0].fontFamily).toBe("Perdida");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
  // se borra el blob de IndexedDB dejando el documento intacto
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open("kdp-cover-creator"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = db.transaction("assets", "readwrite");
    tx.objectStore("assets").clear();
    await new Promise((res) => (tx.oncomplete = res));
    db.close();
  });
  await page.reload();
  await expect(page.getByTestId("font-warning")).toContainText("«Perdida»");
});
