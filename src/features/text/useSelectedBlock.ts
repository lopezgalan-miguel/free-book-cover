/**
 * CONTRATO · useSelectedBlock
 * ---------------------------
 * Devuelve el bloque de texto seleccionado, o `null` si no hay ninguno.
 * Lo usan `TextPanel` y `StylePanel` para no repetir el cruce entre
 * `blocks` y `selectedBlockId`.
 */

import { useEditorStore } from '@/store/editorStore';

export const useSelectedBlock = () => {
  const blocks = useEditorStore((state) => state.blocks);
  const selectedBlockId = useEditorStore((state) => state.selectedBlockId);
  return blocks.find((block) => block.id === selectedBlockId) ?? null;
};
