import { useI18n } from '@/context/I18nContext'
import { Icon } from '@/components/ui/Icon'
import { SettingsIcon } from '@/components/profile/SettingsIcon'
import { PRIVACY_URL, SUPPORT_EMAIL, SUPPORT_URL, TERMS_URL } from '@/lib/legal'

/**
 * The documents and the disclaimer, in the one place a user goes looking.
 *
 * All three are submission requirements rather than decoration. Both stores
 * want the Terms and the Privacy Policy reachable from inside the app, not only
 * from the listing; both want a support contact; and an app that turns
 * bodyweight into calorie targets needs to say plainly that it is not medical
 * advice (the Body & goal card says so about its own estimate — this says it
 * about the app).
 *
 * The links open externally rather than rendering the documents in-app: the
 * canonical copies are the static pages the stores and regulators are pointed
 * at, and a second in-app copy would be a second thing to keep in sync.
 */
export function AboutSection() {
  const { t } = useI18n()

  const linkClass =
    'flex min-h-2xl items-center justify-between gap-sm rounded-lg px-2 font-body-md text-body-md text-on-surface transition-colors hover:bg-(--glass-chip-hover)'

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center gap-2">
        <SettingsIcon name="info" />
        <h3 className="font-label-md text-label-md text-on-surface">{t('about.title')}</h3>
      </div>

      <p className="rounded-lg glass-chip px-md py-sm font-body-md text-sm text-on-surface-variant">
        {t('about.disclaimer')}
      </p>

      <ul className="flex flex-col">
        {[
          { href: TERMS_URL, label: t('auth.terms'), icon: 'gavel' },
          { href: PRIVACY_URL, label: t('auth.privacyPolicy'), icon: 'shield' },
        ].map((link) => (
          <li key={link.href}>
            <a href={link.href} target="_blank" rel="noreferrer noopener" className={linkClass}>
              <span className="flex items-center gap-sm">
                <Icon name={link.icon} className="text-[1.125rem] text-on-surface-variant" />
                {link.label}
              </span>
              <Icon name="open_in_new" className="text-[1.125rem] text-on-surface-variant" />
            </a>
          </li>
        ))}
        <li>
          <a href={SUPPORT_URL} className={linkClass}>
            <span className="flex items-center gap-sm">
              <Icon name="mail" className="text-[1.125rem] text-on-surface-variant" />
              {t('about.support')}
            </span>
            <span className="truncate font-label-md text-label-md text-on-surface-variant">
              {SUPPORT_EMAIL}
            </span>
          </a>
        </li>
      </ul>

      <p className="px-2 font-label-md text-label-md text-outline">
        {t('about.version', { version: __APP_VERSION__ })}
      </p>
    </div>
  )
}
