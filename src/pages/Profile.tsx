import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { useI18n } from '@/context/I18nContext'
import { useTheme } from '@/context/ThemeContext'
import { LOCALES, type Locale } from '@/lib/i18n'
import { THEME_PREFERENCES, type ThemePreference } from '@/lib/theme'
import type { TranslationKey } from '@/lib/i18n'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { MealSettings } from '@/components/profile/MealSettings'
import { BodyMetrics } from '@/components/profile/BodyMetrics'
import { WaterSettings } from '@/components/profile/WaterSettings'
import { AboutSection } from '@/components/profile/AboutSection'
import { DeleteAccount } from '@/components/profile/DeleteAccount'

const APPEARANCE_ICON: Record<ThemePreference, string> = {
  system: 'smartphone',
  light: 'light_mode',
  dark: 'nights_stay',
}

const APPEARANCE_LABEL: Record<ThemePreference, TranslationKey> = {
  system: 'profile.appearanceSystem',
  light: 'profile.appearanceLight',
  dark: 'profile.appearanceDark',
}

export default function Profile() {
  const { user, signOut, isAnonymous } = useAuth()
  const navigate = useNavigate()
  const { locale, setLocale, isLocaleExplicit, loading: profileLoading } = useProfile()
  const { preference: themePreference, setPreference } = useTheme()
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [savingLang, setSavingLang] = useState(false)
  const [langError, setLangError] = useState<string | null>(null)
  const [themeError, setThemeError] = useState<string | null>(null)

  async function handleSignOut() {
    setBusy(true)
    try {
      await signOut()
      // No session means the guard hands back a guest — the default state — so
      // land them on the dashboard rather than a login wall.
      navigate('/', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  async function handleAppearanceChange(next: ThemePreference) {
    setThemeError(null)
    try {
      await setPreference(next)
    } catch {
      setThemeError(t('profile.couldNotSaveAppearance'))
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

      <div className="flex flex-col gap-lg rounded-lens p-lg glass">
        <div className="flex items-center gap-md">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
            <Icon name="person" className="text-3xl" />
          </div>
          <div className="min-w-0">
            <p className="font-label-md text-label-md text-on-surface-variant">{t('profile.signedInAs')}</p>
            {/* Guests are the default entry point now, and they have no email
                — showing an empty line here would read as a bug. */}
            <p className="truncate font-headline-md text-headline-md text-on-surface">
              {isAnonymous || !user?.email ? t('profile.guestAccount') : user.email}
            </p>
          </div>
        </div>

        <hr className="border-surface-container-highest" />

        {/* Appearance. "System" is the absence of a choice, not a third scheme:
            picking it clears the stored preference so the app goes back to
            following prefers-color-scheme — the same shape as the language
            setting below, which treats a null column the same way. */}
        <div className="flex flex-col gap-sm">
          <div className="flex items-center gap-2">
            <Icon name="light_mode" className="text-[20px] text-on-surface-variant" />
            <span className="font-label-md text-label-md text-on-surface">
              {t('profile.appearanceLabel')}
            </span>
          </div>
          <p className="font-body-md text-sm text-on-surface-variant">
            {t('profile.appearanceDescription')}
          </p>
          <div
            role="radiogroup"
            aria-label={t('profile.appearanceLabel')}
            className="flex gap-1 rounded-full glass-chip p-1"
          >
            {THEME_PREFERENCES.map((option) => {
              const active = themePreference === option
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => handleAppearanceChange(option)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 font-label-md text-label-md transition-colors ${
                    active
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface-variant hover:bg-[color:var(--glass-chip-hover)]'
                  }`}
                >
                  <Icon name={APPEARANCE_ICON[option]} className="text-[18px]" />
                  {t(APPEARANCE_LABEL[option])}
                </button>
              )
            })}
          </div>
          {themeError && <p className="font-label-md text-label-md text-error">{themeError}</p>}
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
              className="h-[48px] w-full appearance-none rounded-[16px] glass-field px-4 pr-10 font-body-md text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
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

        {/* Hydration goal (empty = derived from bodyweight) */}
        <WaterSettings />

        <hr className="border-surface-container-highest" />

        {/* Meals: names, how many there are, and their order */}
        <MealSettings />

        <hr className="border-surface-container-highest" />

        {/* Terms, Privacy Policy, support contact and the health disclaimer —
            all four are store submission requirements, not garnish. */}
        <AboutSection />

        <hr className="border-surface-container-highest" />

        {/* A guest has no account to sign out of — the useful action is signing
            into an existing one (which opens over the guest session). Real
            accounts keep the sign-out, which now returns to guest mode. */}
        {isAnonymous ? (
          <button
            onClick={() => navigate('/signin')}
            className="flex min-h-[48px] items-center justify-center gap-sm rounded-full font-label-md text-label-md text-on-surface transition-all hover:brightness-[1.06] glass-field active:scale-95"
          >
            <Icon name="login" className="text-[20px]" />
            {t('auth.signInAction')}
          </button>
        ) : (
          <button
            onClick={handleSignOut}
            disabled={busy}
            className="flex min-h-[48px] items-center justify-center gap-sm rounded-full bg-error-container font-label-md text-label-md text-on-error-container transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
          >
            {busy ? <Spinner className="h-4 w-4" /> : <Icon name="logout" className="text-[20px]" />}
            {t('profile.signOut')}
          </button>
        )}

        <hr className="border-surface-container-highest" />

        {/* Apple 5.1.1(v): an app that creates accounts must delete them from
            inside the app. Offered to guests too — a guest account holds the
            same logs. Last on the page, behind a confirmation, as its
            destructiveness deserves. */}
        <DeleteAccount />
      </div>
    </div>
  )
}
