import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { browserMeasure } from "../canvas/measure";
import { useExportServices } from "../export/exportContext";
import { createCompanionClient, loadCompanionConfig } from "../export/companionClient";
import { browserExportDeps } from "../export/exportImage";
import { browserPrintRenderer } from "../export/printRender";
import { useFonts } from "../fonts/fontContext";
import { useStore } from "../store/react";
import { createMcpBridge, type McpBridge, type McpBridgeDeps, type McpSnapshot } from "./bridge";

const Ctx = createContext<McpBridge | null>(null);

// `bridge` permite inyectar uno en las pruebas; por defecto se crea con el store, el medidor del navegador,
// el registro de fuentes (import_font) y las dependencias de exportación (export_image).
// Con StrictMode el montaje simulado llama a dispose(); el segundo efecto lo vuelve a suscribir (attach).
export function McpBridgeProvider({ bridge, createSocket, children }: { bridge?: McpBridge; createSocket?: McpBridgeDeps["createSocket"]; children: ReactNode }) {
  const store = useStore();
  const fonts = useFonts();
  // Solo los campos deps y pdf: el objeto de servicios puede ser nuevo en cada render y recrearía el puente (y su conexión).
  const overrideDeps = useExportServices().deps;
  const overridePdf = useExportServices().pdf;
  const own = useMemo(
    () => bridge ?? createMcpBridge({
      store, measure: browserMeasure, fonts,
      exportDeps: () => overrideDeps ?? browserExportDeps(fonts, () => store.getState().assets),
      pdfDeps: () => {
        const getAssets = () => store.getState().assets;
        return {
          fonts, missingAssets: browserExportDeps(fonts, getAssets).missingAssets,
          renderer: overridePdf?.renderer ?? browserPrintRenderer(fonts, getAssets),
          companion: overridePdf?.companion ?? createCompanionClient(), config: overridePdf?.config ?? loadCompanionConfig(),
        };
      },
      ...(createSocket ? { createSocket } : {}),
    }),
    [bridge, store, createSocket, fonts, overrideDeps, overridePdf],
  );
  useEffect(() => {
    if (bridge) return;
    own.attach();
    return () => own.dispose();
  }, [bridge, own]);
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
