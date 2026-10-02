import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { closeSheet, doc, freshEditor, openTab } from "./ui";
import { decodePng } from "./png";

// Rendimiento con proyectos de referencia (SDD §6). Los números se miden en cada ejecución y se
// escriben en test-results/perf.json; los presupuestos son holguras sobre lo medido (ver PERFORMANCE.md).
const results: Record<string, Record<string, number | string>> = {};
test.afterAll(() => {
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/perf.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
});

const cdpHeapMb = async (page: Page) => {
  const s = await page.context().newCDPSession(page);
  await s.send("Performance.enable");
  const m = (await s.send("Performance.getMetrics")).metrics;
  await s.detach();
  return Math.round((m.find((x) => x.name === "JSHeapUsedSize")?.value ?? 0) / 1048576);
};
// RSS sumado de los procesos de este Chromium de Playwright (renderizador y GPU incluidos).
const rssMb = () => {
  const out = execFileSync("ps", ["-axo", "rss=,command="], { encoding: "utf8" });
  let kb = 0;
  for (const line of out.split("\n")) if (/ms-playwright/.test(line) && /(Chromium|chrome|Headless)/i.test(line)) kb += Number(line.trim().split(/\s+/)[0]);
  return Math.round(kb / 1024);
};

// Intervalos entre fotogramas durante una acción.
async function frames(page: Page, action: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as unknown as { __f: number[]; __run: boolean };
    w.__f = [];
    w.__run = true;
    let last = performance.now();
    const tick = (t: number) => {
      w.__f.push(t - last);
      last = t;
      if (w.__run) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await action();
  const f = await page.evaluate(() => {
    const w = window as unknown as { __f: number[]; __run: boolean };
    w.__run = false;
    return w.__f.slice(1);
  });
  const s = [...f].sort((a, b) => a - b);
  const pick = (q: number) => Math.round((s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0) * 10) / 10;
  return { frames: f.length, p50Ms: pick(0.5), p95Ms: pick(0.95), maxMs: Math.round((s.at(-1) ?? 0) * 10) / 10, over50: f.filter((x) => x > 50).length };
}

// Espera a que la escena Fabric complete un nuevo render y devuelve los ms desde `t0` en la página.
const nextRender = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((res) => {
        const sc = (window as any).__coverScene; // eslint-disable-line @typescript-eslint/no-explicit-any
        const before = sc.lastRender;
        const t0 = performance.now();
        const tick = () => (sc.lastRender !== before ? requestAnimationFrame(() => res(performance.now() - t0)) : requestAnimationFrame(tick));
        (window as any).__t0 = t0; // eslint-disable-line @typescript-eslint/no-explicit-any
        tick();
      }),
  );

async function zoomSteps(page: Page) {
  const times: number[] = [];
  for (const z of [1.5, 2, 3, 2, 1]) {
    const p = nextRender(page);
    await page.evaluate((z) => (window as any).__editorStore.setZoom(z), z); // eslint-disable-line @typescript-eslint/no-explicit-any
    times.push(await p);
  }
  return Math.round(Math.max(...times));
}

async function dragFirstLayer(page: Page) {
  const box = (await page.locator("[data-testid=cover-canvas] canvas.upper-canvas").boundingBox())!;
  const el = (await doc(page)).elements[0];
  const ppi = box.width / (await doc(page)).canvas.widthIn;
  const cx = box.x + (el.x + el.width / 2) * ppi, cy = box.y + (el.y + el.height / 2) * ppi;
  return frames(page, async () => {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy + 60, { steps: 40 });
    await page.mouse.up();
  });
}

async function exportPng(page: Page) {
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Exportar/ });
  const t0 = Date.now();
  const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Descargar PNG" }).click()]);
  const path = (await dl.path())!;
  const ms = Date.now() - t0;
  const png = decodePng(readFileSync(path));
  await dialog.getByRole("button", { name: "Cerrar" }).click();
  return { ms, size: `${png.width}x${png.height}` };
}

const text = (i: number, cols: number) => ({
  id: `t${i}`, type: "text", x: 0.3 + (i % cols) * (5.4 / cols), y: 0.3 + Math.floor(i / cols) * 0.35, width: 5.4 / cols - 0.05, height: 0.3, rotation: 0, zIndex: i, visible: true,
  runs: [{ text: `Línea ${i}`, fontFamily: "Lora", fontSizePt: 14, weight: 500, italic: false, underline: false, uppercase: false, color: "#222222" }],
  align: "left", lineHeight: 1.2, letterSpacing: 0, shadow: { on: i % 5 === 0, intensity: 40 }, outline: { on: false, width: 3, color: "#000000" }, curvature: 0,
});

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

