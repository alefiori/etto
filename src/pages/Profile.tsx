import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { useI18n } from '@/context/I18nContext'
import { LOCALES, type Locale } from '@/lib/i18n'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { MealSettings } from '@/components/profile/MealSettings'
import { BodyMetrics } from '@/components/profile/BodyMetrics'

export default function Profile() {
  const { user, signOut } = useAuth()
  const { locale, setLocale, isLocaleExplicit, loading: profileLoading } = useProfile()
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [savingLang, setSavingLang] = useState(false)
  const [langError, setLangError] = useState<string | null>(null)

  async function handleSignOut() {
    setBusy(true)
    try {
      await signOut()
    } finally {
      setBusy(false)
    }
  }

  async function handleLanguageChange(code: Locale) {
    setLangError(null)
    setSavingLang(true)
    try {
      await setLocale(code)
    } catch {
      setLangError(t('profile.couldNotSaveLanguage'))
    } finally {
      setSavingLang(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-lg px-container-margin-mobile py-lg md:px-container-margin-desktop md:py-xl">
      <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-lg md:text-headline-lg">
        {t('profile.title')}
      </h2>

      <div className="flex flex-col gap-lg rounded-2xl bg-surface-container-lowest p-lg shadow-card">
        <div className="flex items-center gap-md">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
            <Icon name="person" className="text-3xl" />
          </div>
          <div className="min-w-0">
            <p className="font-label-md text-label-md text-on-surface-variant">{t('profile.signedInAs')}</p>
            <p className="truncate font-headline-md text-headline-md text-on-surface">{user?.email}</p>
          </div>
        </div>

        <hr className="border-surface-container-highest" />

        {/* App + food database language (single preference) */}
        <div className="flex flex-col gap-sm">
          <div className="flex items-center gap-2">
            <Icon name="translate" className="text-[20px] text-on-surface-variant" />
            <label
              htmlFor="locale"
              className="font-label-md text-label-md text-on-surface"
            >
              {t('profile.languageLabel')}
            </label>
          </div>
          <p className="font-body-md text-sm text-on-surface-variant">
            {t('profile.languageDescription')}
          </p>
          {!profileLoading && !isLocaleExplicit && (
            <p className="flex items-center gap-1 font-label-md text-label-md text-on-surface-variant">
              <Icon name="smartphone" className="text-[16px]" />
              {t('profile.languageFollowsDevice')}
            </p>
          )}
          <div className="relative">
            <select
              id="locale"
              value={locale}
              disabled={profileLoading || savingLang}
              onChange={(e) => handleLanguageChange(e.target.value as Locale)}
              className="h-[48px] w-full appearance-none rounded-lg border border-outline-variant bg-surface px-4 pr-10 font-body-md text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
            >
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            {savingLang ? (
              <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
            ) : (
              <Icon
                name="expand_more"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-outline"
              />
            )}
          </div>
          {langError && (
            <p className="font-label-md text-label-md text-error">{langError}</p>
          )}
        </div>

        <hr className="border-surface-container-highest" />

        {/* Body + goal: the inputs an energy estimate needs */}
        <BodyMetrics />

        <hr className="border-surface-container-highest" />

        {/* Meals: names, how many there are, and their order */}
        <MealSettings />

        <hr className="border-surface-container-highest" />

        <button
          onClick={handleSignOut}
          disabled={busy}
          className="flex min-h-[48px] items-center justify-center gap-sm rounded-full bg-error-container font-label-md text-label-md text-on-error-container transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
        >
          {busy ? <Spinner className="h-4 w-4" /> : <Icon name="logout" className="text-[20px]" />}
          {t('profile.signOut')}
        </button>
      </div>
    </div>
  )
}
