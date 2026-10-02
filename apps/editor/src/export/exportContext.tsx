import { createContext, useContext, type ReactNode } from "react";
import type { CompanionClient, CompanionConfig } from "./companionClient";
import type { ExportDeps } from "./exportImage";
import type { PrintRenderer } from "./printRender";

// Servicios de exportación sustituibles (pruebas): dependencias de rasterizado y descarga.
export interface ExportServices {
  deps?: ExportDeps;
  download?: (blob: Blob, fileName: string) => void;
  // Preimpresión (Paso 7): cliente del companion, renderizador 300 ppp y conexión inicial.
  pdf?: { companion?: CompanionClient; renderer?: PrintRenderer; config?: CompanionConfig };
}

const Ctx = createContext<ExportServices>({});

export function ExportServicesProvider({ value, children }: { value?: ExportServices; children: ReactNode }) {
  return <Ctx.Provider value={value ?? {}}>{children}</Ctx.Provider>;
}

export const useExportServices = (): ExportServices => useContext(Ctx);
