/**
 * CONTRATO · ExportDialog (diálogo de exportación)
 * ------------------------------------------------
 * Permite elegir el formato de salida (PNG/JPEG/WebP/PDF), muestra la
 * resolución real y lanza la descarga SIN pérdida de calidad respecto al
 * original.
 *
 * Cómo lo hace:
 *  - Lee `size`, `exportFormat` y `exportQuality` del store; el formato y la
 *    calidad son del proyecto, no de la pantalla, así que se guardan allí.
 *  - Al exportar: espera a `document.fonts.ready` (si no, el canvas pintaría
 *    con una fuente de sustitución y la portada saldría con otra tipografía),
 *    llama a core/renderToCanvas (resolución real) → core/exporters (formato) →
 *    entrega el Blob vía platform/files (web: descarga; nativo: Capacitor).
 *  - El acuse de recibo no es suyo: avisa con `onExported` y quien lo monta
 *    enseña el Toast, porque al exportar este componente se cierra.
 *
 * Dos formas, un solo componente: en escritorio se presenta como MODAL centrado
 * (con su fondo oscuro y sus botones Cancelar/Descargar) y en móvil como el
 * CONTENIDO de la hoja inferior, que ya trae su propio cierre. Solo cambia el
 * envoltorio; los controles y la lógica de exportar son los mismos, que es la
 * razón de no partirlo en dos componentes.
 */

import { useState } from 'react';
import { exportCanvas, extensionOf } from '@/core/exporters';
import { renderToCanvas } from '@/core/renderToCanvas';
import type { MessageKey } from '@/i18n/messages';
import { useT } from '@/i18n/useI18n';
import { saveFile } from '@/platform/files';
import { Button } from '@/sharedComponents/Button';
import { Slider } from '@/sharedComponents/Slider';
import { useEditorStore } from '@/store/editorStore';
import type { ExportFormat } from '@/types/editor';

const FORMATS: { value: ExportFormat; descriptionKey: MessageKey }[] = [
  { value: 'PNG', descriptionKey: 'export.desc.png' },
  { value: 'JPEG', descriptionKey: 'export.desc.jpeg' },
  { value: 'WebP', descriptionKey: 'export.desc.webp' },
  { value: 'PDF', descriptionKey: 'export.desc.pdf' },
];

/** Formatos con calidad ajustable: los demás no pierden nada que regular. */
const LOSSY_FORMATS: ExportFormat[] = ['JPEG', 'WebP'];

export interface ExportDialogProps {
  /** 'modal' en escritorio; 'sheet' cuando va dentro de la hoja inferior. */
  presentation: 'modal' | 'sheet';
  onClose: () => void;
  /** Exportación terminada, con el aviso ya compuesto y traducido. */
  onExported: (message: string) => void;
}

export const ExportDialog = ({ presentation, onClose, onExported }: ExportDialogProps) => {
  const t = useT();
  const blocks = useEditorStore((state) => state.blocks);
  const image = useEditorStore((state) => state.image);
  const size = useEditorStore((state) => state.size);
  const format = useEditorStore((state) => state.exportFormat);
  const quality = useEditorStore((state) => state.exportQuality);
  const setExportFormat = useEditorStore((state) => state.setExportFormat);
  const setExportQuality = useEditorStore((state) => state.setExportQuality);

  const [working, setWorking] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  const runExport = async () => {
    setWorking(true);
    setError(null);
    try {
      await document.fonts.ready;
      const canvas = await renderToCanvas({ blocks, image, size });
      const blob = await exportCanvas(canvas, format, quality / 100);
      await saveFile(blob, `${t('export.fileName')}.${extensionOf(format)}`);
      onExported(`${t('export.done')} ${format} · ${size.width}×${size.height} px`);
      onClose();
    } catch {
      // El motivo del fallo (imagen ilegible, formato no soportado, memoria) no
      // le sirve de nada a quien exporta: lo accionable es volver a intentarlo.
      setError('export.failed');
    } finally {
      setWorking(false);
    }
  };

  const body = (
    <>
      <p className="mb-3.5 text-[12.5px] text-muted">
        {t('export.resolution')}{' '}
        <span className="font-mono text-accent-strong">
          {size.width}×{size.height} px
        </span>{' '}
        · 300 DPI
      </p>

      {presentation === 'modal' && (
        <p className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          {t('export.format')}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {FORMATS.map((option) => (
          <Button
            key={option.value}
            size="none"
            isActive={format === option.value}
            onClick={() => setExportFormat(option.value)}
            className="px-3 py-2.5 text-left"
          >
            <span className="block text-[13.5px] font-semibold text-ink">{option.value}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-muted">
              {t(option.descriptionKey)}
            </span>
          </Button>
        ))}
      </div>

      {LOSSY_FORMATS.includes(format) && (
        <div className="mt-4">
          <Slider
            label={t('export.quality')}
            value={quality}
            min={40}
            max={100}
            step={1}
            valueLabel={`${quality}%`}
            onChange={setExportQuality}
          />
        </div>
      )}

      {presentation === 'modal' && (
        <div className="mt-4 flex items-center gap-2.5 rounded-[9px] bg-accent-tint px-3.5 py-3">
          <span aria-hidden="true" className="text-[15px] text-accent-strong">
            ◆
          </span>
          <p className="text-[11.5px] leading-relaxed text-muted">{t('export.info')}</p>
        </div>
      )}

      {error && <p className="mt-2.5 text-[11.5px] text-danger">{t(error)}</p>}
    </>
  );

  const downloadLabel = `${t(working ? 'export.working' : 'export.download')} ${
    working ? '' : format
  }`.trim();

  if (presentation === 'sheet') {
    return (
      <section data-panel="export" className="pb-2">
        {body}
        <Button
          variant="primary"
          onClick={runExport}
          disabled={working}
          className="mt-4 w-full py-3.5 text-[15px] disabled:opacity-60"
        >
          {downloadLabel}
        </Button>
      </section>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/50 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <section
        data-panel="export"
        role="dialog"
        aria-modal="true"
        aria-label={t('export.title')}
        // El clic de dentro no debe cerrar: el fondo es el único que cierra.
        onMouseDown={(event) => event.stopPropagation()}
        className="w-[440px] max-w-[92vw] overflow-hidden rounded-2xl bg-panel shadow-[0_30px_80px_rgba(0,0,0,0.4)]"
      >
        <header className="border-b border-line-soft px-5.5 pb-4 pt-5">
          <h2 className="text-base font-semibold text-ink">{t('export.title')}</h2>
        </header>

        <div className="px-5.5 py-4.5">{body}</div>

        <div className="flex gap-2.5 px-5.5 pb-5">
          <Button onClick={onClose} className="flex-none px-4 py-2.5 text-[13px] text-ink-soft">
            {t('export.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={runExport}
            disabled={working}
            className="flex-1 py-2.5 text-[13.5px] disabled:opacity-60"
          >
            {downloadLabel}
          </Button>
        </div>
      </section>
    </div>
  );
};
