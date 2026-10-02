import { kdpReview, type Element, type ReviewIssue } from "@free-book-cover/core";
import { useI18n } from "../i18n";
import type { DictKey } from "../i18n/dictionaries";
import { useEditorState, useStore } from "../store/react";

type T = (k: DictKey, v?: Record<string, string | number>) => string;

function nameOf(t: T, e: Element | undefined): string {
  if (!e) return "?";
  if (e.type === "text") return e.runs.map((r) => r.text).join("").trim().slice(0, 24) || t("newText");
  return t("imageLayer");
}

export function reviewMessage(t: T, i: ReviewIssue, el: Element | undefined): string {
  const name = nameOf(t, el);
  switch (i.kind) {
    case "text_outside_safe": return t("kdpIssueTextSafe", { name });
    case "text_over_fold": return t("kdpIssueOverFold", { name });
    case "spine_text_invalid": return t(i.reason === "too_few_pages" ? "kdpIssueSpineFew" : "kdpIssueSpineOutside", { name });
    case "barcode_overlap": return t("kdpIssueBarcode", { name });
    case "outside_canvas": return t("kdpIssueOutside", { name });
    case "background_not_covering_bleed": return t("kdpIssueBackground");
    case "canvas_mismatch": return t("kdpIssueCanvas");
  }
}

// Revisión de la cubierta KDP: lista de avisos con su elemento; al pulsar, se selecciona.
export function KdpReview() {
  const { t } = useI18n();
  const store = useStore();
  const { history } = useEditorState();
  const doc = history.present;
  const review = kdpReview(doc);
  if (!review) return null;
  return (
    <div data-testid="kdp-review">
      {review.issues.length === 0 ? (
        <p role="status" className="text-xs text-muted">{t("kdpReviewOk")}</p>
      ) : (
        <ul className="space-y-1">
          {review.issues.map((i, n) => {
            const id = "elementId" in i ? i.elementId : null;
            const text = reviewMessage(t, i, doc.elements.find((e) => e.id === id));
            return (
              <li key={n} data-testid="kdp-issue" className="rounded-md border border-warn-line bg-warn-bg px-2 py-1 text-[11.5px] text-warn-ink">
                {id ? <button className="text-left" onClick={() => store.select(id)}>{text}</button> : text}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[10.5px] leading-snug text-muted">{t("kdpReviewNote")}</p>
    </div>
  );
}
