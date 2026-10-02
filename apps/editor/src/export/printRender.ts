import { catalogGroup, usedFamilies, type Project } from "@free-book-cover/core";
import type { StoredAsset } from "../storage/projectStorage";
import type { FontRegistry } from "../fonts/fontRegistry";
import { browserExportDeps } from "./exportImage";
import { usedImageAssets } from "./usedAssets";
import type { WorkerMessage, WorkerRequest } from "./printRender.worker";

export type RenderStage = "fonts" | "images" | "paint" | "encode";
export type RenderVia = "worker" | "main";

export interface PrintRenderResult {
  blob: Blob;
  via: RenderVia;
}

export interface PrintRenderer {
  render(doc: Project, size: { widthPx: number; heightPx: number }, onStage: (s: RenderStage) => void): Promise<PrintRenderResult>;
}

// Las fuentes del catálogo (Google Fonts) se cargan con CSS en el documento y un Worker no las ve: ni el texto
// saldría igual que la vista ni habría forma de fiarse de la sustitución. En ese caso se pinta en el hilo principal
// con el mismo camino que la exportación de imagen (igualdad por construcción). Las del sistema, las genéricas y
// las subidas por el usuario (que se transfieren al Worker) sí se pintan en el Worker.
export function workerEligible(doc: Project): boolean {
  for (const family of usedFamilies(doc).keys()) {
    const g = catalogGroup(family);
    if (g !== null && g !== "system") return false;
  }
  return true;
}

const workerSupported = () => typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export function browserPrintRenderer(fonts: FontRegistry, getAssets: () => StoredAsset[], mode: "auto" | "main" | "worker" = "auto"): PrintRenderer {
  const viaMain = async (doc: Project, size: { widthPx: number; heightPx: number }, onStage: (s: RenderStage) => void): Promise<PrintRenderResult> => {
    onStage("paint");
    await tick();
    const deps = browserExportDeps(fonts, getAssets);
    const canvas = (await deps.render(doc, size)) as HTMLCanvasElement;
    onStage("encode");
    await tick();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) throw new Error("encode_failed");
    return { blob, via: "main" };
  };
  const viaWorker = (doc: Project, size: { widthPx: number; heightPx: number }, onStage: (s: RenderStage) => void): Promise<PrintRenderResult> => {
    const stored = getAssets();
    const images = usedImageAssets(doc).flatMap((id) => {
      const blob = stored.find((a) => a.id === id)?.blob;
      return blob ? [{ id, blob }] : [];
    });
    const families = new Set(usedFamilies(doc).keys());
    const fontFiles = doc.assets.flatMap((a) => {
      const family = a.kind === "font" ? a.metadata.family : undefined;
      const blob = stored.find((s) => s.id === a.id)?.blob;
      return typeof family === "string" && families.has(family) && blob ? [{ family, blob }] : [];
    });
    const worker = new Worker(new URL("./printRender.worker.ts", import.meta.url), { type: "module" });
    return new Promise<PrintRenderResult>((resolve, reject) => {
      worker.onmessage = (ev: MessageEvent<WorkerMessage>) => {
        const m = ev.data;
        if (m.type === "stage") onStage(m.stage);
        else if (m.type === "done") {
          worker.terminate();
          resolve({ blob: m.blob, via: "worker" });
        } else {
          worker.terminate();
          reject(new Error(m.message));
        }
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(new Error(e.message || "worker_failed"));
      };
      const req: WorkerRequest = { doc, widthPx: size.widthPx, heightPx: size.heightPx, images, fonts: fontFiles };
      worker.postMessage(req);
    });
  };
  return {
    render(doc, size, onStage) {
      const useWorker = mode === "worker" || (mode === "auto" && workerSupported() && workerEligible(doc));
      return (useWorker ? viaWorker : viaMain)(doc, size, onStage);
    },
  };
}
