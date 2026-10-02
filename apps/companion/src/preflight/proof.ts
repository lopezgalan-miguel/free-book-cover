import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bins, run } from "./exec.js";

export const PROOF_PPI = 100;

/** Prueba visual (R-07): el PDF CMYK final vuelto a rasterizar a sRGB con Ghostscript. */
export async function renderProof(pdfPath: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "fbc-proof-"));
  try {
    const out = join(dir, "proof.png");
    await run(bins.gs, [
      "-dSAFER", "-dBATCH", "-dNOPAUSE", "-dQUIET", "-sDEVICE=png16m", `-r${PROOF_PPI}`,
      "-dTextAlphaBits=4", "-dGraphicsAlphaBits=4", `-sOutputFile=${out}`, pdfPath,
    ]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
