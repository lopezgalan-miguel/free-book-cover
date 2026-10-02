import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { delimiter } from "node:path";
import { DEFAULT_MAX_IMPORT_BYTES } from "@free-book-cover/core";
import { createMcpServer } from "./server.js";
import { createRelay } from "./relay.js";

// Proceso MCP por stdio: lo lanza el cliente MCP. stdout es solo del protocolo; los avisos van a stderr.
const token = process.env.FBC_TOKEN;
if (!token) {
  console.error("Falta FBC_TOKEN: el token que imprime el companion al arrancar.");
  process.exit(1);
}
const url = process.env.FBC_URL ?? `http://127.0.0.1:${process.env.FBC_PORT ?? "47321"}`;
const dirs = (process.env.FBC_IMPORT_DIRS ?? "").split(delimiter).filter(Boolean);
const maxBytes = Number(process.env.FBC_MAX_IMPORT_BYTES ?? DEFAULT_MAX_IMPORT_BYTES);
if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
  console.error("FBC_MAX_IMPORT_BYTES no es válido.");
  process.exit(1);
}

const relay = createRelay({ url, token });
const server = createMcpServer({
  relay,
  // Por defecto solo el directorio de trabajo del cliente MCP.
  imports: { allowedDirs: dirs.length ? dirs : [process.cwd()], maxBytes },
});
await server.connect(new StdioServerTransport());
const stop = () => {
  relay.close();
  void server.close().then(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.stdin.on("end", stop);
