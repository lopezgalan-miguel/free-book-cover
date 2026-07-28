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
 *  - Cada bloque de texto lleva `placeholderKey`: mientras no sea `null`,
 *    su `text` es un valor de partida (título/subtítulo/autor/"texto nuevo")
 *    y `retranslateBlocks` puede reescribirlo al cambiar de idioma. Cualquier
 *    patch que cambie `text` sin indicar `placeholderKey` se considera edición
 *    manual del usuario y lo limpia (ver `applyPatch`).
 *  - Las object URL de las texturas se revocan AQUÍ (`setSelectedTexture` al
 *    reemplazarlas, `removeBlock` al borrar la capa que las usa): el store es
 *    el único que sabe cuándo una textura deja de estar referenciada.
 *
 * Este fichero arranca con el estado inicial y las acciones básicas; se irá
 * ampliando feature a feature. Mantener las acciones pequeñas y con nombres
 * legibles (verbo + objeto): `addBlock`, `setImage`, `patchSelected`…
 */

import { create } from 'zustand';
import type {
  EditorState,
  TextBlock,
  BlockTexture,
  CanvasImage,
  CanvasSize,
  ExportFormat,
  ImageFit,
} from '@/types/editor';
import { messages, type MessageKey } from '@/i18n/messages';
import { DEFAULT_LANG, type Lang } from '@/i18n/config';
import { clamp } from '@/utils/clamp';

const createDefaultBlock = (id: string): TextBlock => ({
  id,
  text: messages[DEFAULT_LANG]['block.new.default'],
  placeholderKey: 'block.new.default',
  x: 50,
  y: 50,
  boxWidthPct: null,
  boxHeightPct: null,
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
  shadowColor: '#1A1712',
  outline: false,
  outlineWidth: 3,
  outlineColor: '#1A1712',
  texture: null,
  curve: 0,
});

/**
 * Bloques de partida según el mockup: título, subtítulo y nombre del autor,
 * ya posicionados y con la tipografía/color del diseño de referencia.
 */
const createInitialBlocks = (): TextBlock[] => [
  {
    id: 'block-title',
    text: messages[DEFAULT_LANG]['block.title.default'],
    placeholderKey: 'block.title.default',
    x: 50,
    y: 30,
    boxWidthPct: null,
    boxHeightPct: null,
    fontFamily: 'Playfair Display',
    fontWeight: 700,
    fontSizePct: 11,
    italic: false,
    underline: false,
    uppercase: false,
    align: 'center',
    lineHeight: 1.02,
    letterSpacing: 0,
    color: '#F4EFE6',
    shadow: true,
    shadowIntensity: 38,
    shadowColor: '#1A1712',
    outline: false,
    outlineWidth: 3,
    outlineColor: '#1A1712',
    texture: null,
    curve: 0,
  },
  {
    id: 'block-subtitle',
    text: messages[DEFAULT_LANG]['block.subtitle.default'],
    placeholderKey: 'block.subtitle.default',
    x: 50,
    y: 47,
    boxWidthPct: null,
    boxHeightPct: null,
    fontFamily: 'Cormorant Garamond',
    fontWeight: 500,
    fontSizePct: 4.6,
    italic: true,
    underline: false,
    uppercase: false,
    align: 'center',
    lineHeight: 1.2,
    letterSpacing: 0.02,
    color: '#DCD3C3',
    shadow: false,
    shadowIntensity: 40,
    shadowColor: '#1A1712',
    outline: false,
    outlineWidth: 3,
    outlineColor: '#1A1712',
    texture: null,
    curve: 0,
  },
  {
    id: 'block-author',
    text: messages[DEFAULT_LANG]['block.author.default'],
    placeholderKey: 'block.author.default',
    x: 50,
    y: 91,
    boxWidthPct: null,
    boxHeightPct: null,
    fontFamily: 'Montserrat',
    fontWeight: 600,
    fontSizePct: 3,
    italic: false,
    underline: false,
    uppercase: true,
    align: 'center',
    lineHeight: 1.2,
    letterSpacing: 0.28,
    color: '#C2B6A1',
    shadow: false,
    shadowIntensity: 40,
    shadowColor: '#1A1712',
    outline: false,
    outlineWidth: 3,
    outlineColor: '#1A1712',
    texture: null,
    curve: 0,
  },
];

