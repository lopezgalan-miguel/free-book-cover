import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Binarios externos; se pueden sustituir por variables de entorno. */
export const bins = {
  gs: process.env.FBC_GS_BIN ?? "gs",
  pdfinfo: process.env.FBC_PDFINFO_BIN ?? "pdfinfo",
  pdfimages: process.env.FBC_PDFIMAGES_BIN ?? "pdfimages",
  pdffonts: process.env.FBC_PDFFONTS_BIN ?? "pdffonts",
  qpdf: process.env.FBC_QPDF_BIN ?? "qpdf",
};

/** Tiempo máximo de un binario externo (ms); un gs/qpdf colgado bloquearía la cola única. */
export const DEFAULT_EXEC_TIMEOUT_MS = Number(process.env.FBC_EXEC_TIMEOUT_MS) > 0 ? Number(process.env.FBC_EXEC_TIMEOUT_MS) : 120_000;

export async function run(bin: string, args: string[], opts: { timeoutMs?: number } = {}): Promise<string> {
  const { stdout } = await execFileAsync(bin, args, {
    maxBuffer: 256 * 1024 * 1024,
    timeout: opts.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  return stdout;
}

export async function toolVersions(): Promise<Record<string, string>> {
  const first = (s: string) => s.split("\n")[0]!.trim();
  const versionOf = async (bin: string, flag: string) => {
    // Poppler escribe la versión en stderr.
    const r = await execFileAsync(bin, [flag]).catch((e: { stdout?: string; stderr?: string }) => e);
    return first(`${r.stdout ?? ""}${r.stderr ?? ""}`);
  };
  return {
    ghostscript: await versionOf(bins.gs, "--version"),
    pdfinfo: await versionOf(bins.pdfinfo, "-v"),
    qpdf: await versionOf(bins.qpdf, "--version"),
  };
}
