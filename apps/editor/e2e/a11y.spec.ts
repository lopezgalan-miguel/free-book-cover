import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { closeSheet, freshEditor, isMobile, openTab, type Tab } from "./ui";
import { quadrants } from "./png";

// Revisión de accesibilidad con axe sobre el DOM real (nombres, roles, contraste) y comprobaciones de teclado y táctil.
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
// Fabric añade dos canvas sin semántica propia; el lienzo lleva aria-label desde el editor.
const scan = async (page: Page) => (await new AxeBuilder({ page }).withTags(WCAG).exclude("[data-testid=cover-canvas]").analyze()).violations;
const brief = (v: Awaited<ReturnType<typeof scan>>) => v.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);

async function withText(page: Page, mobile: boolean) {
  await openTab(page, mobile, "text");
  await page.getByRole("button", { name: "Añadir capa de texto" }).click();
  await page.getByLabel("Contenido del texto").fill("Texto");
  await closeSheet(page, mobile);
}

test.beforeEach(async ({ page }) => {
  await freshEditor(page);
});

test("axe: sin violaciones en la vista principal y con un texto seleccionado", async ({ page }, info) => {
  const mobile = isMobile(info);
  expect(brief(await scan(page))).toEqual([]);
  await withText(page, mobile);
  expect(brief(await scan(page))).toEqual([]);
});

const TABS: Tab[] = ["text", "font", "color", "style", "canvas"];

test("axe: sin violaciones en cada panel (hoja inferior en móvil, paneles laterales en escritorio)", async ({ page }, info) => {
  const mobile = isMobile(info);
  await withText(page, mobile);
  if (!mobile) {
    expect(brief(await scan(page))).toEqual([]);
    return;
  }
  for (const tab of TABS) {
    await openTab(page, true, tab);
    expect(brief(await scan(page)), `pestaña ${tab}`).toEqual([]);
    await closeSheet(page, true);
  }
});

test("axe: sin violaciones en el diálogo de exportación", async ({ page }) => {
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(brief(await scan(page))).toEqual([]);
});

test("móvil: todos los controles visibles miden al menos 44 × 44 px", async ({ page }, info) => {
  test.skip(!isMobile(info), "solo diseño móvil");
  await withText(page, true);
  const small = async (label: string) =>
    page.evaluate((label) => {
      const sel = 'button, select, textarea, a[href], input:not([type=hidden]):not([type=file]), [role=switch], [role=radio]';
      const out: string[] = [];
      let scanned = 0;
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
        // Fuera de la hoja y del cromo móvil (p. ej. escenario oculto bajo la hoja) no se evalúa.
        if (r.bottom < 0 || r.top > innerHeight) continue;
        // El interruptor de color nativo y los deslizadores se miden por su caja visible.
        scanned++;
        if (r.width < 43.5 || r.height < 43.5) out.push(`${label}: ${el.tagName.toLowerCase()} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return { out, scanned };
    }, label);
  const bar = await small("barra");
  const found: string[] = [...bar.out];
  let scanned = bar.scanned;
  for (const tab of TABS) {
    await openTab(page, true, tab);
    const r = await small(tab);
    found.push(...r.out);
    scanned += r.scanned;
    await closeSheet(page, true);
  }
  expect(scanned).toBeGreaterThan(40); // la prueba mide controles de verdad
  expect(found).toEqual([]);
});

test("móvil: la hoja inferior atrapa el foco, Escape la cierra y el foco vuelve a la pestaña", async ({ page }, info) => {
  test.skip(!isMobile(info), "solo diseño móvil");
  await openTab(page, true, "canvas");
  const inside = () => page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"));
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    expect(await inside()).toBe(true);
  }
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await inside()).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("bottom-sheet")).toBeHidden();
  await expect(page.getByTestId("tab-canvas")).toBeFocused();
});

test("escritorio: el orden de tabulación recorre cabecera, capas y panel derecho", async ({ page }, info) => {
  test.skip(isMobile(info), "solo escritorio");
  const names: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    names.push(await page.evaluate(() => (document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? "").trim()));
  }
  expect(names.every((n) => n.length > 0)).toBe(true);
  expect(names[0]).toBe("ES"); // la cabecera va primero
});

test("axe: sin violaciones con cubierta KDP configurada, imagen de baja resolución y avisos", async ({ page }, info) => {
  const mobile = isMobile(info);
  await openTab(page, mobile, "canvas");
  await page.getByLabel("Subir imagen", { exact: true }).setInputFiles({ name: "f.png", mimeType: "image/png", buffer: quadrants(600, 900) });
  await expect(page.getByTestId("dpi-warning")).toBeVisible();
  const form = page.getByRole("form", { name: "Cubierta KDP" });
  await form.getByLabel("Número de páginas").fill("100");
  await form.getByRole("button", { name: "Aplicar configuración" }).click();
  await expect(page.getByTestId("kdp-summary")).toBeVisible();
  expect(brief(await scan(page))).toEqual([]);
  await closeSheet(page, mobile);
  expect(brief(await scan(page))).toEqual([]);
});
