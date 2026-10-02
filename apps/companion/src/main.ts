import { DEFAULT_PORT, startServer } from "./server/server.js";

// Origen del editor: variable de entorno (separados por comas) o el de Vite por defecto.
const origins = (process.env.FBC_ALLOWED_ORIGIN ?? "http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean);
const port = process.env.FBC_PORT ? Number(process.env.FBC_PORT) : DEFAULT_PORT;

const c = await startServer({ allowedOrigins: origins, port, ...(process.env.FBC_TOKEN ? { token: process.env.FBC_TOKEN } : {}) });
console.log(`Companion escuchando en ${c.url}`);
console.log(`Token de esta sesión: ${c.token}`);
console.log(`Orígenes permitidos: ${origins.join(", ")}`);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => void c.close().then(() => process.exit(0)));
