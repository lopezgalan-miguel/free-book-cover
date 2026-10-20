// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "../src/i18n";
import type { TextureOptions } from "@free-book-cover/core";
import { GenerateTexture } from "../src/panels/TextPanel";

afterEach(cleanup);
const mount = (initial?: TextureOptions) => {
  const onGenerate = vi.fn(async () => undefined);
  render(<I18nProvider><GenerateTexture onGenerate={onGenerate} initial={initial ?? null} /></I18nProvider>);
  return onGenerate;
};
const generate = () => fireEvent.click(screen.getByRole("button", { name: "Generar textura" }));

describe("generador de texturas: escala, color y suavizado", () => {
  it("con los valores por defecto no envía scale, color ni soften", async () => {
    const onGenerate = mount();
    generate();
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());
    expect(onGenerate).toHaveBeenCalledWith({ kind: "cracked-marble", seed: 1, cracks: "holes" });
  });
  it("envía los valores que difieren del defecto", async () => {
    const onGenerate = mount();
    const scale = screen.getByLabelText("Escala");
    fireEvent.change(scale, { target: { value: "4" } });
    fireEvent.blur(scale);
    fireEvent.change(screen.getByLabelText("Color base"), { target: { value: "#336699" } });
    const soften = screen.getByLabelText("Suavizado");
    fireEvent.change(soften, { target: { value: "2" } });
    fireEvent.blur(soften);
    generate();
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());
    expect(onGenerate).toHaveBeenCalledWith({ kind: "cracked-marble", seed: 1, scale: 4, color: "#336699", soften: 2, cracks: "holes" });
  });
  it("al cambiar de tipo se restablecen escala y color", async () => {
    const onGenerate = mount();
    const scale = screen.getByLabelText("Escala") as HTMLInputElement;
    fireEvent.change(scale, { target: { value: "7" } });
    fireEvent.blur(scale);
    fireEvent.change(screen.getByLabelText("Tipo de textura"), { target: { value: "stone" } });
    expect((screen.getByLabelText("Escala") as HTMLInputElement).value).toBe("4");
    expect((screen.getByLabelText("Color base") as HTMLInputElement).value).toBe("#9a948a");
    generate();
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());
    expect(onGenerate).toHaveBeenCalledWith({ kind: "stone", seed: 1 });
  });
  it("arranca con los ajustes de la capa", async () => {
    const initial: TextureOptions = { kind: "cracked-marble", seed: 7, scale: 7, color: "#e4dfd9", soften: 4, cracks: "holes" };
    const onGenerate = mount(initial);
    expect((screen.getByLabelText("Semilla") as HTMLInputElement).value).toBe("7");
    expect((screen.getByLabelText("Escala") as HTMLInputElement).value).toBe("7");
    expect((screen.getByLabelText("Suavizado") as HTMLInputElement).value).toBe("4");
    expect((screen.getByLabelText("Color base") as HTMLInputElement).value).toBe("#e4dfd9");
    generate();
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());
    expect(onGenerate).toHaveBeenCalledWith(initial);
  });
});
