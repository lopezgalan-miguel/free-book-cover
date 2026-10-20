import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { createRelay } from "../src/mcp/relay.js";

let wss: WebSocketServer | null = null;
afterEach(() => wss?.close());

// Companion simulado: acepta el hello y responde cada llamada tras `replyAfterMs` (nunca si es null).
async function fake(replyAfterMs: number | null): Promise<string> {
  wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise((r) => wss!.once("listening", r));
  wss.on("connection", (ws) =>
    ws.on("message", (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === "hello") return ws.send(JSON.stringify({ type: "ready" }));
      if (replyAfterMs !== null) setTimeout(() => ws.send(JSON.stringify({ type: "result", id: m.id, ok: true, data: { tool: m.tool } })), replyAfterMs);
    }),
  );
  return `ws://127.0.0.1:${(wss.address() as { port: number }).port}`;
}

describe("relay: timeout por herramienta", () => {
  it("las llamadas rápidas usan callTimeoutMs", async () => {
    const relay = createRelay({ url: await fake(null), token: "t", callTimeoutMs: 200, pdfCallTimeoutMs: 1500 });
    expect(await relay.call("get_canvas_state", {})).toEqual({ ok: false, error: { kind: "editor_disconnected", reason: "timeout" } });
    relay.close();
  });
  it("export_kdp_pdf espera más que callTimeoutMs", async () => {
    const relay = createRelay({ url: await fake(600), token: "t", callTimeoutMs: 200, pdfCallTimeoutMs: 1500 });
    expect(await relay.call("export_kdp_pdf", {})).toEqual({ ok: true, data: { tool: "export_kdp_pdf" } });
    relay.close();
  });
  it("export_kdp_pdf acaba con timeout propio", async () => {
    const relay = createRelay({ url: await fake(null), token: "t", callTimeoutMs: 100, pdfCallTimeoutMs: 400 });
    const t = Date.now();
    expect(await relay.call("export_kdp_pdf", {})).toEqual({ ok: false, error: { kind: "editor_disconnected", reason: "timeout" } });
    expect(Date.now() - t).toBeGreaterThanOrEqual(350);
    relay.close();
  });
});
