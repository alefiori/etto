import { useState } from 'react'
import { useI18n } from '@/context/I18nContext'
import { useEntitlement } from '@/context/EntitlementContext'
import { useAppShell } from '@/context/AppShellContext'
import { ProGate } from '@/components/paywall/ProGate'
import { ProBadge } from '@/components/paywall/ProBadge'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { buildExportFile, collectExport, deliverExport, type ExportFormat } from '@/lib/exportData'

const FORMATS: { format: ExportFormat; icon: string; labelKey: 'export.csvLabel' | 'export.jsonLabel'; hintKey: 'export.csvHint' | 'export.jsonHint' }[] = [
  { format: 'csv', icon: 'table_view', labelKey: 'export.csvLabel', hintKey: 'export.csvHint' },
  { format: 'json', icon: 'data_object', labelKey: 'export.jsonLabel', hintKey: 'export.jsonHint' },
]

/**
 * Export everything, as a spreadsheet or as the complete record.
 *
 * Both formats read the same bundle and differ only in shape, so the choice is
 * two buttons rather than a picker plus a confirm — the whole interaction is one
 * tap, which is what it should be for something that takes nothing away.
 *
 * The outcome is reported rather than assumed: "downloaded" and "shared" are
 * different events on different platforms, and a dismissed share sheet is
 * neither a success nor an error.
 */
export function DataExport() {
  const { t } = useI18n()
  const { isPro } = useEntitlement()
  const { openPaywall } = useAppShell()
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isPro) {
    return (
      <ProGate
        title={t('export.description')}
        label={t('export.title')}
        icon="download"
        onUpgrade={openPaywall}
      >
        {null}
      </ProGate>
    )
  }

  async function run(format: ExportFormat) {
    setNotice(null)
    setError(null)
    setBusy(format)
    try {
      const bundle = await collectExport()
      const outcome = await deliverExport(buildExportFile(bundle, format))
      if (outcome === 'downloaded') setNotice(t('export.downloaded'))
      else if (outcome === 'shared') setNotice(t('export.shared'))
    } catch {
      setError(t('export.failed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="download" className="text-[1.25rem] text-on-surface-variant" />
        <h3 className="font-label-md text-label-md text-on-surface">{t('export.title')}</h3>
        <ProBadge />
      </div>
      <p className="font-body-md text-sm text-on-surface-variant">{t('export.description')}</p>

      {error && (
        <p role="alert" className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg glass-chip px-md py-sm font-label-md text-label-md text-on-surface"
        >
          {notice}
        </p>
      )}

      <div className="flex flex-col gap-sm sm:flex-row">
        {FORMATS.map(({ format, icon, labelKey, hintKey }) => (
          <button
            key={format}
            type="button"
            disabled={busy !== null}
            onClick={() => run(format)}
            className="flex flex-1 items-center gap-sm rounded-[16px] glass-field px-md py-sm text-left transition-all hover:border-primary active:scale-98 disabled:opacity-50"
          >
            {busy === format ? (
              <Spinner className="h-5 w-5 shrink-0 text-primary" />
            ) : (
              <Icon name={icon} className="shrink-0 text-[1.25rem] text-primary" />
            )}
            <span className="min-w-0">
              <span className="block font-label-md text-label-md text-on-surface">{t(labelKey)}</span>
              <span className="block font-body-md text-sm text-on-surface-variant">
                {t(hintKey)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
