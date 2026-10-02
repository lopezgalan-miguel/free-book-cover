import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PreflightResult } from "../src/preflight/pipeline.js";
import { startServer, type CompanionServer } from "../src/server/server.js";
import { inputFailureReport } from "../src/preflight/report.js";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";

const ORIGIN = "http://localhost:5199";
let dir: string;
let s: CompanionServer;
const calls: { size: number; widthIn: number; heightIn: number }[] = [];
const disposed: string[] = [];

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "fbc-srv-"));
  s = await startServer({
    token: "secreto", allowedOrigins: [ORIGIN], port: 0,
    preflight: vi.fn(async ({ image, widthIn, heightIn }): Promise<PreflightResult> => {
      calls.push({ size: image.length, widthIn, heightIn });
      if (image.toString() === "mal") return { report: inputFailureReport({ widthIn, heightIn }, "x"), pdfPath: null, proof: null, dispose: async () => void disposed.push("fail") };
      const p = join(dir, `${calls.length}.pdf`);
      await writeFile(p, "%PDF-fake");
      return {
        report: { ok: true, checks: [], measured: { pageSizePt: null, expectedSizePt: { width: 1, height: 1 }, minPpi: 300, bytes: 9, maxInkPercent: 1, encoding: "flate" } },
        pdfPath: p, proof: Buffer.from("PNG"), dispose: async () => void disposed.push(p),
      };
    }),
  });
});
afterAll(() => s.close());

const f = (path: string, init: RequestInit = {}, origin: string | null = ORIGIN, token: string | null = "secreto") =>
  fetch(s.url + path, { ...init, headers: { ...(origin ? { origin } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers as object) } });

describe("servidor local del companion", () => {
  it("escucha solo en 127.0.0.1", () => {
    expect((s.server.address() as { address: string }).address).toBe("127.0.0.1");
  });
  it("/health responde sin token y dice si el token enviado es válido", async () => {
    const anon = await (await f("/health", {}, ORIGIN, null)).json();
    expect(anon).toMatchObject({ ok: true, authorized: false });
    expect(await (await f("/health")).json()).toMatchObject({ ok: true, authorized: true });
    expect(await (await f("/health", {}, ORIGIN, "otro")).json()).toMatchObject({ authorized: false });
  });
  it("CORS: refleja solo el origen del editor y atiende el preflight", async () => {
    const r = await f("/health");
    expect(r.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const o = await f("/preflight", { method: "OPTIONS" }, ORIGIN, null);
    expect(o.status).toBe(204);
    expect(o.headers.get("access-control-allow-headers")).toContain("authorization");
    expect(o.headers.get("access-control-allow-private-network")).toBe("true");
  });
  it("rechaza orígenes no autorizados, también en /health", async () => {
    const r = await f("/health", {}, "http://evil.example");
    expect(r.status).toBe(403);
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("rechaza un Host que no es local (DNS rebinding)", async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port: s.port, path: "/health", headers: { host: "evil.example" } }, (res) => { res.resume(); resolve(res.statusCode!); });
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(403);
  });
  it("/preflight exige token", async () => {
    expect((await f("/preflight?widthIn=1&heightIn=1", { method: "POST", body: "x" }, ORIGIN, null)).status).toBe(401);
    expect((await f("/preflight?widthIn=1&heightIn=1", { method: "POST", body: "x" }, ORIGIN, "malo")).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
  it("valida tamaño y cuerpo", async () => {
    expect((await f("/preflight?widthIn=abc&heightIn=1", { method: "POST", body: "x" })).status).toBe(400);
    expect((await f("/preflight?widthIn=1", { method: "POST", body: "x" })).status).toBe(400);
    expect((await f("/preflight?widthIn=1&heightIn=1", { method: "POST" })).status).toBe(400);
  });
  it("procesa el PNG, devuelve informe y prueba, y entrega el PDF con token", async () => {
    const r = await f("/preflight?widthIn=12.4752&heightIn=9.25", { method: "POST", body: "datos-png", headers: { "content-type": "image/png" } });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.report.ok).toBe(true);
    expect(Buffer.from(j.proofPng, "base64").toString()).toBe("PNG");
    expect(calls.at(-1)).toEqual({ size: 9, widthIn: 12.4752, heightIn: 9.25 });
    const pdf = await f(`/preflight/${j.id}/pdf`);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(await pdf.text()).toBe("%PDF-fake");
    expect((await f(`/preflight/${j.id}/pdf`, {}, ORIGIN, null)).status).toBe(401);
    expect((await f(`/preflight/no-existe/pdf`)).status).toBe(404);
  });
  it("entrada rechazada: informe sin PDF (id nulo)", async () => {
    const j = await (await f("/preflight?widthIn=2&heightIn=2", { method: "POST", body: "mal" })).json();
    expect(j.id).toBeNull();
    expect(j.report.ok).toBe(false);
    expect(disposed).toContain("fail");
  });
  it("el 500 no filtra rutas ni comandos y conserva las cabeceras CORS", async () => {
    const boom = await startServer({
      token: "t", allowedOrigins: [ORIGIN], port: 0,
      preflight: async () => { throw new Error("Command failed: gs /tmp/fbc-job-x/rgb.pdf"); },
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await fetch(`${boom.url}/preflight?widthIn=2&heightIn=2`, { method: "POST", body: "x", headers: { origin: ORIGIN, authorization: "Bearer t" } });
      const text = await r.text();
      expect(r.status).toBe(500);
      expect(JSON.parse(text)).toEqual({ error: "preflight_failed" });
      expect(text).not.toMatch(/tmp|fbc-job|Command failed|gs /);
      expect(r.headers.get("access-control-allow-origin")).toBe(ORIGIN);
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
      await boom.close();
    }
  });
  it("413 anticipado por Content-Length sin llamar al pipeline", async () => {
    const calls0 = calls.length;
    const small = await startServer({ token: "t", allowedOrigins: [ORIGIN], port: 0, maxBodyBytes: 10, preflight: async () => { throw new Error("no debe llamarse"); } });
    try {
      const r = await fetch(`${small.url}/preflight?widthIn=2&heightIn=2`, { method: "POST", body: "x".repeat(50), headers: { origin: ORIGIN, authorization: "Bearer t" } });
      expect(r.status).toBe(413);
      expect(r.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    } finally {
      await small.close();
    }
    expect(calls.length).toBe(calls0);
  });
  it("conserva solo los últimos resultados y borra los antiguos", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await (await f("/preflight?widthIn=2&heightIn=2", { method: "POST", body: `p${i}` })).json()).id);
    expect((await f(`/preflight/${ids[0]}/pdf`)).status).toBe(404);
    expect((await f(`/preflight/${ids[2]}/pdf`)).status).toBe(200);
  });
});
