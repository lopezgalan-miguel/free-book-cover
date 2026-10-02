import { useEffect } from "react";
import { Header } from "./components/Header";
import { LeftPanel } from "./components/LeftPanel";
import { Stage } from "./components/Stage";
import { RightPanel } from "./components/RightPanel";
import { Notices } from "./components/Notices";
import { StoreProvider } from "./store/react";
import { useI18n } from "./i18n";
import type { EditorStore } from "./store/editorStore";

// Layout del mockup: cabecera 56 px, panel izquierdo 264 px, escenario, panel derecho 300 px.
export function App({ store }: { store: EditorStore }) {
  const { t } = useI18n();
  useEffect(() => {
    void store.init();
  }, [store]);

  return (
    <StoreProvider store={store}>
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
    </StoreProvider>
  );
}