/** Estado inicial: lienzo Kindle por defecto, sin imagen, bloques del mockup. */
const initialState: EditorState = {
  blocks: createInitialBlocks(),
  selectedBlockId: 'block-title',
  image: null,
  size: { width: 1600, height: 2560 },
  activePresetId: 'kindle',
  customFonts: [],
  exportFormat: 'PNG',
  exportQuality: 92,
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
  /**
   * Pone o quita la textura del bloque seleccionado. Es el ÚNICO camino para
   * cambiar `texture.src`: revoca la object URL anterior antes de escribir la
   * nueva. No-op si no hay selección.
   */
  setSelectedTexture: (texture: BlockTexture | null) => void;
  /**
   * Ajusta encaje u opacidad de la textura del bloque seleccionado sin tocar
   * su `src`. No-op si el bloque no tiene textura.
   */
  patchSelectedTexture: (patch: Partial<BlockTexture>) => void;
  /** Retraduce al idioma dado el texto de los bloques aún no editados. */
  retranslateBlocks: (lang: Lang) => void;
  setImage: (image: CanvasImage | null) => void;
  /** Cambia el encaje del fondo. No hace nada si no hay imagen. */
  setImageFit: (fit: ImageFit) => void;
  /** Coloca el fondo. Ambos valores en % (0–100). No-op sin imagen. */
  setImageOffset: (offsetX: number, offsetY: number) => void;
  /** Devuelve el fondo al centro (50/50). No-op sin imagen. */
  centerImage: () => void;
  setSize: (size: CanvasSize, presetId?: string) => void;
  /** Da de alta una fuente subida por el usuario, ya registrada en el documento. */
  addCustomFont: (name: string) => void;
  setExportFormat: (format: ExportFormat) => void;
  /** Calidad de JPEG/WebP en % (se recorta a 40–100). */
  setExportQuality: (quality: number) => void;
}

let nextBlockId = 2;

/**
 * Aplica un patch a un bloque. Si el patch cambia `text` sin indicar
 * explícitamente `placeholderKey`, se asume que es una edición manual del
 * usuario y se limpia la marca de placeholder (deja de ser retraducible).
 */
/**
 * Libera la object URL de una textura que deja de usarse. Vive aquí y no en la
 * UI: repartida por los paneles, basta olvidarla una vez para filtrar memoria
 * durante toda la sesión.
 */
const revokeTexture = (texture: BlockTexture | null | undefined, keepSrc?: string) => {
  if (texture?.src.startsWith('blob:') && texture.src !== keepSrc) URL.revokeObjectURL(texture.src);
};

const applyPatch = (block: TextBlock, patch: Partial<TextBlock>): TextBlock => {
  const isManualTextEdit = 'text' in patch && !('placeholderKey' in patch);
  return { ...block, ...patch, ...(isManualTextEdit ? { placeholderKey: null } : {}) };
};

export const useEditorStore = create<EditorState & EditorActions>((set, get) => ({
  ...initialState,

  addBlock: () =>
    set((state) => {
      const block = createDefaultBlock(`block-${nextBlockId++}`);
      return { blocks: [...state.blocks, block], selectedBlockId: block.id };
    }),

  removeBlock: (id) =>
    set((state) => {
      revokeTexture(state.blocks.find((b) => b.id === id)?.texture);
      const blocks = state.blocks.filter((b) => b.id !== id);
      const selectedBlockId =
        state.selectedBlockId === id ? (blocks[0]?.id ?? null) : state.selectedBlockId;
      return { blocks, selectedBlockId };
    }),

  selectBlock: (id) => set({ selectedBlockId: id }),

  patchSelected: (patch) => {
    const { selectedBlockId } = get();
    if (selectedBlockId) get().patchBlock(selectedBlockId, patch);
  },

  patchBlock: (id, patch) =>
    set((state) => ({
      blocks: state.blocks.map((b) => (b.id === id ? applyPatch(b, patch) : b)),
    })),

  setSelectedTexture: (texture) =>
    set((state) => {
      const block = state.blocks.find((b) => b.id === state.selectedBlockId);
      if (!block) return {};
      revokeTexture(block.texture, texture?.src);
      return { blocks: state.blocks.map((b) => (b.id === block.id ? { ...b, texture } : b)) };
    }),

  patchSelectedTexture: (patch) =>
    set((state) => ({
      blocks: state.blocks.map((b) =>
        b.id === state.selectedBlockId && b.texture
          ? {
              ...b,
              texture: {
                ...b.texture,
                ...patch,
                ...(patch.opacity === undefined
                  ? {}
                  : { opacity: clamp(patch.opacity, 0, 100) }),
              },
            }
          : b,
      ),
    })),

  retranslateBlocks: (lang) =>
    set((state) => ({
      blocks: state.blocks.map((b) =>
        b.placeholderKey
          ? { ...b, text: messages[lang][b.placeholderKey as MessageKey] ?? b.text }
          : b,
      ),
    })),

  setImage: (image) => set({ image }),

  setImageFit: (fit) =>
    set((state) => (state.image ? { image: { ...state.image, fit } } : {})),

  setImageOffset: (offsetX, offsetY) =>
    set((state) =>
      state.image
        ? {
            image: {
              ...state.image,
              offsetX: clamp(offsetX, 0, 100),
              offsetY: clamp(offsetY, 0, 100),
            },
          }
        : {},
    ),

  centerImage: () =>
    set((state) => (state.image ? { image: { ...state.image, offsetX: 50, offsetY: 50 } } : {})),

  setSize: (size, presetId = 'custom') => set({ size, activePresetId: presetId }),

  addCustomFont: (name) =>
    set((state) =>
      // Registrar dos veces el mismo nombre duplicaría la entrada del panel y
      // dejaría al usuario eligiendo entre dos opciones idénticas.
      state.customFonts.some((font) => font.name === name)
        ? {}
        : { customFonts: [...state.customFonts, { name }] },
    ),

  setExportFormat: (format) => set({ exportFormat: format }),

  setExportQuality: (quality) => set({ exportQuality: clamp(Math.round(quality), 40, 100) }),
}));
