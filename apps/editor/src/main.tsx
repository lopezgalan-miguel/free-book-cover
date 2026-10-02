import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { I18nProvider } from "./i18n";
import { openStorage } from "./storage/projectStorage";
import { downloadParts } from "./storage/backup";
import { createEditorStore } from "./store/editorStore";

const store = createEditorStore({
  storage: await openStorage(),
  newId: () => crypto.randomUUID(),
  downloadParts,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <App store={store} />
    </I18nProvider>
  </StrictMode>,
);
