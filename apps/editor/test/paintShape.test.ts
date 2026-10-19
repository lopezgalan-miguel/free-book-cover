import { describe, expect, it } from "vitest";
import { paintShapeItem, shapeStrokePx, type ShapeItem } from "../src/canvas/paintShape";
import { recordingContext } from "./helpers/recordingContext";

// Caja de 300×150 px para un elemento de 1×0,5 in: 300 px por pulgada.
const shape = (opts: { shape?: "rect" | "ellipse"; stroke?: { color: string; width: number } } = {}): ShapeItem => ({
  id: "s", zIndex: 0, kind: "shape", rotation: 0, opacity: 1, box: { x: 30, y: 60, width: 300, height: 150 },
  element: {
    id: "s", type: "shape", shape: opts.shape ?? "rect", x: 0.1, y: 0.2, width: 1, height: 0.5, rotation: 0, zIndex: 0, visible: true,
    fill: "#ff0000", ...(opts.stroke ? { stroke: opts.stroke } : {}),
  },
});
const names = (calls: Array<[string, ...unknown[]]>) => calls.map((c) => c[0]);

describe("paintShapeItem", () => {
  it("rectángulo sin borde: rellena la caja desde la esquina y no traza", () => {
    const { ctx, calls } = recordingContext();
    paintShapeItem(ctx, shape());
    expect(calls).toContainEqual(["rect", 0, 0, 300, 150]);
    expect(calls).toContainEqual(["set:fillStyle", "#ff0000"]);
    expect(names(calls)).toContain("fill");
    expect(names(calls)).not.toContain("stroke");
  });

  it("elipse: centrada en la caja con los semiejes de la caja", () => {
    const { ctx, calls } = recordingContext();
    paintShapeItem(ctx, shape({ shape: "ellipse" }));
    expect(calls).toContainEqual(["ellipse", 150, 75, 150, 75, 0, 0, Math.PI * 2]);
  });

  it("con borde: traza después de rellenar, con el grosor en px de la composición", () => {
    const { ctx, calls } = recordingContext();
    paintShapeItem(ctx, shape({ stroke: { color: "#00ff00", width: 0.02 } }));
    expect(calls).toContainEqual(["set:strokeStyle", "#00ff00"]);
    expect(calls).toContainEqual(["set:lineWidth", 6]);
    const n = names(calls);
    expect(n.indexOf("stroke")).toBeGreaterThan(n.indexOf("fill"));
  });

  it("borde de grosor 0: no traza", () => {
    const { ctx, calls } = recordingContext();
    paintShapeItem(ctx, shape({ stroke: { color: "#00ff00", width: 0 } }));
    expect(names(calls)).not.toContain("stroke");
  });

  it("shapeStrokePx convierte pulgadas del documento a px de la caja", () => {
    expect(shapeStrokePx(shape({ stroke: { color: "#000000", width: 0.1 } }))).toBeCloseTo(30);
    expect(shapeStrokePx(shape())).toBe(0);
  });
});
