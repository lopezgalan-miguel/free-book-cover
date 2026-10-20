// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImageElement, ShapeElement, TextElement } from "@free-book-cover/core";
import { App } from "../src/App";
import { I18nProvider } from "../src/i18n";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

// Arreglos de la interfaz encontrados al montar portadas desde Chrome (plan U-01 a U-12).
let n = 0;
async function mount() {
  let i = 0;
  const store = createEditorStore({ storage: await openStorage(`uifix-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  render(<I18nProvider><App store={store} /></I18nProvider>);
  await waitFor(() => expect(store.getState().ready).toBe(true));
  return store;
}
const doc = (store: Awaited<ReturnType<typeof mount>>) => store.getState().history.present;
beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("U-01 formas", () => {
  it("añade un rectángulo y una elipse desde Capas y los selecciona", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await user.click(screen.getByRole("button", { name: "Añadir rectángulo" }));
    const rect = doc(store).elements[0] as ShapeElement;
    expect(rect).toMatchObject({ type: "shape", shape: "rect" });
    expect(store.getState().selectedId).toBe(rect.id);
    await user.click(screen.getByRole("button", { name: "Añadir elipse" }));
    expect(doc(store).elements.map((e) => e.type === "shape" && e.shape)).toEqual(["rect", "ellipse"]);
    expect(within(screen.getByRole("list", { name: "Formas" })).getAllByRole("listitem")).toHaveLength(2);
  });
  it("el panel de forma cambia relleno y borde con comandos que se deshacen", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await user.click(screen.getByRole("button", { name: "Añadir rectángulo" }));
    const id = doc(store).elements[0]!.id;
    fireEvent.change(screen.getByLabelText("Color hexadecimal del relleno"), { target: { value: "0b0203" } });
    expect((doc(store).elements[0] as ShapeElement).fill).toBe("#0b0203");
    await user.click(screen.getByRole("switch", { name: "Borde" }));
    expect((doc(store).elements[0] as ShapeElement).stroke).toEqual({ color: "#000000", width: 0.02 });
    fireEvent.change(screen.getByLabelText("Grosor del borde (in)"), { target: { value: "0.05" } });
    fireEvent.blur(screen.getByLabelText("Grosor del borde (in)"));
    expect((doc(store).elements[0] as ShapeElement).stroke?.width).toBe(0.05);
    await user.click(screen.getByRole("switch", { name: "Borde" }));
    expect("stroke" in doc(store).elements[0]!).toBe(false);
    store.undo();
    expect((doc(store).elements[0] as ShapeElement).stroke?.width).toBe(0.05);
    expect(doc(store).elements[0]!.id).toBe(id);
  });
});

describe("U-02 fondo de color", () => {
  it("sin imagen, el fondo admite un color liso por hexadecimal", async () => {
    const store = await mount();
    fireEvent.change(screen.getByLabelText("Color hexadecimal del fondo"), { target: { value: "0B0203" } });
    expect(doc(store).canvas.background).toBe("#0b0203");
    fireEvent.change(screen.getByLabelText("Color del fondo"), { target: { value: "#204060" } });
    expect(doc(store).canvas.background).toBe("#204060");
  });
});

describe("U-06 orden de capas", () => {
  it("Traer al frente y Enviar al fondo mueven la capa a los extremos en un paso", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await user.click(screen.getByRole("button", { name: "Añadir rectángulo" }));
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    await user.click(screen.getByRole("button", { name: "Añadir elipse" }));
    const order = () => [...doc(store).elements].sort((a, b) => a.zIndex - b.zIndex).map((e) => e.type);
    expect(order()).toEqual(["shape", "text", "shape"]);
    expect(screen.getByRole("button", { name: "Traer al frente" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Enviar al fondo" }));
    expect(order()).toEqual(["shape", "shape", "text"]);
    expect([...doc(store).elements].sort((a, b) => a.zIndex - b.zIndex)[0]!.id).toBe(store.getState().selectedId);
    expect(screen.getByRole("button", { name: "Enviar al fondo" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Traer al frente" }));
    expect(order()).toEqual(["shape", "text", "shape"]);
  });
});

describe("U-05 cuerpo con decimales", () => {
  it("el campo numérico del cuerpo admite décimas de punto", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    const field = screen.getByLabelText("Cuerpo exacto (pt)");
    fireEvent.change(field, { target: { value: "10.5" } });
    fireEvent.blur(field);
    expect((doc(store).elements[0] as { runs: { fontSizePt: number }[] }).runs[0]!.fontSizePt).toBe(10.5);
  });
});

describe("U-07 nombres de capa", () => {
  it("dos capas con el mismo texto se numeran en la lista", async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    const list = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(list.filter((x) => x.includes("Texto nuevo (1)"))).toHaveLength(1);
    expect(list.filter((x) => x.includes("Texto nuevo (2)"))).toHaveLength(1);
  });
});

const be32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const png = (w: number, h: number) =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0])], "tesela.png", { type: "image/png" });

describe("U-03 reutilizar textura", () => {
  it("una capa nueva puede usar la textura (y su encaje) de otra sin volver a subirla", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    await user.upload(screen.getByLabelText("Subir textura"), png(400, 400));
    await waitFor(() => expect((doc(store).elements[0] as { texture?: unknown }).texture).toBeTruthy());
    await user.click(within(screen.getByRole("group", { name: "Encaje de la textura" })).getByRole("button", { name: "Mosaico" }));
    const source = (doc(store).elements[0] as { texture: unknown }).texture;
    const assetsBefore = doc(store).assets.length;
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    await user.click(screen.getByRole("button", { name: "Usar la textura de «Texto nuevo»" }));
    expect((doc(store).elements[1] as { texture: unknown }).texture).toEqual(source);
    expect(doc(store).assets).toHaveLength(assetsBefore);
  });
});

describe("U-04 duplicar proyecto", () => {
  it("crea una copia con otro id, el mismo contenido y sus recursos, y abre la copia", async () => {
    const user = userEvent.setup();
    const store = await mount();
    store.setName("Tapa blanda");
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    await user.upload(screen.getByLabelText("Subir textura"), png(400, 400));
    await waitFor(() => expect(doc(store).assets).toHaveLength(1));
    const original = doc(store);
    const ok = await store.duplicateProject();
    expect(ok).toBe(true);
    const copy = doc(store);
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe("Tapa blanda (copia)");
    expect(copy.elements).toEqual(original.elements);
    expect(store.getState().assets.map((a) => a.id).sort()).toEqual(expect.arrayContaining(original.assets.map((a) => a.id)));
    const list = await store.listProjects();
    expect(list.map((p) => p.name).sort()).toEqual(["Tapa blanda", "Tapa blanda (copia)"]);
    // El original sigue intacto y se puede abrir con sus recursos.
    expect(await store.openProject(original.id)).toBe(true);
    expect(doc(store).elements).toEqual(original.elements);
    expect(store.getState().assets.some((a) => a.id === original.assets[0]!.id)).toBe(true);
  });
  it("el botón Duplicar proyecto está en el diálogo de proyecto", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await user.click(screen.getByRole("button", { name: "Proyecto" }));
    await user.click(await screen.findByRole("button", { name: "Duplicar proyecto" }));
    await waitFor(async () => expect((await store.listProjects()).length).toBe(2));
  });
});

describe("U-09 avisos de resolución agrupados", () => {
  it("un solo aviso para todos los recursos, con las repeticiones contadas", async () => {
    const user = userEvent.setup();
    const store = await mount();
    for (let k = 0; k < 3; k++) {
      await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
      await user.upload(screen.getByLabelText("Subir textura"), png(100, 100));
    }
    await waitFor(() => expect(doc(store).elements.filter((e) => (e as { texture?: unknown }).texture)).toHaveLength(3));
    const warnings = screen.getAllByTestId("dpi-warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toHaveTextContent("tesela.png");
    expect(warnings[0]).toHaveTextContent("× 3");
  });
});

describe("U-10 y U-12 detalles", () => {
  it("la cabecera muestra el tamaño redondeado", async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole("button", { name: /^Kindle/ }));
    expect(screen.getByTestId("dims")).toHaveTextContent("5.333 × 8.533 in");
  });
  it("Escape fuera de un campo quita la selección", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await user.click(screen.getByRole("button", { name: "Añadir rectángulo" }));
    expect(store.getState().selectedId).not.toBeNull();
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(store.getState().selectedId).toBeNull();
  });
  it("Escape dentro de un campo de texto no quita la selección", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    fireEvent.keyDown(screen.getByLabelText("Contenido del texto"), { key: "Escape" });
    expect(store.getState().selectedId).not.toBeNull();
  });
  it("abrir otro proyecto cierra el diálogo; mientras carga la lista no dice que no hay proyectos", async () => {
    const user = userEvent.setup();
    const store = await mount();
    store.setName("Primero");
    await store.save();
    await store.newProject("Segundo");
    await user.click(screen.getByRole("button", { name: "Segundo" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText("No hay otros proyectos guardados.")).toBeNull();
    await user.click(await within(dialog).findByRole("button", { name: "Abrir Primero" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(doc(store).name).toBe("Primero");
  });
});

describe("E-04 alto del texto", () => {
  const text: TextElement = {
    id: "t", type: "text", x: 1, y: 1, width: 3, height: 1, rotation: 0, zIndex: 0, visible: true,
    runs: [{ text: "Hola", fontFamily: "Georgia", fontSizePt: 24, weight: 400, italic: false, underline: false, uppercase: false, color: "#ffffff" }],
    align: "left", lineHeight: 1.2, letterSpacing: 0, shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#000000" }, curvature: 0,
  };
  const image: ImageElement = { id: "i", type: "image", assetRef: { assetId: "a" }, fit: "cover", x: 1, y: 1, width: 2, height: 2, rotation: 0, zIndex: 1, visible: true, crop: { x: 0, y: 0, width: 1, height: 1 } };
  it("Alto (in) está deshabilitado en texto y habilitado en imagen", async () => {
    const store = await mount();
    store.dispatch({ type: "addAsset", asset: { id: "a", kind: "image", mimeType: "image/png", metadata: {} } });
    expect(store.dispatch({ type: "addElement", element: text })).toBe(true);
    expect(store.dispatch({ type: "addElement", element: image })).toBe(true);
    act(() => store.select("t"));
    const h = await screen.findByLabelText("Alto (in)");
    expect(h).toBeDisabled();
    expect(h).toHaveAttribute("title", "El alto lo marca el texto");
    expect(screen.getByLabelText("Ancho (in)")).toBeEnabled();
    act(() => store.select("i"));
    expect(screen.getByLabelText("Alto (in)")).toBeEnabled();
  });
});
