import { useId, type ReactNode } from "react";
import { useI18n } from "../../i18n";
import { useModal } from "../useModal";

// Hoja inferior modal: foco atrapado, Escape y toque en el fondo la cierran, y el foco vuelve a la pestaña.
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  const titleId = useId();
  const { root, onKeyDown } = useModal(onClose);
  return (
    <div className="fixed inset-0 z-40 bg-[rgba(20,17,13,.32)]" onPointerDown={onClose} data-testid="sheet-backdrop">
      <div
        ref={root} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}
        onPointerDown={(e) => e.stopPropagation()} data-testid="bottom-sheet"
        className="absolute inset-x-0 bottom-0 flex h-[min(438px,75dvh)] flex-col rounded-t-[22px] bg-panel shadow-[0_-12px_40px_rgba(0,0,0,.3)] outline-none"
      >
        <div className="flex-none border-b border-line-soft px-[18px] pb-2 pt-2.5">
          <div aria-hidden className="mx-auto mb-3 mt-0.5 h-1 w-[38px] rounded-full bg-field" />
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="text-base font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="text-[15px] font-semibold text-accent-dark">{t("sheetDone")}</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="sheet-body">{children}</div>
      </div>
    </div>
  );
}
