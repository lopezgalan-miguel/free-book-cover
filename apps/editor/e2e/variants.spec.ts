import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, quadrants } from "./png";

const RED = [220, 30, 30], GREEN = [30, 200, 30], BLUE = [30, 30, 220], YELLOW = [230, 220, 30], MAGENTA = [255, 0, 255];
const canvasSel = "[data-testid=cover-canvas] canvas.lower-canvas";
const here = dirname(fileURLToPath(import.meta.url));
function findTtf(): Buffer {
  const pnpmDir = join(here, "../../../node_modules/.pnpm");
  const pkg = readdirSync(pnpmDir).find((d) => d.startsWith("playwright-core@"))!;
  const root = join(pnpmDir, pkg, "node_modules/playwright-core/lib/vite/recorder/assets");
  return readFileSync(join(root, readdirSync(root).find((f) => f.endsWith(".ttf"))!));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const doc = (page: Page): Promise<any> => page.evaluate(() => (window as any).__editorStore.getState().history.present);
const exact = (got: number[], want: number[]) => expect(got.slice(0, 3)).toEqual(want);
const bytesLabel = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => indexedDB.databases().then((dbs) => Promise.all(dbs.map((d) => indexedDB.deleteDatabase(d.name!)))));
  await page.reload();
  await expect(page.locator(canvasSel)).toBeVisible();
});

async function setup(page: Page) {
  await page.getByLabel("Subir imagen", { exact: true }).setInputFiles({ name: "fondo.png", mimeType: "image/png", buffer: quadrants(600, 900) });
  await expect.poll(async () => (await doc(page)).canvas.background).toEqual({ assetId: expect.any(String) });
  await page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__editorStore.dispatch({
      type: "addElement",
      element: { id: "s1", type: "shape", shape: "rect", x: 1, y: 2, width: 2, height: 1, rotation: 0, zIndex: 0, visible: true, fill: "#ff00ff" },
    }));
}

async function addVariant(page: Page, presetId: string): Promise<string> {
  await page.getByLabel("Destino", { exact: true }).first().selectOption(presetId);
  await page.getByRole("button", { name: "Añadir variante" }).click();
  const targets = (await doc(page)).digitalTargets as Array<{ id: string; presetId: string }>;
  return targets.find((t) => t.presetId === presetId)!.id;
}

// Abre el modal, exporta al destino y formato indicados y devuelve el archivo descargado y el informe.
async function exportAs(page: Page, destId: string, format: "PNG" | "JPEG" | "WebP", quality?: number) {
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Destino").selectOption(destId);
  await dialog.getByRole("radio", { name: new RegExp(format) }).click();
  if (quality !== undefined) await dialog.getByLabel("Calidad").fill(String(quality));
  const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: `Descargar ${format}` }).click()]);
  const bytes = readFileSync((await dl.path())!);
  const report = await dialog.getByTestId("export-report").innerText();
  await dialog.getByRole("button", { name: "Cerrar" }).click();
  return { bytes, report, fileName: dl.suggestedFilename() };
}

