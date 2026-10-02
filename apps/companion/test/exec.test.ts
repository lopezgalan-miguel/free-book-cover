import { describe, expect, it } from "vitest";
import { DEFAULT_EXEC_TIMEOUT_MS, run } from "../src/preflight/exec.js";

describe("run (binarios externos)", () => {
  it("devuelve la salida estándar de un proceso que termina", async () => {
    expect(await run(process.execPath, ["-e", "process.stdout.write('hola')"])).toBe("hola");
  });
  it("mata un proceso colgado al agotar el tiempo configurado", async () => {
    const t0 = Date.now();
    await expect(run(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { timeoutMs: 200 })).rejects.toMatchObject({ killed: true });
    expect(Date.now() - t0).toBeLessThan(5000);
  });
  it("el tiempo por defecto es de dos minutos", () => {
    expect(DEFAULT_EXEC_TIMEOUT_MS).toBe(120_000);
  });
});
