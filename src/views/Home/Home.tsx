/**
 * CONTRATO · Vista Home
 * ---------------------
 * Pantalla de entrada y única vista de la app: COMPONE el editor completo a
 * partir de las piezas de features, siguiendo los mockups (desktop y móvil).
 *
 * Qué hace:
 *  - Cabecera con la marca, el selector de idioma (ES/CA), las dimensiones del
 *    lienzo y el botón Exportar. El orden lo fija el mockup: en escritorio el
 *    ES/CA abre el grupo derecho (idioma → dims → Exportar) y en móvil ocupa el
 *    extremo izquierdo de la barra, con el título centrado y Exportar a la
 *    derecha. En escritorio, junto a las dimensiones va el % de zoom que
 *    publica el Stage; en móvil el mockup deja solo las dims.
 *  - Escritorio (≥ lg): a la izquierda ImagePanel, SizePanel y LayerList; a la
 *    derecha TextPanel, FontPanel, StylePanel y ColorPanel; Stage al centro.
 *    Sin capa seleccionada, el panel derecho ENTERO se sustituye por el aviso
 *    de "selecciona una capa": los paneles de estilo no tendrían sobre qué
 *    actuar, así que no se pintan a medias.
 *  - Móvil: Stage a pantalla completa, barra inferior de cinco pestañas y hoja
 *    inferior (Sheet) que aloja el panel activo; Exportar abre la hoja con
 *    ExportDialog. La pestaña Texto lleva además la tira de capas y el borrado
 *    de la capa actual, que en escritorio viven en la columna izquierda.
 *
 * Cómo lo hace:
 *  - useMediaQuery monta UNA sola variante del layout (nada de duplicar
 *    paneles ocultándolos con CSS).
 *  - Solo guarda estado de UI (contenido de la hoja, diálogo de exportación);
 *    el estado de dominio se lee del editorStore con selectores.
 *  - Ningún literal visible: todo texto sale del catálogo i18n con useT().
 *
 * El ExportDialog se monta en sus dos formas (modal en escritorio, contenido de
 * la hoja en móvil) y avisa hacia aquí al terminar: el Toast lo pinta esta
 * vista porque el diálogo se cierra en cuanto la exportación sale bien.
 */

import { useState } from 'react';
import { Stage } from '@/features/canvas/Stage';
import { SizePanel } from '@/features/canvasSize/SizePanel';
import { ColorPanel } from '@/features/color/ColorPanel';
import { ExportDialog } from '@/features/export/ExportDialog';
import { FontPanel } from '@/features/fonts/FontPanel';
import { ImagePanel } from '@/features/image/ImagePanel';
import { LayerList } from '@/features/layers/LayerList';
import { StylePanel } from '@/features/text/StylePanel';
import { TextPanel } from '@/features/text/TextPanel';
import { useSelectedBlock } from '@/features/text/useSelectedBlock';
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher';
import type { MessageKey } from '@/i18n/messages';
import { useT } from '@/i18n/useI18n';
import { Button } from '@/sharedComponents/Button';
import { Sheet } from '@/sharedComponents/Sheet';
import { Toast } from '@/sharedComponents/Toast';
import { useEditorStore } from '@/store/editorStore';
import { useMediaQuery } from './useMediaQuery';

/** Pestañas de edición de la barra inferior móvil. */
type HomeTab = 'text' | 'font' | 'style' | 'color' | 'canvas';

/** Contenido que puede alojar la hoja inferior: una pestaña o la exportación. */
type SheetContent = HomeTab | 'export';

/** Consulta que separa la composición móvil de la de escritorio (= `lg`). */
const DESKTOP_MEDIA_QUERY = '(min-width: 64rem)';

const HOME_TABS: { key: HomeTab; icon: string; labelKey: MessageKey }[] = [
  { key: 'text', icon: 'T', labelKey: 'home.tab.text' },
  { key: 'font', icon: '✦', labelKey: 'home.tab.font' },
  { key: 'style', icon: '◈', labelKey: 'home.tab.style' },
  { key: 'color', icon: '◐', labelKey: 'home.tab.color' },
  { key: 'canvas', icon: '▢', labelKey: 'home.tab.canvas' },
];

const SHEET_TITLE_KEYS: Record<SheetContent, MessageKey> = {
  text: 'home.tab.text',
  font: 'home.tab.font',
  style: 'home.tab.style',
  color: 'home.tab.color',
  canvas: 'home.tab.canvas',
  export: 'home.export',
};

