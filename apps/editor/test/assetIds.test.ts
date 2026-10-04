import { describe, expect, it } from "vitest";
import { baseAssetId, thumbId } from "../src/storage/assetIds";

describe("ids de blobs", () => {
  it("la miniatura se deriva del recurso y vuelve a él", () => {
    expect(thumbId("a1")).toBe("a1.thumb");
    expect(baseAssetId(thumbId("a1"))).toBe("a1");
    expect(baseAssetId("a1")).toBe("a1");
  });
});
