import { describe, expect, it } from "vitest";
import { panPosition, placeImage, rotatePoint, effectiveDpi, isLowDpi } from "../src/index.js";

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);
const box = { x: 0, y: 0, width: 600, height: 900 };
const wide = { x: 0, y: 0, width: 2000, height: 1000 };

describe("placeImage", () => {
  it("cover: cubre la caja sin deformar y recorta lo sobrante, centrado", () => {
    const p = placeImage(wide, box, "cover");
    expect(p.dest).toEqual(box);
    near(p.src.height, 1000); // toda la altura
    near(p.src.width, 1000 * (600 / 900)); // ancho recortado a la proporción de la caja
    near(p.src.x, (2000 - p.src.width) / 2);
    near(p.src.width / p.src.height, box.width / box.height);
  });
  it("cover: la posición mueve la ventana de origen entre los extremos", () => {
    near(placeImage(wide, box, "cover", { x: 0, y: 0 }).src.x, 0);
    const end = placeImage(wide, box, "cover", { x: 1, y: 0 }).src;
    near(end.x + end.width, 2000);
  });
  it("contain: toda la imagen con proporción y espacio libre", () => {
    const p = placeImage(wide, box, "contain");
    expect(p.src).toEqual(wide);
    near(p.dest.width, 600);
    near(p.dest.height, 300);
    near(p.dest.y, 300); // centrada verticalmente
    expect(placeImage(wide, box, "contain", { x: 0.5, y: 0 }).dest.y).toBe(0);
  });
  it("fill: estira al tamaño de la caja", () => {
    const p = placeImage(wide, box, "fill");
    expect(p.src).toEqual(wide);
    expect(p.dest).toEqual(box);
  });
  it("respeta el recorte como región de origen", () => {
    const region = { x: 500, y: 0, width: 1000, height: 1000 };
    const p = placeImage(region, { x: 10, y: 10, width: 100, height: 100 }, "cover");
    expect(p.src).toEqual(region);
    expect(p.dest).toEqual({ x: 10, y: 10, width: 100, height: 100 });
  });
  it("rechaza regiones vacías y tolera cajas sin tamaño", () => {
    expect(() => placeImage({ x: 0, y: 0, width: 0, height: 5 }, box, "cover")).toThrow(RangeError);
    expect(placeImage(wide, { x: 3, y: 4, width: 0, height: 0 }, "cover").dest).toEqual({ x: 3, y: 4, width: 0, height: 0 });
  });
  it("las posiciones fuera de 0..1 se acotan", () => {
    expect(placeImage(wide, box, "cover", { x: 9, y: -3 }).src).toEqual(placeImage(wide, box, "cover", { x: 1, y: 0 }).src);
  });
});

describe("panPosition", () => {
  it("cover: arrastrar la imagen a la derecha muestra más parte izquierda de origen", () => {
    const before = placeImage(wide, box, "cover", { x: 0.5, y: 0.5 });
    const pos = panPosition(wide, box, "cover", { x: 0.5, y: 0.5 }, 30, 0);
    expect(pos.x).toBeLessThan(0.5);
    const after = placeImage(wide, box, "cover", pos);
    // la imagen se desplazó 30 px en pantalla: la ventana de origen se movió -30/scale
    const scale = box.height / wide.height;
    near(after.src.x - before.src.x, -30 / scale);
    expect(pos.y).toBe(0.5); // sin holgura vertical
  });
  it("contain: mueve la imagen dentro del espacio libre", () => {
    const pos = panPosition(wide, box, "contain", { x: 0.5, y: 0.5 }, 0, 100);
    near(placeImage(wide, box, "contain", pos).dest.y, 400);
  });
  it("acota a 0..1 y fill no cambia", () => {
    expect(panPosition(wide, box, "cover", { x: 0.5, y: 0.5 }, 99999, 0).x).toBe(0);
    expect(panPosition(wide, box, "fill", { x: 0.2, y: 0.8 }, 50, 50)).toEqual({ x: 0.2, y: 0.8 });
  });
});

describe("rotatePoint y ppp", () => {
  it("gira alrededor de un pivote", () => {
    const p = rotatePoint({ x: 2, y: 0 }, { x: 1, y: 0 }, 90);
    near(p.x, 1);
    near(p.y, 1);
  });
  it("ppp efectivos: el eje peor manda y avisa por debajo de 300", () => {
    expect(effectiveDpi(1800, 2700, 6, 9)).toBe(300);
    expect(effectiveDpi(1800, 1350, 6, 9)).toBe(150);
    expect(effectiveDpi(0, 10, 1, 1)).toBeNull();
    expect(isLowDpi(299.9)).toBe(true);
    expect(isLowDpi(300)).toBe(false);
    expect(isLowDpi(null)).toBe(false);
  });
});
