import { describe, expect, it, vi } from "vitest";
import { createHistory, createProject } from "@free-book-cover/core";
import { importImage } from "../src/images/importImage";
import type { ImagePort } from "../src/store/ports";

// PNG de 1x1.
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

describe("ImagePort", () => {
  it("importImage solo necesita el puerto de imágenes", async () => {
    const history = createHistory(createProject({ id: "p" }));
    let n = 0;
    const port: ImagePort = {
      getState: () => ({ history, error: null }) as never,
      newId: () => `id${++n}`,
      reportError: vi.fn(),
      dismissError: vi.fn(),
      addAsset: vi.fn(async () => true),
      addDerivedBlob: vi.fn(async () => true),
      dispatch: vi.fn(() => true),
      select: vi.fn(),
    };
    const r = await importImage(port, new Blob([PNG]), "background", async () => null);
    expect(r).toEqual({ ok: true, assetId: "id1" });
    expect(port.dispatch).toHaveBeenCalledWith({ type: "setBackground", background: { assetId: "id1" } });
  });
});
