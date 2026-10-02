import { useEffect } from "react";
import { Header } from "./components/Header";
import { LeftPanel } from "./components/LeftPanel";
import { Stage } from "./components/Stage";
import { RightPanel } from "./components/RightPanel";
import { Notices } from "./components/Notices";
import { StoreProvider } from "./store/react";
import { useI18n } from "./i18n";
import { FontsProvider, useFontSync } from "./fonts/fontContext";
import { ExportServicesProvider, type ExportServices } from "./export/exportContext";
import type { FontRegistry } from "./fonts/fontRegistry";
import { McpBridgeProvider } from "./mcp/context";
import type { McpBridge } from "./mcp/bridge";
import type { EditorStore } from "./store/editorStore";

// Layout del mockup: cabecera 56 px, panel izquierdo 264 px, escenario, panel derecho 300 px.
// `fonts`: registro de fuentes inyectable (pruebas); por defecto el del navegador.
export function App({ store, fonts, exportServices, mcpBridge }: { store: EditorStore; fonts?: FontRegistry; exportServices?: ExportServices; mcpBridge?: McpBridge }) {
  useEffect(() => {
    void store.init();
  }, [store]);

  return (
    <StoreProvider store={store}>
      <FontsProvider {...(fonts ? { registry: fonts } : {})}>
        <ExportServicesProvider {...(exportServices ? { value: exportServices } : {})}>
          <McpBridgeProvider {...(mcpBridge ? { bridge: mcpBridge } : {})}>
            <Layout />
          </McpBridgeProvider>
        </ExportServicesProvider>
      </FontsProvider>
    </StoreProvider>
  );
}

function Layout() {
  const { t } = useI18n();
  useFontSync();
  return (
    <>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-bg">
        <Header />
        <Notices />
        <div className="flex min-h-0 flex-1">
          <aside className="w-[264px] flex-none overflow-y-auto border-r border-line bg-panel" aria-label={t("layers")}>
            <LeftPanel />
          </aside>
          <Stage />
          <aside className="w-[300px] flex-none overflow-y-auto border-l border-line bg-panel" aria-label={t("style")}>
            <RightPanel />
          </aside>
        </div>
      </div>
    </>
  );
}
