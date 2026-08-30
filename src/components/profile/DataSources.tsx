import { useI18n } from '@/context/I18nContext'
import { Icon } from '@/components/ui/Icon'
import { SettingsIcon } from '@/components/profile/SettingsIcon'
import { SOURCE_ATTRIBUTION } from '@/lib/foodSources'

/**
 * The full attribution notice for the food-composition tables the app ships.
 *
 * The per-result source chip covers "clear indication of source" where a food is
 * actually used; this is the place that names the dataset, its edition and its
 * licence, which is what the Etalab and Open Government licences require of
 * anyone redistributing the data.
 *
 * The dataset names and licences are intentionally untranslated — see
 * SOURCE_ATTRIBUTION.
 */
export function DataSources() {
  const { t } = useI18n()
  const entries = Object.values(SOURCE_ATTRIBUTION).filter((e) => !!e)

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center gap-2">
        <SettingsIcon name="table_view" />
        <h3 className="font-label-md text-label-md text-on-surface">{t('dataSources.title')}</h3>
      </div>

      <p className="px-2 font-body-md text-sm text-on-surface-variant">
        {t('dataSources.description')}
      </p>

      <ul className="flex flex-col gap-2">
        {entries.map((e) => (
          <li key={e.url} className="rounded-lg glass-chip px-md py-sm">
            <a
              href={e.url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-start justify-between gap-sm"
            >
              <span className="flex flex-col gap-0.5">
                <span className="font-body-md text-sm text-on-surface">
                  {e.label} ({e.version})
                </span>
                <span className="font-label-md text-label-md text-on-surface-variant">
                  {e.license}
                </span>
              </span>
              <Icon
                name="open_in_new"
                className="shrink-0 text-[1.125rem] text-on-surface-variant"
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
