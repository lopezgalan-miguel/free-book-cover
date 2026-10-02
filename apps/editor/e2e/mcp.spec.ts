import { expect, test, type Page } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makePng } from "./png";

// Companion real arrancado por playwright.config.ts (puerto 47399, token fijo) y editor real en 5199.
const COMPANION = "http://127.0.0.1:47399";
const COMPANION_DIR = new URL("../../companion", import.meta.url).pathname;
const canvasSel = "[data-testid=cover-canvas] canvas.lower-canvas";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storeState = (page: Page) => page.evaluate(() => { const d = (window as any).__editorStore.getState().history.present; return { revision: d.revision, elements: d.elements.length, background: d.canvas.background, fit: d.canvas.backgroundFit ?? null, id: d.id }; });

let dir: string;
let client: Client | null = null;

test.beforeEach(async ({ page }) => {
  dir = await mkdtemp(join(tmpdir(), "fbc-e2e-mcp-"));
  await page.goto("/");
  await page.evaluate(() => { sessionStorage.clear(); return indexedDB.databases().then((dbs) => Promise.all(dbs.map((d) => indexedDB.deleteDatabase(d.name!)))); });
  await page.reload();
  await expect(page.locator(canvasSel)).toBeVisible();
});
test.afterEach(async () => {
  await client?.close();
  client = null;
  await rm(dir, { recursive: true, force: true });
});

async function startClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath, args: ["--import", "tsx", "src/mcp/main.ts"], cwd: COMPANION_DIR, stderr: "pipe",
    env: { ...(process.env as Record<string, string>), FBC_URL: COMPANION, FBC_TOKEN: "e2e-token", FBC_IMPORT_DIRS: dir },
  });
  const c = new Client({ name: "e2e-mcp", version: "1" });
  await c.connect(transport);
  client = c;
  return c;
}
// Los errores tipificados llegan como JSON en el texto de un resultado isError.
const call = async (c: Client, name: string, args: Record<string, unknown>) => {
  const r = (await c.callTool({ name, arguments: args })) as { isError?: boolean; structuredContent?: any; content: { text: string }[] };
  return r.isError ? { ok: false as const, error: JSON.parse(r.content[0]!.text).error } : { ok: true as const, data: r.structuredContent };
};

async function connectEditor(page: Page, authorize: boolean) {
  await page.getByTestId("mcp-open").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Dirección del companion").fill(COMPANION);
  await dialog.getByLabel("Token del companion").fill("e2e-token");
  await dialog.getByRole("button", { name: "Conectar" }).click();
  await expect(dialog.getByTestId("mcp-panel")).toHaveAttribute("data-link", "connected");
  if (authorize) {
    await dialog.getByRole("button", { name: "Autorizar este proyecto" }).click();
    await expect(dialog.getByTestId("mcp-panel")).toHaveAttribute("data-authorized", "true");
  }
  return dialog;
}

test("sin autorización las herramientas se rechazan y el documento no cambia", async ({ page }) => {
  const c = await startClient();
  const none = await call(c, "get_canvas_state", {});
  expect(none).toEqual({ ok: false, error: { kind: "editor_disconnected", reason: "no_editor" } });
  const dialog = await connectEditor(page, false);
  const before = await storeState(page);
  const denied = await call(c, "add_text_element", { projectId: before.id, expectedRevision: before.revision, text: "no" });
  expect(denied).toEqual({ ok: false, error: { kind: "editor_disconnected", reason: "not_authorized" } });
  expect(await storeState(page)).toEqual(before);
  await expect(dialog.getByTestId("mcp-clients")).toContainText("1");
});

