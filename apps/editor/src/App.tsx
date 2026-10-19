import { useEffect } from "react";
import { Header } from "./components/Header";
import { LeftPanel } from "./components/LeftPanel";
import { Stage } from "./components/Stage";
import { RightPanel } from "./components/RightPanel";
import { Notices } from "./components/Notices";
import { StoreProvider, useStore } from "./store/react";
import { useI18n } from "./i18n";
import { FontsProvider, useFontSync } from "./fonts/fontContext";
import { ExportServicesProvider, type ExportServices } from "./export/exportContext";
import type { FontRegistry } from "./fonts/fontRegistry";
import { McpBridgeProvider } from "./mcp/context";
import type { McpBridge } from "./mcp/bridge";
import type { EditorStore } from "./store/editorStore";
import { useLayout } from "./layout/useLayout";
import { MobileLayout } from "./components/mobile/MobileLayout";
import { attachAutosave, attachUnloadGuard } from "./store/lifecycle";

// Layout del mockup: cabecera 56 px, panel izquierdo 264 px, escenario, panel derecho 300 px.
// `fonts`: registro de fuentes inyectable (pruebas); por defecto el del navegador.
export function App({ store, fonts, exportServices, mcpBridge }: { store: EditorStore; fonts?: FontRegistry; exportServices?: ExportServices; mcpBridge?: McpBridge }) {
  useEffect(() => {
    void store.init();
  }, [store]);
  // Autoguardado y aviso al cerrar con cambios sin guardar (R-06).
  useEffect(() => {
    const stops = [attachAutosave(store), attachUnloadGuard(store)];
    return () => stops.forEach((stop) => stop());
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

// El breakpoint solo elige el contenedor; los paneles son los mismos.
function Layout() {
  useFontSync();
  useEscapeDeselects();
  return useLayout() === "mobile" ? <MobileLayout /> : <DesktopLayout />;
}

// Escape fuera de un campo y sin un diálogo abierto quita la selección (el diálogo usa Escape para cerrarse).
function useEscapeDeselects() {
  const store = useStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (store.getState().selectedId !== null) store.select(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [store]);
}

function DesktopLayout() {
  const { t } = useI18n();
  return (
    <>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-bg">
        <Header />
        <Notices />
        <div className="flex min-h-0 flex-1">
          {/* relative: los <input> ocultos (sr-only, absolutos) quedan dentro del panel y no alargan la página. */}
          <aside className="relative w-[264px] flex-none overflow-y-auto border-r border-line bg-panel" aria-label={t("layers")}>
            <LeftPanel />
          </aside>
          <Stage />
          <aside className="relative w-[300px] flex-none overflow-y-auto border-l border-line bg-panel" aria-label={t("style")}>
            <RightPanel />
          </aside>
        </div>
      </div>
    </>
  );
}
