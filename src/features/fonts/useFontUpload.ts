/**
 * CONTRATO · useFontUpload
 * ------------------------
 * Convierte el fichero de fuente elegido por el usuario en una familia más del
 * panel. Es al `FontPanel` lo que `useImageUpload` es al `ImagePanel`: recoge
 * el `<input type="file">`, valida, y deja el store coherente.
 *
 * Cómo lo hace:
 *  - La mecánica de `FontFace` es de `useFontLoader`; aquí se decide QUÉ nombres
 *    están ocupados (los del catálogo más los ya subidos) y qué hacer con el
 *    resultado.
 *  - Una fuente recién subida se aplica al bloque seleccionado: subirla es
 *    justamente pedir usarla. Sin selección, `patchSelected` no hace nada y la
 *    fuente se queda en la lista, disponible.
 *  - El error se devuelve como clave de mensaje, nunca como texto: lo pinta el
 *    panel con `t()`.
 */

import { useState, type ChangeEvent } from 'react';
import type { MessageKey } from '@/i18n/messages';
import { useEditorStore } from '@/store/editorStore';
import { FONT_CATALOG } from './catalog';
import { useFontLoader } from './useFontLoader';

export const useFontUpload = () => {
  const customFonts = useEditorStore((state) => state.customFonts);
  const addCustomFont = useEditorStore((state) => state.addCustomFont);
  const patchSelected = useEditorStore((state) => state.patchSelected);
  const { loadCustomFont } = useFontLoader();
  const [error, setError] = useState<MessageKey | null>(null);

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const fontFile = event.target.files?.[0];
    event.target.value = ''; // permite volver a elegir el mismo fichero
    if (!fontFile) return;

    const takenFamilies = [
      ...FONT_CATALOG.map((font) => font.family),
      ...customFonts.map((font) => font.name),
    ];

    const result = await loadCustomFont(fontFile, takenFamilies);
    if (!result.ok) {
      setError(result.errorKey);
      return;
    }

    setError(null);
    addCustomFont(result.family);
    patchSelected({ fontFamily: result.family });
  };

  return { onFileChange, error };
};
