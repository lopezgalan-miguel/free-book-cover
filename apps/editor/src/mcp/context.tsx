import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { browserMeasure } from "../canvas/measure";
import { useStore } from "../store/react";
import { createMcpBridge, type McpBridge, type McpSnapshot } from "./bridge";

const Ctx = createContext<McpBridge | null>(null);

// `bridge` permite inyectar uno en las pruebas; por defecto se crea con el store y el medidor del navegador.
export function McpBridgeProvider({ bridge, children }: { bridge?: McpBridge; children: ReactNode }) {
  const store = useStore();
  const own = useMemo(() => bridge ?? createMcpBridge({ store, measure: browserMeasure }), [bridge, store]);
  useEffect(() => (bridge ? undefined : () => own.dispose()), [bridge, own]);
  return <Ctx.Provider value={own}>{children}</Ctx.Provider>;
}

export function useMcpBridge(): McpBridge {
  const b = useContext(Ctx);
  if (!b) throw new Error("useMcpBridge fuera de McpBridgeProvider");
  return b;
}

export function useMcpSnapshot(): McpSnapshot {
  const b = useMcpBridge();
  return useSyncExternalStore(b.subscribe, b.getSnapshot);
}