// Foto sintética de 80 Mpx generada en el navegador (JPEG con textura, sin pasar por el proceso de pruebas).
async function injectHugeJpeg(page: Page, side: number, quality: number) {
  return page.evaluate(
    async ([side, quality]) => {
      const c = document.createElement("canvas");
      c.width = c.height = side as number;
      const g = c.getContext("2d")!;
      const grad = g.createLinearGradient(0, 0, side as number, side as number);
      grad.addColorStop(0, "#1b3a5c");
      grad.addColorStop(0.5, "#b0793a");
      grad.addColorStop(1, "#3b1f2b");
      g.fillStyle = grad;
      g.fillRect(0, 0, side as number, side as number);
      // Textura: ruido suave repetido a varias escalas.
      const tile = document.createElement("canvas");
      tile.width = tile.height = 256;
      const tg = tile.getContext("2d")!;
      const img = tg.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = Math.random() * 255; img.data[i + 1] = Math.random() * 255; img.data[i + 2] = Math.random() * 255; img.data[i + 3] = 255;
      }
      tg.putImageData(img, 0, 0);
      g.globalAlpha = 0.08;
      for (let y = 0; y < (side as number); y += 256) for (let x = 0; x < (side as number); x += 256) g.drawImage(tile, x, y);
      const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", quality as number));
      const file = new File([blob], "foto80mpx.jpg", { type: "image/jpeg" });
      const input = document.querySelector<HTMLInputElement>('input[type=file][aria-label="Subir imagen"]')!;
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      c.width = c.height = 1;
      return blob.size;
    },
    [side, quality] as const,
  );
}

test("referencia A: portada 6x9 con foto de fondo de 80 Mpx (8944x8944 JPEG)", async ({ page }) => {
  const r: Record<string, number | string> = { imageMpx: 79.99 };
  await freshEditor(page);
  await page.waitForFunction(() => Boolean((window as any).__coverScene?.lastRender)); // eslint-disable-line @typescript-eslint/no-explicit-any
  r.heapBeforeMb = await cdpHeapMb(page);
  r.rssBeforeMb = rssMb();

  const t0 = Date.now();
  r.imageBytes = await injectHugeJpeg(page, 8944, 0.92);
  r.generateMs = Date.now() - t0;
  const t0b = Date.now();
  await expect.poll(async () => (await doc(page)).canvas.background, { timeout: 120_000 }).toEqual({ assetId: expect.any(String) });
  r.importMs = Date.now() - t0b;
  await expect(page.getByTestId("dpi-warning")).toHaveCount(0); // 8944 px sobre 6 in = 1490 ppp
  await page.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>("[data-testid=cover-canvas] canvas.lower-canvas")!;
    const d = c.getContext("2d")!.getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
    return d[0] !== 255 || d[1] !== 255 || d[2] !== 255;
  }, undefined, { timeout: 60_000 });
  r.importToFirstPaintMs = Date.now() - t0b;
  r.thumbnail = String((await page.evaluate(() => (window as any).__editorStore.getState().assets.map((a: { id: string }) => a.id)) as string[]).some((id) => id.endsWith(".thumb"))); // eslint-disable-line @typescript-eslint/no-explicit-any
  r.heapAfterImportMb = await cdpHeapMb(page);
  r.rssAfterImportMb = rssMb();

  await page.evaluate((e) => (window as any).__editorStore.dispatch({ type: "addElement", element: e }), { ...text(0, 1), x: 1, y: 3, width: 4, height: 0.8 }); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect.poll(async () => (await doc(page)).elements.length).toBe(1);
  const dragA = await dragFirstLayer(page);
  r.dragFrames = JSON.stringify(dragA);
  r.zoomWorstRenderMs = await zoomSteps(page);

  const expA = await exportPng(page); // 1800x2700 desde el original de 80 Mpx
  r.exportPng = JSON.stringify(expA);
  r.heapAfterExportMb = await cdpHeapMb(page);
  r.rssAfterExportMb = rssMb();

  // Carga con el proyecto ya guardado en IndexedDB.
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible({ timeout: 60_000 });
  const t1 = Date.now();
  await page.reload();
  await page.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>("[data-testid=cover-canvas] canvas.lower-canvas");
    if (!c) return false;
    const d = c.getContext("2d")!.getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
    return d[0] !== 255 || d[1] !== 255 || d[2] !== 255;
  }, undefined, { timeout: 60_000 });
  r.reloadToPaintMs = Date.now() - t1;
  r.heapAfterReloadMb = await cdpHeapMb(page);
  r.rssAfterReloadMb = rssMb();
  results.A = r;
  // Presupuestos (holgura amplia sobre lo medido; ver PERFORMANCE.md).
  expect(r.importToFirstPaintMs).toBeLessThan(8000);
  expect(r.reloadToPaintMs).toBeLessThan(5000);
  expect(dragA.p95Ms).toBeLessThan(50);
  expect(dragA.maxMs).toBeLessThan(250);
  expect(r.zoomWorstRenderMs).toBeLessThan(500);
  expect(expA.ms).toBeLessThan(8000);
  expect(expA.size).toBe("1800x2700");
  expect(r.heapAfterExportMb).toBeLessThan(200);
  expect(r.rssAfterReloadMb).toBeLessThan(3000);
});

