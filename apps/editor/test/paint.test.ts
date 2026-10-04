import { describe, expect, it } from "vitest";
import type { RenderedDocument } from "@free-book-cover/core";
import { paintDocument } from "../src/canvas/paint";
import type { ShapeItem } from "../src/canvas/paintShape";
import { recordingContext } from "./helpers/recordingContext";

const stroked: ShapeItem = {
  id: "s", zIndex: 0, kind: "shape", rotation: 30, box: { x: 30, y: 60, width: 300, height: 150 },
  element: {
    id: "s", type: "shape", shape: "rect", x: 0.1, y: 0.2, width: 1, height: 0.5, rotation: 30, zIndex: 0, visible: true,
    fill: "#ff0000", stroke: { color: "#00ff00", width: 0.02 },
  },
};
const rendered: RenderedDocument = { widthPx: 600, heightPx: 900, pxPerInch: 300, background: { kind: "color", color: "#ffffff" }, items: [stroked] };

describe("paintDocument", () => {
  it("exporta el borde de las formas (antes solo se veía en la vista previa)", () => {
    const { ctx, calls } = recordingContext();
    paintDocument(ctx, rendered, new Map());
    expect(calls).toContainEqual(["set:strokeStyle", "#00ff00"]);
    expect(calls.map((c) => c[0])).toContain("stroke");
  });

  it("gira la forma alrededor del centro de su caja", () => {
    const { ctx, calls } = recordingContext();
    paintDocument(ctx, rendered, new Map());
    expect(calls).toContainEqual(["translate", 180, 135]);
    expect(calls).toContainEqual(["rotate", (30 * Math.PI) / 180]);
    expect(calls).toContainEqual(["translate", -150, -75]);
  });
});
