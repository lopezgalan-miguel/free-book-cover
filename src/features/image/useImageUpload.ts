/**
 * CONTRATO · useImageUpload
 * -------------------------
 * Convierte el fichero elegido por el usuario en la imagen de fondo del store.
 *
 * Cómo lo hace:
 *  - Solo admite JPG, PNG y WebP; cualquier otro tipo se rechaza sin tocar el
 *    store y devuelve la clave del mensaje de error para que el panel lo pinte.
 *  - Revoca la object URL anterior antes de crear la nueva: sin esto cada
 *    cambio de imagen filtra memoria durante toda la sesión.
 *  - La imagen nace centrada y en modo 'cover'.
 */

import { useState, type ChangeEvent } from 'react';
import type { MessageKey } from '@/i18n/messages';
import { useEditorStore } from '@/store/editorStore';

/**
 * Tipos MIME admitidos. Se exporta para que el `accept` del `<input>` y la
 * validación de aquí no puedan divergir.
 */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const useImageUpload = () => {
  const image = useEditorStore((state) => state.image);
  const setImage = useEditorStore((state) => state.setImage);
  const [error, setError] = useState<MessageKey | null>(null);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // permite volver a elegir el mismo fichero
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('panel.image.invalidType');
      return;
    }

    if (image?.src.startsWith('blob:')) URL.revokeObjectURL(image.src);

    setError(null);
    setImage({
      src: URL.createObjectURL(file),
      fileName: file.name,
      fit: 'cover',
      offsetX: 50,
      offsetY: 50,
    });
  };

  return { onFileChange, error };
};
