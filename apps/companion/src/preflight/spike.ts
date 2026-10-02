/**
 * Prueba técnica de preimpresión (entrega 1).
 * Uso: pnpm spike <entrada.png> <ancho-in> <alto-in> <salida.pdf> [flate|jpeg]
 */
import { readFile } from "node:fs/promises";
import { evaluate, inspectPdf } from "./inspect.js";
import { toolVersions } from "./exec.js";
import { colorPolicy, toCmykPdf, type ImageEncoding } from "./toCmykPdf.js";

const [input, w, h, output, encoding = "flate"] = process.argv.slice(2);
if (!input || !w || !h || !output) {
  console.error("Uso: pnpm spike <entrada.png> <ancho-in> <alto-in> <salida.pdf> [flate|jpeg]");
  process.exit(2);
}
const widthIn = Number(w);
const heightIn = Number(h);

const { ppi } = await toCmykPdf({
  image: await readFile(input),
  widthIn,
  heightIn,
  outputPath: output,
  encoding: encoding as ImageEncoding,
});
const inspection = await inspectPdf(output);
const issues = evaluate(inspection, { widthIn, heightIn });

console.log(JSON.stringify({ tools: await toolVersions(), colorPolicy, inputPpi: ppi, inspection, issues }, null, 2));
process.exit(issues.length === 0 ? 0 : 1);
