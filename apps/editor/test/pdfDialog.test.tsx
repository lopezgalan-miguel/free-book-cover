// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CompanionReport } from "@free-book-cover/core";
import { App } from "../src/App";
import type { CompanionClient, CompanionStatus } from "../src/export/companionClient";
import type { ExportServices } from "../src/export/exportContext";
import { FontRegistry } from "../src/fonts/fontRegistry";
import { I18nProvider } from "../src/i18n";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

let n = 0;
const okReport = (over: Partial<CompanionReport> = {}): CompanionReport => ({
  ok: true, checks: [{ id: "cmyk", status: "pass" }, { id: "ink", status: "warn", params: { percent: 310, limit: 300 } }],
  measured: { pageSizePt: null, expectedSizePt: { width: 1, height: 1 }, minPpi: 300, bytes: 100, maxInkPercent: 310, encoding: "flate" }, ...over,
});
function client(status: CompanionStatus, report = okReport()): CompanionClient & { preflight: ReturnType<typeof vi.fn>; health: ReturnType<typeof vi.fn> } {
  return {
    health: vi.fn(async () => status),
    preflight: vi.fn(async () => ({ id: "r1", report, proofPng: "iVBORw0KGgo=" })),
    downloadPdf: vi.fn(async () => new Blob(["%PDF"], { type: "application/pdf" })),
  } as never;
}
async function mount(c: CompanionClient, kdp = true) {
  let i = 0;
  const store = createEditorStore({ storage: await openStorage(`pdf-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  const download = vi.fn();
  const services: ExportServices = {
    download,
    pdf: { companion: c, config: { baseUrl: "http://127.0.0.1:47321", token: "t" }, renderer: { render: vi.fn(async (_d, _s, on) => (on("paint"), { blob: new Blob(["png"]), via: "worker" as const })) } },
  };
  render(<I18nProvider><App store={store} fonts={new FontRegistry({ addFace: async () => undefined, loadCatalog: async () => true })} exportServices={services} /></I18nProvider>);
  await waitFor(() => expect(store.getState().ready).toBe(true));
  if (kdp) act(() => void store.dispatch({ type: "setPrintSetup", printSetup: { trimWidthIn: 6, trimHeightIn: 9, pageCount: 100, paperAndInk: "color-standard", readingDirection: "ltr" } }));
  return { store, download, services };
}
beforeEach(() => localStorage.clear());
afterEach(cleanup);

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: /^Exportar$/ }));
  return screen.getByRole("dialog");
};
const enabledPdf = (dialog: HTMLElement) => waitFor(() => {
  const r = within(dialog).getByRole("radio", { name: /PDF/ });
  expect(r).toBeEnabled();
  return r;
});

describe("opción PDF del modal de exportación", () => {
  it("sin companion: PDF deshabilitado con explicación y formulario de conexión", async () => {
    const user = userEvent.setup();
    await mount(client("offline"));
    const dialog = await open(user);
    await waitFor(() => expect(within(dialog).getByTestId("companion-status")).toHaveAttribute("data-status", "offline"));
    expect(within(dialog).getByRole("radio", { name: /PDF/ })).toBeDisabled();
    expect(within(dialog).getByTestId("pdf-disabled-reason")).toHaveTextContent("necesita el companion conectado");
    expect(within(dialog).getByText(/No se detecta el companion/)).toBeInTheDocument();
  });
  it("proyecto no KDP: no aparece la opción PDF", async () => {
    const user = userEvent.setup();
    await mount(client("connected"), false);
    const dialog = await open(user);
    expect(within(dialog).queryByRole("radio", { name: /PDF/ })).toBeNull();
  });
  it("companion detectado sin token: se conecta introduciéndolo y se habilita", async () => {
    const user = userEvent.setup();
    const c = client("needs_token");
    await mount(c);
    const dialog = await open(user);
    await waitFor(() => expect(within(dialog).getByTestId("companion-status")).toHaveAttribute("data-status", "needs_token"));
    c.health.mockResolvedValue("connected");
    const tok = within(dialog).getByLabelText("Token del companion");
    await user.clear(tok);
    await user.type(tok, "abc");
    await user.click(within(dialog).getByRole("button", { name: "Conectar" }));
    await enabledPdf(dialog);
    expect(c.health).toHaveBeenLastCalledWith(expect.objectContaining({ token: "abc" }));
  });
  it("conectado: genera, muestra «Listo para KDP» con avisos y descarga el PDF y el informe", async () => {
    const user = userEvent.setup();
    const { download } = await mount(client("connected"));
    const dialog = await open(user);
    await user.click(await enabledPdf(dialog));
    expect(within(dialog).getByTestId("export-size")).toHaveTextContent("3743×2775 px");
    await user.click(within(dialog).getByRole("button", { name: "Generar PDF" }));
    const report = await within(dialog).findByTestId("pdf-report");
    expect(report).toHaveAttribute("data-state", "ready");
    expect(within(dialog).getByTestId("pdf-state")).toHaveTextContent("Listo para KDP");
    expect(within(dialog).getByTestId("check-ink")).toHaveAttribute("data-status", "warn");
    expect(within(dialog).getByTestId("pdf-proof")).toHaveAttribute("src", expect.stringContaining("data:image/png;base64"));
    await user.click(within(dialog).getByTestId("pdf-download"));
    expect(download).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/-kdp-3743x2775\.pdf$/));
    await user.click(within(dialog).getByTestId("pdf-download-report"));
    expect(download).toHaveBeenLastCalledWith(expect.any(Blob), expect.stringMatching(/-informe-preimpresion\.txt$/));
  });
  it("con un fallo: «NO validado» y la descarga se ofrece como prueba", async () => {
    const user = userEvent.setup();
    const { download } = await mount(client("connected", okReport({ ok: false, checks: [{ id: "cmyk", status: "fail", params: { space: "rgb" } }] })));
    const dialog = await open(user);
    await user.click(await enabledPdf(dialog));
    await user.click(within(dialog).getByRole("button", { name: "Generar PDF" }));
    await within(dialog).findByTestId("pdf-report");
    expect(within(dialog).getByTestId("pdf-report")).toHaveAttribute("data-state", "not_validated");
    expect(within(dialog).getByTestId("pdf-state")).toHaveTextContent("NO validado");
    expect(within(dialog).queryByText("Listo para KDP")).toBeNull();
    const btn = within(dialog).getByTestId("pdf-download");
    expect(btn).toHaveTextContent("Descargar prueba (NO validada)");
    await user.click(btn);
    expect(download).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/-PRUEBA-NO-VALIDADA\.pdf$/));
  });
});
