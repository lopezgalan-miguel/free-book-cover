import { describe, expect, it } from "vitest";
import { paintTextItem, type TextItem } from "../src/canvas/paintText";
import { recordingContext } from "./helpers/recordingContext";

const image = { tag: "imagen" } as unknown as ImageBitmap;
const style = { font: "400 40px Lora", fontPx: 40, color: "#ffffff", underline: false, spacingPx: 0 };
const item = (repeat: boolean): TextItem => ({
  id: "t", zIndex: 0, kind: "text", rotation: 0, opacity: 1, box: { x: 0, y: 0, width: 300, height: 100 },
  element: {
    id: "t", type: "text", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0, visible: true,
    runs: [{ text: "Hola", fontFamily: "Lora", fontSizePt: 10, weight: 400, italic: false, underline: false, uppercase: false, color: "#ffffff" }],
    align: "left", lineHeight: 1, letterSpacing: 0, shadow: { on: false, intensity: 0 }, outline: { on: false, width: 0, color: "#000000" }, curvature: 0,
  },
  layout: { heightPx: 40, minWidthPx: 80, glyphs: null, lines: [{ top: 0, height: 40, baseline: 32, width: 80, pieces: [{ text: "Hola", x: 0, width: 80, style }] }] },
  effects: { shadow: null, outline: null, innerShadow: null, bevel: null },
  texture: { assetId: "tx", fit: "cover", repeat, dpi: 300, lowDpi: false, src: { x: 0, y: 0, width: 600, height: 300 }, dest: { x: 0, y: 0, width: 200, height: 100 } },
  mask: null,
});

describe("paintTextItem: textura", () => {
  it("en mosaico crea el patrón con repetición", () => {
    const { ctx, calls } = recordingContext();
    paintTextItem(ctx, item(true), new Map([["tx", { image, scale: 1 }]]));
    expect(calls).toContainEqual(["createPattern", image, "repeat"]);
  });
  it("al cubrir la caja no repite", () => {
    const { ctx, calls } = recordingContext();
    paintTextItem(ctx, item(false), new Map([["tx", { image, scale: 1 }]]));
    expect(calls).toContainEqual(["createPattern", image, "no-repeat"]);
  });
});