test("referencia B: portada 6x9 con 300 bloques de texto", async ({ page }) => {
  const r: Record<string, number | string> = { texts: 300 };
  await freshEditor(page);
  await page.waitForFunction(() => Boolean((window as any).__coverScene?.lastRender)); // eslint-disable-line @typescript-eslint/no-explicit-any
  r.heapBeforeMb = await cdpHeapMb(page);
  const p = nextRender(page);
  await page.evaluate((els) => {
    const s = (window as any).__editorStore; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const e of els) s.dispatch({ type: "addElement", element: e });
  }, Array.from({ length: 300 }, (_, i) => text(i, 3)));
  r.addAllToFirstRenderMs = Math.round(await p);
  await expect.poll(async () => (await doc(page)).elements.length).toBe(300);
  // Un render con la cantidad ya montada: cambio de zoom.
  r.zoomWorstRenderMs = await zoomSteps(page);
  const dragB = await dragFirstLayer(page);
  r.dragFrames = JSON.stringify(dragB);
  // Editar un texto (comando + render).
  const p2 = nextRender(page);
  await page.evaluate(() => (window as any).__editorStore.dispatch({ type: "updateElement", id: "t7", props: { x: 1 } })); // eslint-disable-line @typescript-eslint/no-explicit-any
  r.editOneToRenderMs = Math.round(await p2);
  const expB = await exportPng(page);
  r.exportPng = JSON.stringify(expB);
  r.heapAfterMb = await cdpHeapMb(page);
  r.rssAfterMb = rssMb();
  results.B = r;
  expect(r.addAllToFirstRenderMs).toBeLessThan(3000);
  expect(r.zoomWorstRenderMs).toBeLessThan(500);
  expect(dragB.p95Ms).toBeLessThan(50);
  expect(dragB.maxMs).toBeLessThan(250);
  expect(r.editOneToRenderMs).toBeLessThan(500);
  expect(expB.ms).toBeLessThan(5000);
  expect(r.heapAfterMb).toBeLessThan(200);
});

test("referencia C: móvil emulado (390x844, CPU 4x más lenta) con foto de 80 Mpx y 100 textos", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: "http://localhost:5199", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const r: Record<string, number | string> = { cpuThrottle: 4, viewport: "390x844@2x", texts: 100 };
  await freshEditor(page);
  await page.waitForFunction(() => Boolean((window as any).__coverScene?.lastRender)); // eslint-disable-line @typescript-eslint/no-explicit-any
  await openTab(page, true, "canvas");
  const t0 = Date.now();
  r.imageBytes = await injectHugeJpeg(page, 8944, 0.92);
  await expect.poll(async () => (await doc(page)).canvas.background, { timeout: 120_000 }).toEqual({ assetId: expect.any(String) });
  r.generateAndImportMs = Date.now() - t0; // incluye generar la foto en la propia página (también ralentizada)
  await closeSheet(page, true);
  const p = nextRender(page);
  await page.evaluate((els) => {
    const s = (window as any).__editorStore; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const e of els) s.dispatch({ type: "addElement", element: e });
  }, Array.from({ length: 100 }, (_, i) => text(i, 3)));
  r.addAllToRenderMs = Math.round(await p);
  r.zoomWorstRenderMs = await zoomSteps(page);
  const drag = await dragFirstLayer(page);
  r.dragFrames = JSON.stringify(drag);
  const exp = await exportPng(page);
  r.exportPng = JSON.stringify(exp);
  r.heapMb = await cdpHeapMb(page);
  results.C = r;
  await ctx.close();
  expect(r.generateAndImportMs).toBeLessThan(30000);
  expect(drag.p95Ms).toBeLessThan(100);
  expect(r.zoomWorstRenderMs).toBeLessThan(1500);
  expect(exp.ms).toBeLessThan(15000);
});
