import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bins, run } from "./exec.js";

/** Resolución de la lectura de tinta: suficiente para la zona máxima sin cargar 300 ppp completos. */
export const INK_SAMPLE_PPI = 150;

/** Suma máxima C+M+Y+K (en %) de un PAM CMYK de 8 bits (cabecera P7 + píxeles). */
export function maxInkOfPam(pam: Buffer): number {
  const end = pam.indexOf("ENDHDR\n");
  if (end < 0) throw new Error("PAM sin cabecera");
  const header = pam.subarray(0, end).toString("ascii");
  const depth = Number(header.match(/DEPTH (\d+)/)?.[1]);
  if (depth !== 4) throw new Error(`PAM de ${depth} canales (se esperan 4)`);
  let max = 0;
  for (let i = end + 7; i + 3 < pam.length; i += 4) {
    const s = pam[i]! + pam[i + 1]! + pam[i + 2]! + pam[i + 3]!;
    if (s > max) max = s;
  }
  return (max / 255) * 100;
}

/** Mide la tinta total máxima del PDF renderizándolo a CMYK con Ghostscript. */
export async function measureMaxInk(pdfPath: string): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), "fbc-ink-"));
  try {
    const out = join(dir, "ink.pam");
    await run(bins.gs, [
      "-dSAFER", "-dBATCH", "-dNOPAUSE", "-dQUIET", "-sDEVICE=pamcmyk32", `-r${INK_SAMPLE_PPI}`, `-sOutputFile=${out}`, pdfPath,
    ]);
    return maxInkOfPam(await readFile(out));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
