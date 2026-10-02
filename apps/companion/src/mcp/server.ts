import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  MCP_TOOLS, MCP_TOOL_NAMES, toolJsonSchema, type McpToolName, type ToolError, type ToolOutcome,
} from "@free-book-cover/core";
import { COMPANION_VERSION } from "../version.js";
import { readImportFile, type ImportLimits } from "./files.js";

export interface McpServerOptions {
  relay: { call(tool: McpToolName, args: unknown): Promise<ToolOutcome> };
  imports: ImportLimits;
}

const isTool = (n: string): n is McpToolName => (MCP_TOOL_NAMES as readonly string[]).includes(n);

// Un error tipificado viaja como resultado de herramienta (isError) con el JSON {"error": {...}} en el texto.
// No lleva structuredContent: los clientes del SDK lo validarían contra el esquema de salida de éxito.
const errorResult = (error: ToolError): CallToolResult => ({
  isError: true,
  content: [{ type: "text", text: JSON.stringify({ error }) }],
});

// Solo la ruta del campo y el motivo: nunca el valor recibido.
const issuesOf = (e: { issues: readonly { path: PropertyKey[]; message: string }[] }): string[] =>
  e.issues.map((i) => `${i.path.map(String).join(".") || "(raíz)"}: ${i.message}`);

/** Servidor MCP (SDK oficial, esquemas zod -> JSON Schema) cuyas herramientas se ejecutan en el editor autorizado. */
export function createMcpServer(opts: McpServerOptions): Server {
  const server = new Server({ name: "kdp-cover-companion", version: COMPANION_VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: MCP_TOOL_NAMES.map((name) => ({
      name,
      description: MCP_TOOLS[name].description,
      inputSchema: toolJsonSchema(name, "input") as { type: "object" },
      outputSchema: toolJsonSchema(name, "output") as { type: "object" },
      annotations: { readOnlyHint: MCP_TOOLS[name].readOnly, destructiveHint: false, openWorldHint: false },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
    const name = req.params.name;
    if (!isTool(name)) throw new McpError(ErrorCode.InvalidParams, "herramienta desconocida");
    const def = MCP_TOOLS[name];
    const parsed = def.input.safeParse(req.params.arguments ?? {});
    if (!parsed.success) return errorResult({ kind: "invalid_params", issues: issuesOf(parsed.error) });
    let payload: unknown = parsed.data;
    if (name === "import_asset") {
      // El archivo se lee y comprueba aquí (proceso local); al editor solo llegan sus bytes.
      const input = parsed.data as { projectId: string; expectedRevision?: number; kind: "image"; path: string };
      const file = await readImportFile(input.path, opts.imports);
      if (!file.ok) return errorResult(file.error);
      payload = {
        projectId: input.projectId, kind: input.kind, name: file.name, dataBase64: file.bytes.toString("base64"),
        ...(input.expectedRevision !== undefined ? { expectedRevision: input.expectedRevision } : {}),
      };
    }
    const out = await opts.relay.call(name, payload);
    if (!out.ok) return errorResult(out.error);
    const data = def.output.safeParse(out.data);
    if (!data.success) {
      console.error(`respuesta del editor no válida para ${name}`);
      return errorResult({ kind: "internal" });
    }
    return { content: [{ type: "text", text: JSON.stringify(data.data) }], structuredContent: data.data as Record<string, unknown> };
  });
  return server;
}
