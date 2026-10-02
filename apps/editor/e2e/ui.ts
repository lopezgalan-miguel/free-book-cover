import { expect, type Page, type TestInfo } from "@playwright/test";

export type Tab = "text" | "font" | "color" | "style" | "canvas";
export const isMobile = (info: TestInfo) => info.project.name === "mobile";

// Gancho de desarrollo (solo con vite dev): documento actual del almacén.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const doc = (page: Page): Promise<any> => page.evaluate(() => (window as any).__editorStore.getState().history.present);

export async function freshEditor(page: Page) {
  await page.goto("/");
  await page.evaluate(() => indexedDB.databases().then((dbs) => Promise.all(dbs.map((d) => indexedDB.deleteDatabase(d.name!)))));
  await page.reload();
  await expect(page.locator("[data-testid=cover-canvas] canvas.upper-canvas")).toBeVisible();
}

// En móvil abre la hoja de la pestaña; en escritorio los paneles ya están a la vista.
export async function openTab(page: Page, mobile: boolean, tab: Tab) {
  if (!mobile) return;
  await page.getByTestId(`tab-${tab}`).click();
  await expect(page.getByTestId("bottom-sheet")).toBeVisible();
}
export async function closeSheet(page: Page, mobile: boolean) {
  if (!mobile) return;
  await page.getByRole("button", { name: "Hecho" }).click();
  await expect(page.getByTestId("bottom-sheet")).toBeHidden();
}

// Mismas operaciones de edición por la interfaz, en cualquiera de los dos diseños (SDD R-10).
export async function editCoverOps(page: Page, mobile: boolean, background: Buffer) {
  await openTab(page, mobile, "text");
  await page.getByRole("button", { name: "Añadir capa de texto" }).click();
  await page.getByLabel("Contenido del texto").fill("Título de prueba");
  await closeSheet(page, mobile);

  await openTab(page, mobile, "font");
  await page.getByRole("button", { name: "Playfair Display", exact: true }).click();
  await closeSheet(page, mobile);

  await openTab(page, mobile, "color");
  await page.getByRole("button", { name: "Muestra #B4453A" }).click();
  await closeSheet(page, mobile);

  await openTab(page, mobile, "style");
  await page.getByRole("button", { name: "Negrita" }).click();
  await page.getByLabel("Tamaño", { exact: true }).fill("48");
  await page.getByRole("switch", { name: "Sombra" }).click();
  await closeSheet(page, mobile);

  await openTab(page, mobile, "canvas");
  await page.getByLabel("Subir imagen", { exact: true }).setInputFiles({ name: "fondo.png", mimeType: "image/png", buffer: background });
  await expect.poll(async () => (await doc(page)).canvas.background).toEqual({ assetId: expect.any(String) });
  await page.getByRole("button", { name: "Ajustar", exact: true }).first().click();
  await page.getByLabel("Unidad").selectOption("in");
  await page.getByLabel(/^ANCHO/).fill("5.5");
  await page.getByLabel(/^ALTO/).fill("8.5");
  await page.getByRole("button", { name: "Aplicar tamaño" }).click();
  await expect.poll(async () => (await doc(page)).canvas.widthIn).toBe(5.5);
  await closeSheet(page, mobile);
}

// Documento sin identificadores aleatorios, para comparar sesiones distintas.
export function normalizeDoc(d: unknown): unknown {
  let json = JSON.stringify(d);
  const ids = new Set<string>();
  const o = d as { id: string; elements: Array<{ id: string }>; assets: Array<{ id: string }> };
  ids.add(o.id);
  o.elements.forEach((e) => ids.add(e.id));
  o.assets.forEach((a) => ids.add(a.id));
  [...ids].forEach((id, i) => (json = json.split(id).join(`#${i}`)));
  return JSON.parse(json);
}
