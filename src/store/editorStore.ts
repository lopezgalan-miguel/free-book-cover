/**
 * CONTRATO · Store del editor (Zustand, tipado)
 * ---------------------------------------------
 * Único punto donde vive y muta el estado del editor (`EditorState`).
 * Los componentes NO guardan estado de dominio propio: leen con selectores
 * (`useEditorStore(s => s.algo)`) y mutan llamando a acciones de aquí. Así el
 * preview es reactivo "en tiempo real" y el modelo permanece coherente.
 *
 * Cómo lo hace:
 *  - Mantiene el estado + un conjunto de acciones puras y tipadas.
 *  - Las acciones que tocan el bloque seleccionado (`patchSelected`) evitan
 *    repetir la lógica de "buscar y actualizar la capa activa".
 *  - Todo lo que entra se valida/normaliza en los `utils` (hex, clamp) antes
 *    de tocar el estado.
 *
 * Este fichero arranca con el estado inicial y las acciones básicas; se irá
 * ampliando feature a feature. Mantener las acciones pequeñas y con nombres
 * legibles (verbo + objeto): `addBlock`, `setImage`, `patchSelected`…
 */

import { create } from 'zustand';
import type {
  EditorState,
  TextBlock,
  CanvasImage,
  CanvasSize,
  ExportFormat,
} from '@/types/editor';

/** Crea un bloque de texto nuevo con valores por defecto sensatos. */
function createDefaultBlock(id: string): TextBlock {
  return {
    id,
    text: 'Texto nuevo',
    x: 50,
    y: 50,
    fontFamily: 'Playfair Display',
    fontWeight: 700,
    fontSizePct: 10,
    italic: false,
    underline: false,
    uppercase: false,
    align: 'center',
    lineHeight: 1.1,
    letterSpacing: 0,
    color: '#F4EFE6',
    shadow: false,
    shadowIntensity: 40,
    outline: false,
    outlineWidth: 3,
    outlineColor: '#1A1712',
    curve: 0,
  };
}

/** Estado inicial: lienzo Kindle por defecto, sin imagen, un bloque de ejemplo. */
const initialState: EditorState = {
  blocks: [createDefaultBlock('block-1')],
  selectedBlockId: 'block-1',
  image: null,
  size: { width: 1600, height: 2560 },
  activePresetId: 'kindle',
  customFonts: [],
  exportFormat: 'PNG',
};

/** Acciones que expone el store, además del propio estado. */
interface EditorActions {
  addBlock: () => void;
  removeBlock: (id: string) => void;
  selectBlock: (id: string | null) => void;
  /** Actualiza parcialmente el bloque seleccionado (no-op si no hay ninguno). */
  patchSelected: (patch: Partial<TextBlock>) => void;
  /** Actualiza parcialmente un bloque concreto por id. */
  patchBlock: (id: string, patch: Partial<TextBlock>) => void;
  setImage: (image: CanvasImage | null) => void;
  setSize: (size: CanvasSize, presetId?: string) => void;
  setExportFormat: (format: ExportFormat) => void;
}

let nextBlockId = 2;

export const useEditorStore = create<EditorState & EditorActions>((set) => ({
  ...initialState,

  addBlock: () =>
    set((state) => {
      const block = createDefaultBlock(`block-${nextBlockId++}`);
      return { blocks: [...state.blocks, block], selectedBlockId: block.id };
    }),

  removeBlock: (id) =>
    set((state) => {
      const blocks = state.blocks.filter((b) => b.id !== id);
      const selectedBlockId =
        state.selectedBlockId === id ? (blocks[0]?.id ?? null) : state.selectedBlockId;
      return { blocks, selectedBlockId };
    }),

  selectBlock: (id) => set({ selectedBlockId: id }),

  patchSelected: (patch) =>
    set((state) => ({
      blocks: state.blocks.map((b) =>
        b.id === state.selectedBlockId ? { ...b, ...patch } : b,
      ),
    })),

  patchBlock: (id, patch) =>
    set((state) => ({
      blocks: state.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    })),

  setImage: (image) => set({ image }),

  setSize: (size, presetId = 'custom') => set({ size, activePresetId: presetId }),

  setExportFormat: (format) => set({ exportFormat: format }),
}));
