import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "@free-book-cover/core";
import { createEditorStore, type EditorStore } from "../src/store/editorStore";
import { attachAutosave, attachUnloadGuard } from "../src/store/lifecycle";
import { openStorage, type ProjectStorage } from "../src/storage/projectStorage";

let n = 0;
let storage: ProjectStorage;
const mk = (st: ProjectStorage = storage): EditorStore => {
  let i = 0;
  return createEditorStore({ storage: st, newId: () => `id${++i}`, downloadParts: vi.fn() });
};

// Temporizadores manuales para controlar el debounce.
function fakeTimers() {
  let next = 1;
  const pending = new Map<number, { fn: () => void; ms: number }>();
  return {
    set: (fn: () => void, ms: number) => { pending.set(next, { fn, ms }); return next++; },
    clear: (id: unknown) => void pending.delete(id as number),
    count: () => pending.size,
    fire: () => { const [id, t] = [...pending][0]!; pending.delete(id); t.fn(); },
  };
}

beforeEach(async () => {
  storage = await openStorage(`life-db-${++n}`);
});

describe("autoguardado (I-2)", () => {
  it("guarda tras una pausa y reinicia la espera con cada cambio (debounce)", async () => {
    const s = mk();
    await s.init();
    const timers = fakeTimers();
    const save = vi.spyOn(s, "save");
    attachAutosave(s, { delayMs: 1500, timers });
    s.dispatch({ type: "setName", name: "a" });
    s.dispatch({ type: "setName", name: "b" });
    s.dispatch({ type: "setName", name: "c" });
    expect(timers.count()).toBe(1);
    expect(save).not.toHaveBeenCalled();
    timers.fire();
    await vi.waitFor(() => expect(s.getState().status).toBe("saved"));
    expect(save).toHaveBeenCalledTimes(1);
    expect(s.hasUnsavedChanges()).toBe(false);
    const re = mk(await openStorage(`life-db-${n}`));
    await re.init();
    expect(re.getState().history.present.name).toBe("c");
  });
  it("no guarda un proyecto sin tocar ni programa nada", async () => {
    const s = mk();
    const timers = fakeTimers();
    attachAutosave(s, { timers });
    await s.init();
    expect(s.hasUnsavedChanges()).toBe(false);
    expect(timers.count()).toBe(0);
  });
  it("un guardado fallido no se reintenta en bucle: solo con un cambio nuevo", async () => {
    const failing = { ...storage, saveProject: vi.fn(async () => ({ ok: false as const, kind: "quota" as const, message: "" })) };
    const s = mk(failing);
    await s.init();
    const timers = fakeTimers();
    attachAutosave(s, { timers });
    s.dispatch({ type: "setName", name: "a" });
    timers.fire();
    await vi.waitFor(() => expect(s.getState().error).toEqual({ kind: "quota" }));
    expect(timers.count()).toBe(0);
    expect(failing.saveProject).toHaveBeenCalledTimes(1);
    s.dispatch({ type: "setName", name: "b" });
    expect(timers.count()).toBe(1);
  });
  it("detener el autoguardado cancela el temporizador", async () => {
    const s = mk();
    await s.init();
    const timers = fakeTimers();
    const stop = attachAutosave(s, { timers });
    s.dispatch({ type: "setName", name: "a" });
    stop();
    expect(timers.count()).toBe(0);
  });
});

describe("aviso al cerrar (I-2)", () => {
  const setup = async () => {
    const s = mk();
    await s.init();
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    const stop = attachUnloadGuard(s, win, doc);
    const fire = () => {
      const e = new Event("beforeunload", { cancelable: true });
      win.dispatchEvent(e);
      return e;
    };
    return { s, win, doc, stop, fire };
  };
  it("pide confirmación solo con cambios sin guardar", async () => {
    const { s, fire } = await setup();
    expect(fire().defaultPrevented).toBe(false);
    s.dispatch({ type: "setName", name: "a" });
    expect(fire().defaultPrevented).toBe(true);
    await s.save();
    expect(fire().defaultPrevented).toBe(false);
  });
  it("al ocultarse la pestaña guarda lo pendiente", async () => {
    const { s, doc } = await setup();
    s.dispatch({ type: "setName", name: "a" });
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(s.hasUnsavedChanges()).toBe(false));
  });
  it("al desmontar deja de avisar", async () => {
    const { s, stop, fire } = await setup();
    s.dispatch({ type: "setName", name: "a" });
    stop();
    expect(fire().defaultPrevented).toBe(false);
  });
});

describe("proyecto recién abierto", () => {
  it("un proyecto nuevo sin editar no cuenta como cambios sin guardar", () => {
    const s = mk();
    expect(s.hasUnsavedChanges()).toBe(false);
    expect(createProject({ id: "x" }).revision).toBe(0);
  });
});
