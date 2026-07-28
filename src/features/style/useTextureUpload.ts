/**
 * CONTRATO · useTextureUpload
 * ---------------------------
 * Convierte el fichero elegido por el usuario en la textura que rellena el
 * texto del bloque seleccionado. Gemelo de `useImageUpload`, pero para el
 * relleno del texto en vez del fondo del lienzo.
 *
 * Cómo lo hace:
 *  - Admite los mismos formatos que el fondo (JPG, PNG y WebP) reutilizando
 *    `ACCEPTED_TYPES` por importación: dos listas separadas acabarían
 *    divergiendo y el usuario vería reglas distintas para la misma acción.
 *  - Devuelve el error como clave i18n para que el panel lo pinte; un fichero
 *    rechazado no toca el store.
 *  - No revoca nada: la object URL anterior la libera `setSelectedTexture`,
 *    que es quien sabe cuál era.
 *  - La textura nace en 'cover' y al 100 % de opacidad.
 */

import { useState, type ChangeEvent } from 'react';
import type { MessageKey } from '@/i18n/messages';
import { ACCEPTED_TYPES } from '@/features/image/useImageUpload';
import { useEditorStore } from '@/store/editorStore';

export const useTextureUpload = () => {
  const setSelectedTexture = useEditorStore((state) => state.setSelectedTexture);
  const [error, setError] = useState<MessageKey | null>(null);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // permite volver a elegir el mismo fichero
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('panel.image.invalidType');
      return;
    }

    setError(null);
    setSelectedTexture({
      src: URL.createObjectURL(file),
      fileName: file.name,
      fit: 'cover',
      opacity: 100,
    });
  };

  return { onFileChange, error };
};