test("un cliente MCP añade texto: aparece en pantalla y se guarda; una revisión obsoleta devuelve conflicto sin mutar", async ({ page }) => {
  const c = await startClient();
  const dialog = await connectEditor(page, true);
  const s0 = await storeState(page);

  const state = await call(c, "get_canvas_state", {});
  expect(state).toMatchObject({ ok: true, data: { projectId: s0.id, revision: s0.revision } });

  const add = await call(c, "add_text_element", { projectId: s0.id, expectedRevision: s0.revision, text: "Hola desde MCP", fontFamily: "Georgia", fontSizePt: 40 });
  expect(add).toMatchObject({ ok: true, data: { revision: s0.revision + 1, saved: true } });
  await dialog.getByRole("button", { name: "Cerrar" }).click();
  await expect(page.getByText("Hola desde MCP").first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Guardado" })).toBeVisible();

  // La revisión antigua: conflicto con la vigente y ninguna mutación.
  const stale = await call(c, "add_text_element", { projectId: s0.id, expectedRevision: s0.revision, text: "Obsoleto" });
  expect(stale).toEqual({ ok: false, error: { kind: "conflict", expectedRevision: s0.revision, actualRevision: s0.revision + 1 } });
  const s1 = await storeState(page);
  expect(s1).toMatchObject({ revision: s0.revision + 1, elements: 1 });
  await expect(page.getByText("Obsoleto")).toHaveCount(0);

  // Persistencia: sin pulsar Guardar, tras recargar el texto sigue ahí (el editor guarda tras cada cambio MCP).
  await page.reload();
  await expect(page.getByText("Hola desde MCP").first()).toBeVisible();
});

test("estilo, importación de recurso y fondo; revocar corta el acceso", async ({ page }) => {
  const c = await startClient();
  const dialog = await connectEditor(page, true);
  const s0 = await storeState(page);
  const add = await call(c, "add_text_element", { projectId: s0.id, expectedRevision: s0.revision, text: "Título" });
  if (!add.ok) throw new Error("add_text_element falló");
  const elementId = add.data.elementId as string;

  const style = await call(c, "update_element_style", { projectId: s0.id, expectedRevision: add.data.revision, elementId, style: { color: "#ff0000", rotation: 5 } });
  expect(style).toMatchObject({ ok: true, data: { element: { id: elementId, rotation: 5, color: "#ff0000" } } });

  await writeFile(join(dir, "fondo.png"), makePng(40, 60, (x, y) => [x * 5, y * 3, 120]));
  const imp = await call(c, "import_asset", { projectId: s0.id, kind: "image", path: join(dir, "fondo.png") });
  expect(imp).toMatchObject({ ok: true, data: { mimeType: "image/png", widthPx: 40, heightPx: 60 } });
  if (!imp.ok) throw new Error("import_asset falló");
  const missing = await call(c, "apply_background", { projectId: s0.id, expectedRevision: imp.data.revision, assetId: "no-existe" });
  expect(missing).toEqual({ ok: false, error: { kind: "not_found", resource: "asset", id: "no-existe" } });
  const bg = await call(c, "apply_background", { projectId: s0.id, expectedRevision: imp.data.revision, assetId: imp.data.assetId, fit: "contain" });
  expect(bg).toMatchObject({ ok: true, data: { fit: "contain", background: { assetId: imp.data.assetId } } });
  expect(await storeState(page)).toMatchObject({ fit: "contain", elements: 1 });
  await expect(dialog.getByTestId("mcp-activity")).toContainText("apply_background · correcto");

  // El cambio remoto es un paso de deshacer como cualquier otro.
  await dialog.getByRole("button", { name: "Cerrar" }).click();
  await page.getByRole("button", { name: "Deshacer" }).click();
  expect(await storeState(page)).toMatchObject({ background: "#ffffff", fit: null });
  await page.getByRole("button", { name: "Rehacer" }).click();
  expect(await storeState(page)).toMatchObject({ fit: "contain" });
  await page.getByTestId("mcp-open").click();

  // Fuera de los directorios permitidos del companion no se importa nada.
  const outside = await call(c, "import_asset", { projectId: s0.id, kind: "image", path: "/etc/hosts" });
  expect(outside).toEqual({ ok: false, error: { kind: "not_found", resource: "file" } });

  await dialog.getByRole("button", { name: "Revocar autorización" }).click();
  const after = await storeState(page);
  const revoked = await call(c, "get_canvas_state", { projectId: s0.id });
  expect(revoked).toEqual({ ok: false, error: { kind: "editor_disconnected", reason: "not_authorized" } });
  expect(await storeState(page)).toEqual(after);
});
