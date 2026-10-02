import { useCallback, useEffect, useMemo, useState } from "react";
import { useExportServices } from "./exportContext";
import {
  createCompanionClient, loadCompanionConfig, saveCompanionConfig,
  type CompanionClient, type CompanionConfig, type CompanionStatus,
} from "./companionClient";

export interface CompanionConnection {
  client: CompanionClient;
  config: CompanionConfig;
  status: CompanionStatus | "checking";
  refresh(cfg?: CompanionConfig): Promise<void>;
  connect(cfg: CompanionConfig): Promise<void>;
}

// Estado de la conexión con el companion: detección por GET /health y token introducido por el usuario.
export function useCompanion(enabled: boolean): CompanionConnection {
  const services = useExportServices();
  const client = useMemo(() => services.pdf?.companion ?? createCompanionClient(), [services.pdf?.companion]);
  const [config, setConfig] = useState<CompanionConfig>(() => services.pdf?.config ?? loadCompanionConfig());
  const [status, setStatus] = useState<CompanionStatus | "checking">("checking");

  const refresh = useCallback(async (cfg?: CompanionConfig) => {
    setStatus("checking");
    setStatus(await client.health(cfg ?? config));
  }, [client, config]);

  const connect = useCallback(async (cfg: CompanionConfig) => {
    setConfig(cfg);
    saveCompanionConfig(cfg);
    await refresh(cfg);
  }, [refresh]);

  useEffect(() => {
    if (enabled) void refresh();
    // Solo al abrir: las comprobaciones posteriores son explícitas (Buscar de nuevo, Conectar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { client, config, status, refresh, connect };
}