test("dos variantes con proporciones distintas exportan exactamente sus píxeles y son independientes entre sí y del base", async ({ page }) => {
  await setup(page);
  const A = await addVariant(page, "instagram-feed-portrait"); // 1080×1350 (4:5)
  const B = await addVariant(page, "instagram-vertical"); // 1080×1920 (9:16)
  const baseBefore = JSON.stringify((await doc(page)).elements);

  // La vista activa muestra la variante con su proporción.
  const ratio = () => page.evaluate((sel) => { const c = document.querySelector<HTMLCanvasElement>(sel)!; return c.width / c.height; }, canvasSel);
  await expect.poll(ratio).toBeCloseTo(1080 / 1920, 2);

  // Variante A: 1,8 de escala (cubrir 600×900 en 1080×1350, recorte vertical centrado).
  const a1 = await exportAs(page, A, "PNG");
  const pa = decodePng(a1.bytes);
  expect([pa.width, pa.height]).toEqual([1080, 1350]);
  exact(pa.px(10, 10), RED); exact(pa.px(1070, 10), GREEN); exact(pa.px(10, 1340), BLUE); exact(pa.px(1070, 1340), YELLOW);
  exact(pa.px(530, 660), RED); exact(pa.px(550, 660), GREEN); exact(pa.px(530, 690), BLUE); exact(pa.px(550, 690), YELLOW);
  // el cuadro del base (1,2 in … 3,3 in) queda en (180, 225) con 360×180 px
  exact(pa.px(181, 226), MAGENTA); exact(pa.px(538, 403), MAGENTA); exact(pa.px(360, 315), MAGENTA);
  exact(pa.px(178, 315), RED); exact(pa.px(360, 222), RED); exact(pa.px(360, 408), RED);
  expect(a1.report).toContain("1080×1350 px");
  expect(a1.report).toContain(bytesLabel(a1.bytes.length));
  expect(a1.report).toContain("Instagram · Feed vertical 4:5");
  expect(a1.fileName).toMatch(/1080x1350\.png$/);

  // Variante B: otra proporción, otro encuadre.
  const b1 = await exportAs(page, B, "PNG");
  const pb = decodePng(b1.bytes);
  expect([pb.width, pb.height]).toEqual([1080, 1920]);
  exact(pb.px(10, 10), RED); exact(pb.px(1070, 10), GREEN); exact(pb.px(10, 1910), BLUE); exact(pb.px(1070, 1910), YELLOW);
  exact(pb.px(530, 940), RED); exact(pb.px(550, 940), GREEN); exact(pb.px(530, 980), BLUE); exact(pb.px(550, 980), YELLOW);
  // cuadro: x 113,3…540 px, y 426,7…640 px
  exact(pb.px(300, 530), MAGENTA); exact(pb.px(120, 440), MAGENTA); exact(pb.px(530, 630), MAGENTA);
  exact(pb.px(100, 530), RED); exact(pb.px(300, 415), RED); exact(pb.px(300, 650), RED);

  // Reencuadrar el cuadro solo en A desde el panel de geometría.
  await page.getByRole("button", { name: /^Instagram · Feed vertical 4:5/ }).click();
  await page.evaluate(() => (window as unknown as { __editorStore: { select(id: string): void } }).__editorStore.select("s1"));
  const x = page.getByLabel("X (in)");
  await expect(x).toHaveValue("0.6");
  await x.fill("0.1");
  await x.blur();
  await expect.poll(async () => (await doc(page)).digitalTargets[0].layoutOverrides).toEqual({ elements: { s1: { x: 0.1 } } });

  const a2 = decodePng((await exportAs(page, A, "PNG")).bytes);
  exact(a2.px(45, 315), MAGENTA); // nueva posición: 0,1 in = 30 px
  exact(a2.px(450, 315), RED); // la anterior (180…540 px) queda libre más allá del nuevo borde (390 px)
  // B es idéntica pixel a pixel y el base no cambió.
  const b2 = await exportAs(page, B, "PNG");
  expect(b2.bytes.equals(b1.bytes)).toBe(true);
  const d = await doc(page);
  expect(JSON.stringify(d.elements)).toBe(baseBefore);
  expect(d.digitalTargets[1].layoutOverrides).toEqual({});

  // Diseño base a 300 ppp: 1800×2700 con el cuadro en (300, 600).
  const base = decodePng((await exportAs(page, "base", "PNG")).bytes);
  expect([base.width, base.height]).toEqual([1800, 2700]);
  exact(base.px(500, 750), MAGENTA); exact(base.px(290, 750), RED); exact(base.px(10, 2690), BLUE);

  // La variante guarda versión del preajuste y dimensiones resueltas (no depende del catálogo vigente).
  expect(d.digitalTargets[0]).toMatchObject({ presetId: "instagram-feed-portrait", presetVersion: 1, widthPx: 1080, heightPx: 1350 });
});

// Decodifica JPEG/WebP en el navegador y devuelve dimensiones y colores de varios puntos.
async function sample(page: Page, bytes: Buffer, mime: string, pts: Array<[number, number]>) {
  return page.evaluate(async ({ b64, mime, pts }) => {
    const bin = atob(b64);
    const u8 = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([u8], { type: mime }));
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    return { w: bmp.width, h: bmp.height, colors: pts.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3)) };
  }, { b64: bytes.toString("base64"), mime, pts });
}
const near = (a: number[], b: number[], tol = 14) => a.every((v, i) => Math.abs(v - b[i]!) <= tol);

test("JPEG y WebP respetan dimensiones y calidad; Instagram no ofrece WebP", async ({ page }) => {
  await setup(page);
  const ig = await addVariant(page, "instagram-feed-portrait");
  const fb = await addVariant(page, "facebook-feed");

  const lo = await exportAs(page, ig, "JPEG", 20);
  const hi = await exportAs(page, ig, "JPEG", 95);
  expect(hi.bytes.length).toBeGreaterThan(lo.bytes.length);
  expect(hi.report).toContain("JPEG · 95%");
  const j = await sample(page, hi.bytes, "image/jpeg", [[10, 10], [1070, 10], [10, 1340], [1070, 1340], [360, 315]]);
  expect([j.w, j.h]).toEqual([1080, 1350]);
  expect(j.colors.every((c, i) => near(c, [RED, GREEN, BLUE, YELLOW, MAGENTA][i]!))).toBe(true);
  expect(hi.fileName).toMatch(/\.jpg$/);

  const w = await exportAs(page, fb, "WebP", 90);
  const ws = await sample(page, w.bytes, "image/webp", [[10, 10], [1070, 1340]]);
  expect([ws.w, ws.h]).toEqual([1080, 1350]);
  expect(near(ws.colors[0]!, RED) && near(ws.colors[1]!, YELLOW)).toBe(true);
  expect(w.report).toContain("WebP · 90%");
  expect(w.fileName).toMatch(/\.webp$/);

  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Destino").selectOption(ig);
  await expect(dialog.getByRole("radio", { name: /WebP/ })).toBeDisabled();
});

