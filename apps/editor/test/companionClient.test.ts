import { describe, expect, it, vi } from "vitest";
import { CompanionError, createCompanionClient, loadCompanionConfig, saveCompanionConfig } from "../src/export/companionClient";

const cfg = { baseUrl: "http://127.0.0.1:47321/", token: "tok" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("cliente del companion", () => {
  it("health: conectado, necesita token, o sin conexión", async () => {
    const f = vi.fn(async () => json({ ok: true, authorized: true }));
    expect(await createCompanionClient(f).health(cfg)).toBe("connected");
    expect(f).toHaveBeenCalledWith("http://127.0.0.1:47321/health", { headers: { authorization: "Bearer tok" } });
    expect(await createCompanionClient(async () => json({ ok: true, authorized: false })).health(cfg)).toBe("needs_token");
    expect(await createCompanionClient(async () => { throw new TypeError("fetch failed"); }).health(cfg)).toBe("offline");
    expect(await createCompanionClient(async () => json({ error: "x" }, 403)).health(cfg)).toBe("offline");
  });
  it("health sin token no envía cabecera de autorización", async () => {
    const f = vi.fn(async () => json({ ok: true, authorized: false }));
    await createCompanionClient(f).health({ ...cfg, token: "" });
    expect(f).toHaveBeenCalledWith(expect.any(String), { headers: {} });
  });
  it("preflight envía el PNG con token y el tamaño físico en la consulta", async () => {
    const f = vi.fn(async () => json({ id: "a", report: { ok: true, checks: [], measured: {} }, proofPng: null }));
    const png = new Blob(["png"], { type: "image/png" });
    const r = await createCompanionClient(f).preflight(cfg, png, 12.4752, 9.25);
    expect(r.id).toBe("a");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:47321/preflight?widthIn=12.4752&heightIn=9.25");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(png);
    expect(init.headers).toMatchObject({ authorization: "Bearer tok", "content-type": "image/png" });
  });
  it("errores: sin conexión, token rechazado y fallo del servidor", async () => {
    const png = new Blob(["x"]);
    await expect(createCompanionClient(async () => { throw new TypeError("x"); }).preflight(cfg, png, 1, 1)).rejects.toMatchObject({ kind: "offline" });
    await expect(createCompanionClient(async () => json({}, 401)).preflight(cfg, png, 1, 1)).rejects.toMatchObject({ kind: "unauthorized" });
    await expect(createCompanionClient(async () => json({}, 500)).downloadPdf(cfg, "id")).rejects.toBeInstanceOf(CompanionError);
  });
  it("descarga el PDF por id con token", async () => {
    const f = vi.fn(async () => new Response("%PDF-1.3", { status: 200 }));
    const b = await createCompanionClient(f).downloadPdf(cfg, "a b");
    expect(await b.text()).toBe("%PDF-1.3");
    expect((f.mock.calls[0] as unknown as string[])[0]).toBe("http://127.0.0.1:47321/preflight/a%20b/pdf");
  });
  it("la conexión se recuerda en la sesión y los valores corruptos se ignoran", () => {
    const m = new Map<string, string>();
    const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(loadCompanionConfig(storage)).toEqual({ baseUrl: "http://127.0.0.1:47321", token: "" });
    saveCompanionConfig(cfg, storage);
    expect(loadCompanionConfig(storage)).toEqual(cfg);
    m.set("kdp.companion", "{no json");
    expect(loadCompanionConfig(storage).token).toBe("");
  });
});
