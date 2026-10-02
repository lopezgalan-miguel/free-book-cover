// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";
import { I18nProvider } from "../src/i18n";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

let n = 0;
beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("aviso de diseño base con variante activa", () => {
  it("Lienzo y Capas avisan solo mientras hay una variante activa", async () => {
    const user = userEvent.setup();
    let i = 0;
    const store = createEditorStore({ storage: await openStorage(`bn-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
    render(<I18nProvider><App store={store} /></I18nProvider>);
    await waitFor(() => expect(store.getState().ready).toBe(true));
    expect(screen.queryByTestId("base-design-notice")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Destino", { selector: "#variant-preset" }), "instagram-feed-portrait");
    await user.click(screen.getByRole("button", { name: "Añadir variante" }));
    expect(store.getState().activeVariantId).not.toBeNull();
    // Un aviso en el panel de Lienzo y otro en el de Capas.
    const notes = await screen.findAllByTestId("base-design-notice");
    expect(notes).toHaveLength(2);
    expect(notes[0]).toHaveTextContent("actúa sobre el diseño base");
    store.setActiveVariant(null);
    await waitFor(() => expect(screen.queryByTestId("base-design-notice")).not.toBeInTheDocument());
  });
});
