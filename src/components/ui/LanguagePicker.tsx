import { useState } from 'react'
import { useProfile } from '@/context/ProfileContext'
import { useI18n } from '@/context/I18nContext'
import { LOCALES, type Locale } from '@/lib/i18n'
import { Icon } from '@/components/ui/Icon'

/**
 * Compact language switcher for the pre-login screens. Signed out there is no
 * profile row to write to, so the choice is remembered locally and carried into
 * the account at sign-up; signed in it saves to the profile like the picker on
 * the Profile page.
 */
export function LanguagePicker({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useProfile()
  const { t } = useI18n()
  const [saving, setSaving] = useState(false)

  async function handleChange(code: Locale) {
    setSaving(true)
    try {
      await setLocale(code)
    } catch {
      // The optimistic update is rolled back by the provider; nothing to show
      // on an auth screen beyond the picker snapping back.
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <Icon
        name="translate"
        className="pointer-events-none absolute left-2 text-[18px] text-on-surface-variant"
      />
      <select
        aria-label={t('common.language')}
        value={locale}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value as Locale)}
        className="h-9 appearance-none rounded-full glass-field pl-8 pr-7 font-label-md text-label-md text-on-surface outline-hidden transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
      <Icon
        name="expand_more"
        className="pointer-events-none absolute right-1.5 text-[18px] text-outline"
      />
    </div>
  )
}
