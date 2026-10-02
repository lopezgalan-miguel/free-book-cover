import { describe, expect, it } from "vitest";
import { MOBILE_MAX_WIDTH, layoutForWidth } from "../src/layout/useLayout";
import { MOBILE_TABS, TAB_TEXT_SECTIONS, closeSheet, initialSheet, nextTab, pressTab } from "../src/layout/mobileTabs";

describe("contenedor por breakpoint", () => {
  it("767 px y menos es móvil; 768 px y más es escritorio", () => {
    expect(MOBILE_MAX_WIDTH).toBe(767);
    expect(layoutForWidth(390)).toBe("mobile");
    expect(layoutForWidth(767)).toBe("mobile");
    expect(layoutForWidth(768)).toBe("desktop");
    expect(layoutForWidth(1440)).toBe("desktop");
  });
});

describe("estado de pestañas", () => {
  it("arranca con la hoja cerrada y hay cinco pestañas en el orden del mockup", () => {
    expect(initialSheet.open).toBe(false);
    expect(MOBILE_TABS).toEqual(["text", "font", "color", "style", "canvas"]);
  });
  it("pulsar una pestaña abre la hoja; pulsar la activa la cierra; otra cambia de pestaña", () => {
    let s = pressTab(initialSheet, "color");
    expect(s).toEqual({ tab: "color", open: true });
    s = pressTab(s, "style");
    expect(s).toEqual({ tab: "style", open: true });
    s = pressTab(s, "style");
    expect(s.open).toBe(false);
    expect(pressTab(s, "style").open).toBe(true);
  });
  it("cerrar conserva la pestaña y es idempotente", () => {
    const s = closeSheet({ tab: "font", open: true });
    expect(s).toEqual({ tab: "font", open: false });
    expect(closeSheet(s)).toBe(s);
  });
  it("cada pestaña reutiliza secciones del panel de texto; Lienzo no", () => {
    expect(TAB_TEXT_SECTIONS.text).toEqual(["text"]);
    expect(TAB_TEXT_SECTIONS.style).toEqual(["style", "fx"]);
    expect(TAB_TEXT_SECTIONS.canvas).toBeNull();
    const all = MOBILE_TABS.flatMap((t) => TAB_TEXT_SECTIONS[t] ?? []);
    expect(new Set(all)).toEqual(new Set(["text", "font", "style", "color", "fx"]));
  });
  it("flechas, Inicio y Fin recorren las pestañas de forma rotativa", () => {
    expect(nextTab("text", "ArrowRight")).toBe("font");
    expect(nextTab("canvas", "ArrowRight")).toBe("text");
    expect(nextTab("text", "ArrowLeft")).toBe("canvas");
    expect(nextTab("color", "Home")).toBe("text");
    expect(nextTab("color", "End")).toBe("canvas");
    expect(nextTab("color", "a")).toBeNull();
  });
});
