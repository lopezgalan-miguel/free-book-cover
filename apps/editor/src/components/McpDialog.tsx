import { useId } from "react";
import { useI18n } from "../i18n";
import { McpPanel } from "./McpPanel";
import { useModal } from "./useModal";

// Modal de la conexión MCP (foco, Escape y retorno del foco vía useModal).
export function McpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <Dialog onClose={onClose} />;
}

function Dialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const titleId = useId();
  const { root, onKeyDown } = useModal(onClose);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(30,26,20,.5)] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        ref={root} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-[440px] max-w-[92vw] overflow-y-auto rounded-2xl bg-panel shadow-[0_30px_80px_rgba(0,0,0,.4)] outline-none"
      >
        <div className="border-b border-line-soft px-[22px] pb-4 pt-5">
          <h2 id={titleId} className="text-base font-semibold">{t("mcpTitle")}</h2>
        </div>
        <div className="px-[22px] py-4"><McpPanel /></div>
        <div className="flex justify-end border-t border-line-soft px-[22px] py-3">
          <button type="button" className="rounded-lg border border-line bg-white px-4 py-2 text-[13px] hover:bg-chip" onClick={onClose}>{t("mcpClose")}</button>
        </div>
      </div>
    </div>
  );
}
