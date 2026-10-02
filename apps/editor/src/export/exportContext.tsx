import { createContext, useContext, type ReactNode } from "react";
import type { ExportDeps } from "./exportImage";

// Servicios de exportación sustituibles (pruebas): dependencias de rasterizado y descarga.
export interface ExportServices {
  deps?: ExportDeps;
  download?: (blob: Blob, fileName: string) => void;
}

const Ctx = createContext<ExportServices>({});

export function ExportServicesProvider({ value, children }: { value?: ExportServices; children: ReactNode }) {
  return <Ctx.Provider value={value ?? {}}>{children}</Ctx.Provider>;
}

export const useExportServices = (): ExportServices => useContext(Ctx);
