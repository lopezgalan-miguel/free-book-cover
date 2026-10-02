import { useEffect, useId, useRef } from "react";
import { useI18n } from "../i18n";
import { McpPanel } from "./McpPanel";

const FOCUSABLE = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

// Modal de la conexión MCP (mismo patrón que el de exportación: foco, Escape y retorno del foco).
export function McpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <Dialog onClose={onClose} />;
}

function Dialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => prev?.focus?.();
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    } else if (e.key === "Tab" && root.current) {
      const items = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
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
