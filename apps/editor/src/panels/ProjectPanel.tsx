import { useCallback, useEffect, useState } from "react";
import { LIMITS } from "@free-book-cover/core";
import { useI18n } from "../i18n";
import { useEditorState, useStore } from "../store/react";
import { chipBtn, fieldCls, Section } from "./ui";

type Saved = Awaited<ReturnType<ReturnType<typeof useStore>["listProjects"]>>;
const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

// Proyecto: nombre, crear/abrir otro, copia de seguridad y liberación de espacio. Independiente del contenedor.
export function ProjectPanel() {
  const { t } = useI18n();
  const store = useStore();
  const state = useEditorState();
  const doc = state.history.present;
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved>([]);
  const [confirm, setConfirm] = useState<"space" | { del: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(() => void store.listProjects().then(setSaved).catch(() => setSaved([])), [store]);
  useEffect(refresh, [refresh, doc.id, state.savedRevision]);

  const commitName = () => {
    if (draft !== null) store.setName(draft);
    setDraft(null);
  };
  const unused = store.unusedAssets();
  const others = saved.filter((p) => p.id !== doc.id);
  const label = (name: string) => name || t("projectUnnamed");

  return (
    <div data-testid="project-panel">
      <Section title={t("projectName")}>
        <input
          className={fieldCls} aria-label={t("projectName")} placeholder={t("projectNamePh")} maxLength={120}
          value={draft ?? doc.name}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitName();
            if (e.key === "Escape") setDraft(null);
          }}
        />
        <div className="mt-2.5 flex items-center gap-2">
          <button type="button" className={chipBtn} onClick={() => { setNote(null); void store.newProject().then(refresh); }}>{t("projectNew")}</button>
          <span className="text-[10.5px] text-muted">{t("projectNewHint")}</span>
        </div>
      </Section>

      <Section title={t("projectSaved")}>
        {others.length === 0 ? <p className="text-[11.5px] text-muted">{t("projectNoOthers")}</p> : (
          <ul className="grid gap-1.5">
            {others.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-2.5 py-1.5" data-testid="saved-project">
                <span className="min-w-0 truncate text-[12.5px]">{label(p.name)}</span>
                {confirm && typeof confirm === "object" && confirm.del === p.id ? (
                  <span className="flex flex-none items-center gap-1.5">
                    <span className="sr-only">{t("projectDeleteConfirm", { name: label(p.name) })}</span>
                    <button type="button" className={chipBtn} onClick={() => { setConfirm(null); void store.deleteProject(p.id).then(refresh); }}>{t("projectDeleteYes")}</button>
                    <button type="button" className={chipBtn} onClick={() => setConfirm(null)}>{t("projectCancel")}</button>
                  </span>
                ) : (
                  <span className="flex flex-none gap-1.5">
                    <button type="button" className={chipBtn} aria-label={`${t("projectOpen")} ${label(p.name)}`} onClick={() => { setNote(null); void store.openProject(p.id).then(refresh); }}>{t("projectOpen")}</button>
                    <button type="button" className={chipBtn} aria-label={`${t("projectDelete")} ${label(p.name)}`} onClick={() => setConfirm({ del: p.id })}>{t("projectDelete")}</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {confirm && typeof confirm === "object" && (
          <p role="alert" className="mt-2 text-[11.5px] text-danger">
            {t("projectDeleteConfirm", { name: label(saved.find((p) => p.id === confirm.del)?.name ?? "") })}
          </p>
        )}
      </Section>

      <Section title={t("backupSection")}>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={chipBtn} onClick={() => void store.downloadBackup()}>{t("downloadBackup")}</button>
          <label className={`${chipBtn} cursor-pointer`}>
            {t("backupImport")}
            <input
              type="file" multiple accept="application/json,.json" className="sr-only" aria-label={t("backupImport")}
              onChange={async (e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                if (files.length === 0) return;
                setNote((await store.importBackup(files)) ? t("backupImported") : null);
                refresh();
              }}
            />
          </label>
        </div>
        <p className="mt-1.5 text-[10.5px] leading-snug text-muted">{t("backupImportHint")}</p>
      </Section>

      <Section title={t("spaceTitle")} last>
        <p className="text-[12px]" data-testid="space-used">{t("spaceUsed", { used: mb(store.projectBytes()), max: mb(LIMITS.projectBytes) })}</p>
        <p className="mt-1 text-[11.5px] text-muted" data-testid="space-unused">
          {unused.ids.length > 0 ? t("spaceUnused", { n: unused.ids.length, size: mb(unused.bytes) }) : t("spaceNoUnused")}
        </p>
        {confirm === "space" ? (
          <div className="mt-2.5">
            <p role="alert" className="text-[11.5px] leading-snug">{t("spaceConfirm", { n: unused.ids.length })}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button" className={chipBtn}
                onClick={async () => {
                  const before = store.projectBytes();
                  setConfirm(null);
                  await store.freeUnused();
                  setNote(t("spaceFreed", { size: mb(Math.max(0, before - store.projectBytes())) }));
                }}
              >
                {t("spaceConfirmYes")}
              </button>
              <button type="button" className={chipBtn} onClick={() => setConfirm(null)}>{t("projectCancel")}</button>
            </div>
          </div>
        ) : (
          <button type="button" className={`${chipBtn} mt-2.5`} disabled={unused.ids.length === 0} onClick={() => { setNote(null); setConfirm("space"); }}>{t("spaceFree")}</button>
        )}
        {note && <p role="status" className="mt-2 text-[11.5px] text-ok" data-testid="project-note">{note}</p>}
      </Section>
    </div>
  );
}
