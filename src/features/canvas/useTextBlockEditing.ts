/** Gestiona el ciclo de edición DOM de un bloque: foco, selección y commit. */
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/useI18n';
import type { TextBlock } from '@/types/editor';

interface UseTextBlockEditingOptions {
  block: TextBlock;
  onSelect: () => void;
  onChange: (patch: Partial<TextBlock>) => void;
}

export const useTextBlockEditing = ({
  block,
  onSelect,
  onChange,
}: UseTextBlockEditingOptions) => {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const editableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing || !editableRef.current) return;

    const editableElement = editableRef.current;
    editableElement.focus();
    const range = document.createRange();
    range.selectNodeContents(editableElement);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editing]);

  const onDoubleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (editing) return;
    onSelect();
    setEditing(true);
  };

  const onBlur = () => {
    setEditing(false);
    const editableElement = editableRef.current;
    if (!editableElement) return;

    const rawText = editableElement.textContent ?? '';
    if (rawText.trim() === '') {
      const placeholderText = t('block.new.default');
      if (placeholderText !== block.text) {
        onChange({ text: placeholderText, placeholderKey: 'block.new.default' });
      }
      editableElement.textContent = placeholderText;
    } else if (rawText !== block.text) {
      onChange({ text: rawText });
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).blur();
  };

  return { editing, editableRef, onDoubleClick, onBlur, onKeyDown };
};