test("el límite de 50 MP bloquea con error explícito y ofrece reducir; un tamaño propio válido se exporta con sus píxeles", async ({ page }) => {
  await setup(page);
  await page.getByLabel("Destino", { exact: true }).first().selectOption("custom");
  await page.locator("#variant-w").fill("8000");
  await page.locator("#variant-h").fill("7000");
  await page.getByRole("button", { name: "Añadir variante" }).click();
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("export-limit")).toContainText("56.0 megapíxeles");
  await expect(dialog.getByRole("button", { name: "Descargar PNG" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancelar" }).click();

  // Diseño base ampliado a 30×30 in (81 MP a 300 ppp): se ofrece reducir y la reducción cabe en el límite.
  await page.evaluate(() => (window as unknown as { __editorStore: { dispatch(c: unknown): void } }).__editorStore.dispatch({ type: "setCanvas", widthIn: 30, heightIn: 30 }));
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  await dialog.getByLabel("Destino").selectOption("base");
  await expect(dialog.getByTestId("export-limit")).toContainText("81.0 megapíxeles");
  await dialog.getByRole("button", { name: /Reducir a/ }).click();
  await expect(dialog.getByTestId("export-limit")).toHaveCount(0);
  const [w, h] = (await dialog.getByTestId("export-size").innerText()).replace(" px", "").split("×").map(Number);
  expect(w! * h!).toBeLessThanOrEqual(50e6);
  expect(w! * h!).toBeGreaterThan(49e6);
  await dialog.getByRole("button", { name: "Cancelar" }).click();

  // Tamaño propio pequeño: píxeles exactos.
  await page.evaluate(() => (window as unknown as { __editorStore: { dispatch(c: unknown): void } }).__editorStore.dispatch({ type: "setCanvas", widthIn: 6, heightIn: 9 }));
  await page.getByLabel("Destino", { exact: true }).first().selectOption("custom");
  await page.locator("#variant-w").fill("64");
  await page.locator("#variant-h").fill("48");
  await page.getByRole("button", { name: "Añadir variante" }).click();
  const custom = ((await doc(page)).digitalTargets as Array<{ id: string; widthPx: number }>).find((t) => t.widthPx === 64)!.id;
  const small = await exportAs(page, custom, "PNG");
  const ps = decodePng(small.bytes);
  expect([ps.width, ps.height]).toEqual([64, 48]);
  exact(ps.px(2, 2), RED);
  exact(ps.px(61, 45), YELLOW);
  expect(small.report).toContain("64×48 px");
  expect(small.report).toContain("Personalizado 64×48");
});

test("una fuente no disponible bloquea la exportación con un informe claro y no se descarga nada", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Añadir capa de texto" }).click();
  await page.getByLabel("Subir fuente").setInputFiles({ name: "Perdida.ttf", mimeType: "font/ttf", buffer: findTtf() });
  await expect.poll(async () => (await doc(page)).elements.find((e: { type: string }) => e.type === "text").runs[0].fontFamily).toBe("Perdida");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
  const fontAssetId = ((await doc(page)).assets as Array<{ id: string; kind: string }>).find((a) => a.kind === "font")!.id;
  await page.evaluate(async (fid) => {
    const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open("kdp-cover-creator"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = db.transaction("assets", "readwrite");
    const store = tx.objectStore("assets");
    const keys = await new Promise<IDBValidKey[]>((res) => { const q = store.getAllKeys(); q.onsuccess = () => res(q.result); });
    for (const k of keys) if (JSON.stringify(k).includes(fid)) store.delete(k);
    await new Promise((res) => (tx.oncomplete = res));
    db.close();
  }, fontAssetId);
  await page.reload();
  await expect(page.getByTestId("font-warning")).toContainText("«Perdida»");

  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  let downloaded = false;
  page.on("download", () => (downloaded = true));
  await dialog.getByRole("button", { name: "Descargar PNG" }).click();
  await expect(dialog.getByTestId("export-error")).toContainText("No se exporta");
  await expect(dialog.getByTestId("export-font-problem")).toContainText("«Perdida»");
  // el reintento no puede recuperar un archivo que ya no existe: sigue bloqueado
  await dialog.getByRole("button", { name: "Reintentar carga de fuentes" }).click();
  await dialog.getByRole("button", { name: "Descargar PNG" }).click();
  await expect(dialog.getByTestId("export-font-problem")).toContainText("«Perdida»");
  expect(downloaded).toBe(false);
});
