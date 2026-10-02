import { useI18n } from "../i18n";
import { useEditorState, useStore } from "../store/react";
import { KdpReview } from "./KdpReview";
import { KdpSetupWizard } from "./KdpSetupWizard";
import { Section, Switch } from "./ui";

// Sección «Cubierta KDP»: asistente, guías y revisión.
export function KdpPanel() {
  const { t } = useI18n();
  const store = useStore();
  const { history, guidesVisible } = useEditorState();
  const configured = history.present.mode === "kdp-paperback" && !!history.present.printSetup;
  return (
    <>
      <Section title={t("kdpCover")}>
        <KdpSetupWizard />
      </Section>
      {configured && (
        <>
          <Section title={t("kdpGuides")}>
            <Switch label={t("kdpGuides")} checked={guidesVisible} onChange={(v) => store.setGuidesVisible(v)} />
            <p className="text-[10.5px] leading-snug text-muted">{t("kdpGuidesHint")}</p>
          </Section>
          <Section title={t("kdpReview")}>
            <KdpReview />
          </Section>
        </>
      )}
    </>
  );
}
