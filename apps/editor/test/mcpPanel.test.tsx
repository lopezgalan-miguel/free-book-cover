// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";
import { FontRegistry } from "../src/fonts/fontRegistry";
import { I18nProvider } from "../src/i18n";
import { createMcpBridge, type SocketLike } from "../src/mcp/bridge";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: any[] = [];
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.({}); }
  receive(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

let n = 0;
let socket: FakeSocket;
async function mount() {
  let i = 0;
  const store = createEditorStore({ storage: await openStorage(`mcp-ui-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  const bridge = createMcpBridge({ store, measure: () => null, makeThumbnail: async () => null, createSocket: () => (socket = new FakeSocket()) });
  render(<I18nProvider><App store={store} mcpBridge={bridge} fonts={new FontRegistry({ addFace: async () => undefined, loadCatalog: async () => true })} /></I18nProvider>);
  await waitFor(() => expect(store.getState().ready).toBe(true));
  return { store, bridge };
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(cleanup);

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByTestId("mcp-open"));
  return screen.getByRole("dialog");
};
async function connect(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.clear(within(dialog).getByLabelText("Token del companion"));
  await user.type(within(dialog).getByLabelText("Token del companion"), "tok");
  await user.click(within(dialog).getByRole("button", { name: "Conectar" }));
  act(() => { socket.open(); socket.receive({ type: "ready", mcpClients: 1 }); });
}

describe("diálogo de conexión MCP", () => {
  it("empieza sin conexión ni autorización", async () => {
    const user = userEvent.setup();
    await mount();
    expect(screen.getByTestId("mcp-open")).toHaveAttribute("data-mcp", "off");
    const d = await openDialog(user);
    expect(within(d).getByTestId("mcp-status")).toHaveTextContent("Sin conexión con el companion.");
    expect(within(d).queryByRole("button", { name: /Autorizar/ })).toBeNull();
  });
  it("conectar no autoriza; el usuario autoriza y revoca explícitamente el proyecto", async () => {
    const user = userEvent.setup();
    const { bridge } = await mount();
    const d = await openDialog(user);
    await connect(user, d);
    expect(socket.sent[0]).toEqual({ type: "hello", token: "tok" });
    expect(within(d).getByTestId("mcp-status")).toHaveTextContent("Ningún proyecto autorizado");
    expect(within(d).getByTestId("mcp-clients")).toHaveTextContent("Clientes MCP conectados: 1");
    expect(bridge.getSnapshot().authorizedProjectId).toBeNull();

    await user.click(within(d).getByRole("button", { name: "Autorizar este proyecto" }));
    expect(socket.sent.at(-1)).toMatchObject({ type: "authorize", projectId: "id1" });
    expect(within(d).getByTestId("mcp-status")).toHaveTextContent("Proyecto autorizado");
    expect(screen.getByTestId("mcp-open")).toHaveAttribute("data-mcp", "authorized");

    await user.click(within(d).getByRole("button", { name: "Revocar autorización" }));
    expect(socket.sent.at(-1)).toEqual({ type: "revoke" });
    expect(screen.getByTestId("mcp-open")).toHaveAttribute("data-mcp", "connected");
  });
  it("muestra la actividad de las herramientas ejecutadas", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    const d = await openDialog(user);
    await connect(user, d);
    await user.click(within(d).getByRole("button", { name: "Autorizar este proyecto" }));
    act(() => socket.receive({ type: "call", id: "1", tool: "add_text_element", args: { projectId: "id1", expectedRevision: 0, text: "Desde MCP" } }));
    await waitFor(() => expect(within(d).getByTestId("mcp-activity")).toHaveTextContent("add_text_element · correcto"));
    expect(store.getState().history.present.elements).toHaveLength(1);
  });
  it("un token rechazado se explica", async () => {
    const user = userEvent.setup();
    await mount();
    const d = await openDialog(user);
    await connect(user, d);
    // Se simula el cierre 4401 del companion.
    act(() => { socket.readyState = 3; socket.onclose?.({ code: 4401 }); });
    expect(within(d).getByTestId("mcp-status")).toHaveTextContent("El companion rechazó el token.");
  });
  it("Escape cierra el diálogo", async () => {
    const user = userEvent.setup();
    await mount();
    await openDialog(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("está traducido al catalán", async () => {
    localStorage.setItem("kdp.lang", "ca");
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByTestId("mcp-open"));
    const d = screen.getByRole("dialog");
    expect(within(d).getByRole("heading", { name: "Connexió MCP" })).toBeInTheDocument();
    expect(within(d).getByTestId("mcp-status")).toHaveTextContent("Sense connexió amb el companion.");
  });
});
