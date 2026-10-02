// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createProject } from "@free-book-cover/core";
import { App } from "../src/App";
import { I18nProvider } from "../src/i18n";
import { createEditorStore } from "../src/store/editorStore";
import { StoreProvider } from "../src/store/react";
import { openStorage } from "../src/storage/projectStorage";
import { McpBridgeProvider, useMcpBridge, useMcpSnapshot } from "../src/mcp/context";
import type { SocketLike } from "../src/mcp/bridge";

let n = 0;
async function mount(lang?: "ca") {
  if (lang) localStorage.setItem("kdp.lang", lang);
  let i = 0;
  const store = createEditorStore({ storage: await openStorage(`clo-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  render(<I18nProvider><App store={store} /></I18nProvider>);
  await waitFor(() => expect(store.getState().ready).toBe(true));
  return store;
}
beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("asistente KDP con estado vigente", () => {
  it("deshacer actualiza los campos del formulario al documento", async () => {
    const user = userEvent.setup();
    const store = await mount();
    const pages = screen.getByLabelText("Número de páginas") as HTMLInputElement;
    await user.clear(pages);
    await user.type(pages, "300");
    await user.click(screen.getByRole("button", { name: "Aplicar configuración" }));
    expect(store.getState().history.present.printSetup?.pageCount).toBe(300);
    await user.clear(pages);
    await user.type(pages, "250"); // borrador sin aplicar
    store.undo();
    await waitFor(() => expect((screen.getByLabelText("Número de páginas") as HTMLInputElement).value).toBe("100"));
    store.redo();
    await waitFor(() => expect((screen.getByLabelText("Número de páginas") as HTMLInputElement).value).toBe("300"));
  });

  it("al abrir otro proyecto el formulario toma su configuración", async () => {
    const storage = await openStorage(`clo-swap-${++n}`);
    const saved = createProject({ id: "guardado", mode: "kdp-paperback" });
    await storage.saveProject({ ...saved, printSetup: { trimWidthIn: 5.5, trimHeightIn: 8.5, pageCount: 222, paperAndInk: "bw-cream", readingDirection: "ltr" } });
    let i = 0;
    const store = createEditorStore({ storage, newId: () => `n${++i}`, downloadParts: vi.fn() });
    render(<I18nProvider><App store={store} /></I18nProvider>);
    await waitFor(() => expect(store.getState().history.present.id).toBe("guardado"));
    await waitFor(() => expect((screen.getByLabelText("Número de páginas") as HTMLInputElement).value).toBe("222"));
    expect(screen.getByLabelText("Papel y tinta")).toHaveValue("bw-cream");
  });
});

describe("panel de texto", () => {
  async function withText() {
    const user = userEvent.setup();
    const store = await mount();
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    return { user, store };
  }
  it("el campo hexadecimal admite el # pegado", async () => {
    const { store } = await withText();
    const hex = screen.getByLabelText("Color hexadecimal") as HTMLInputElement;
    expect(hex.maxLength).toBe(7);
    fireEvent.change(hex, { target: { value: "#A98A5F" } });
    expect(store.getState().history.present.elements[0]).toMatchObject({ runs: [{ color: "#a98a5f" }] });
  });
  it("las etiquetas de peso siguen el idioma", async () => {
    await withText();
    expect(screen.getByRole("option", { name: "Negrita 700" })).toBeInTheDocument();
    cleanup();
    await mount("ca");
    await userEvent.setup().click(screen.getByRole("button", { name: "Afegeix capa de text" }));
    expect(screen.getByRole("option", { name: "Negreta 700" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Bold|Regular/ })).not.toBeInTheDocument();
  });
});

describe("contexto MCP bajo StrictMode", () => {
  class Sock implements SocketLike {
    static all: Sock[] = [];
    readyState = 0;
    closed = false;
    onopen: SocketLike["onopen"] = null;
    onmessage: SocketLike["onmessage"] = null;
    onclose: SocketLike["onclose"] = null;
    onerror: SocketLike["onerror"] = null;
    constructor(public url: string) { Sock.all.push(this); }
    send() {}
    close() { this.closed = true; this.readyState = 3; }
  }
  const createSocket = (u: string) => new Sock(u);

  it("el puente que queda vivo sigue suscrito al almacén y revoca al cambiar de proyecto", async () => {
    const storage = await openStorage(`clo-mcp-${++n}`);
    await storage.saveProject(createProject({ id: "guardado" }));
    const store = createEditorStore({ storage, newId: () => "nuevo", downloadParts: vi.fn() });
    let grab: { bridge: ReturnType<typeof useMcpBridge>; link: string; auth: string | null } | null = null;
    function Probe() {
      const bridge = useMcpBridge();
      const s = useMcpSnapshot();
      grab = { bridge, link: s.link, auth: s.authorizedProjectId };
      return null;
    }
    render(<StrictMode><StoreProvider store={store}><McpBridgeProvider createSocket={createSocket}><Probe /></McpBridgeProvider></StoreProvider></StrictMode>);
    await waitFor(() => expect(grab).not.toBeNull());
    const { bridge } = grab!;
    act(() => bridge.connect({ baseUrl: "http://127.0.0.1:47321/", token: "t" }));
    const sock = Sock.all.at(-1)!;
    act(() => {
      sock.readyState = 1;
      sock.onopen?.({});
      sock.onmessage?.({ data: JSON.stringify({ type: "ready", mcpClients: 0 }) });
    });
    act(() => bridge.authorize());
    expect(grab!.auth).toBe("nuevo");
    await act(() => store.init()); // abre el proyecto guardado: cambia el id
    expect(grab!.auth).toBeNull();
  });
});
