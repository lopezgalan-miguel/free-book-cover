import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { I18nProvider } from "./i18n";
import { openStorageOrFallback } from "./storage/projectStorage";
import { downloadParts } from "./storage/backup";
import { createEditorStore } from "./store/editorStore";

const { storage, available } = await openStorageOrFallback();
const store = createEditorStore({
  storage,
  storageAvailable: available,
  newId: () => crypto.randomUUID(),
  downloadParts,
});

// Gancho solo para pruebas e2e con el servidor de desarrollo.
if (import.meta.env.DEV) {
  (window as unknown as { __editorStore: typeof store }).__editorStore = store;
  // Herramientas de render para las pruebas e2e (vista previa frente a exportación).
  void Promise.all([import("@free-book-cover/core"), import("./canvas/paint"), import("./canvas/measure")]).then(([core, paint, measure]) => {
    (window as unknown as { __coverTools: unknown }).__coverTools = { renderDocument: core.renderDocument, paintDocument: paint.paintDocument, measure: measure.browserMeasure() };
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <App store={store} />
    </I18nProvider>
  </StrictMode>,
);