export const Home = () => {
  const t = useT();
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const size = useEditorStore((state) => state.size);
  const selectedBlock = useSelectedBlock();
  const removeBlock = useEditorStore((state) => state.removeBlock);
  const [sheetContent, setSheetContent] = useState<SheetContent | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  /** Zoom del preview, que lo mide el Stage al ajustar el lienzo al hueco. */
  const [zoomPct, setZoomPct] = useState(0);
  /**
   * Acuse de la exportación. Vive aquí y no en el ExportDialog porque este se
   * cierra justo al exportar: si el aviso fuese suyo, se iría con él.
   */
  const [toast, setToast] = useState<string | null>(null);

  const dimsLabel = `${size.width}×${size.height}`;
  const canvasLabel = zoomPct > 0 ? `${dimsLabel} · ${zoomPct}%` : dimsLabel;

  if (isDesktop) {
    return (
      <div className="flex h-full flex-col bg-canvas text-ink">
        <header className="flex h-14 flex-none items-center justify-between border-b border-line bg-panel px-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-ink font-display text-base leading-none text-accent-tint"
            >
              P
            </span>
            <span className="text-sm font-semibold">{t('home.appName')}</span>
            <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-muted">
              {t('home.badge')}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <span className="font-mono text-xs text-muted">{canvasLabel}</span>
            <Button variant="primary" onClick={() => setExportOpen(true)}>
              {t('home.export')}
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="w-[264px] flex-none overflow-y-auto border-r border-line bg-panel">
            <ImagePanel />
            <SizePanel />
            <LayerList layout="column" />
          </aside>
          <main className="flex min-w-0 flex-1 flex-col bg-stage">
            <Stage onZoomChange={setZoomPct} />
          </main>
          <aside className="flex w-[300px] flex-none flex-col divide-y divide-line-soft overflow-y-auto border-l border-line bg-panel">
            {selectedBlock ? (
              <>
                <TextPanel />
                <FontPanel />
                <StylePanel />
                <ColorPanel />
              </>
            ) : (
              <p className="p-10 text-center text-sm leading-relaxed text-muted">
                {t('panel.text.noSelection')}
              </p>
            )}
          </aside>
        </div>

        {exportOpen && (
          <ExportDialog
            presentation="modal"
            onClose={() => setExportOpen(false)}
            onExported={setToast}
          />
        )}
        <Toast message={toast} onHide={() => setToast(null)} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-stage text-ink">
      <header className="relative flex h-14 flex-none items-center justify-between border-b border-line bg-panel px-4">
        <LanguageSwitcher />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="text-sm font-semibold leading-tight">
            {t('home.screenTitle')}
          </div>
          <div className="font-mono text-[10px] text-muted">{dimsLabel}</div>
        </div>
        <Button variant="ghost" size="none" onClick={() => setSheetContent('export')}>
          {t('home.export')}
        </Button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <Stage />
      </main>

      <nav
        aria-label={t('home.tabs.label')}
        className="flex-none border-t border-line bg-panel"
      >
        <div className="flex">
          {HOME_TABS.map((tab) => {
            const active = sheetContent === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={active}
                onClick={() => setSheetContent(active ? null : tab.key)}
                className={`flex flex-1 flex-col items-center gap-1 py-2 ${
                  active ? 'text-accent-strong' : 'text-muted'
                }`}
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  {tab.icon}
                </span>
                <span className="text-[10px] font-medium">{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <Sheet
        open={sheetContent !== null}
        title={sheetContent ? t(SHEET_TITLE_KEYS[sheetContent]) : ''}
        onClose={() => setSheetContent(null)}
      >
        {sheetContent === 'text' && (
          <>
            <LayerList layout="row" />
            <TextPanel />
            {selectedBlock && (
              <div className="px-4 pb-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => removeBlock(selectedBlock.id)}
                  className="text-sm"
                >
                  {t('panel.layers.remove')}
                </Button>
              </div>
            )}
          </>
        )}
        {sheetContent === 'font' && <FontPanel />}
        {sheetContent === 'style' && <StylePanel />}
        {sheetContent === 'color' && <ColorPanel />}
        {sheetContent === 'canvas' && (
          <>
            <ImagePanel />
            <SizePanel />
          </>
        )}
        {sheetContent === 'export' && (
          <ExportDialog
            presentation="sheet"
            onClose={() => setSheetContent(null)}
            onExported={setToast}
          />
        )}
      </Sheet>

      <Toast message={toast} onHide={() => setToast(null)} />
    </div>
  );
};
