import type { EditorStore } from "./editorStore";

// Lo mínimo que necesita cada consumidor del almacén (ISP): depender de menos facilita las pruebas
// y deja claro qué puede tocar cada módulo.
export type ImagePort = Pick<EditorStore, "getState" | "newId" | "reportError" | "addAsset" | "addDerivedBlob" | "dispatch" | "select">;
export type FontPort = Pick<EditorStore, "getState" | "newId" | "reportError" | "addAsset">;
export type AutosavePort = Pick<EditorStore, "subscribe" | "getState" | "hasUnsavedChanges" | "save">;
export type ExecutorPort = ImagePort & Pick<EditorStore, "applyRemote" | "save">;
