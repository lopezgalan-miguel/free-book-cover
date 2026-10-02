import { WebSocket } from "ws";

// Cliente de pruebas con cola de mensajes JSON y espera del cierre.
export interface TestWs {
  ws: WebSocket;
  next(timeoutMs?: number): Promise<any>;
  send(msg: unknown): void;
  closed: Promise<number>;
  close(): void;
}

export function openWs(url: string, headers: Record<string, string> = {}): Promise<TestWs> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    const queue: any[] = [];
    const waiters: ((m: any) => void)[] = [];
    ws.on("message", (d) => {
      const m = JSON.parse(d.toString());
      const w = waiters.shift();
      if (w) w(m);
      else queue.push(m);
    });
    const closed = new Promise<number>((res) => ws.on("close", (code) => res(code)));
    ws.once("open", () =>
      resolve({
        ws, closed,
        send: (m) => ws.send(typeof m === "string" ? m : JSON.stringify(m)),
        next: (ms = 2000) => queue.length ? Promise.resolve(queue.shift()) : new Promise((res, rej) => {
          const t = setTimeout(() => rej(new Error("sin mensaje")), ms);
          waiters.push((m) => { clearTimeout(t); res(m); });
        }),
        close: () => ws.close(),
      }),
    );
    // Rechazo en el handshake: se informa el estado HTTP.
    ws.once("unexpected-response", (_req, res) => reject(Object.assign(new Error(`http ${res.statusCode}`), { status: res.statusCode })));
    ws.once("error", (e) => reject(e));
  });
}
