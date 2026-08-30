import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { useI18n } from '@/context/I18nContext'
import { useTheme } from '@/context/ThemeContext'
import { useEntitlement } from '@/context/EntitlementContext'
import { LOCALES, type Locale } from '@/lib/i18n'
import { THEME_PREFERENCES, type ThemePreference } from '@/lib/theme'
import { radioTabIndex, useRadioGroupKeys } from '@/hooks/useRadioGroupKeys'
import type { TranslationKey } from '@/lib/i18n'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { MealSettings } from '@/components/profile/MealSettings'
import { BodyMetrics } from '@/components/profile/BodyMetrics'
import { WaterSettings } from '@/components/profile/WaterSettings'
import { HydrationReminders } from '@/components/profile/HydrationReminders'
import { ProSubscription } from '@/components/profile/ProSubscription'
import { DataExport } from '@/components/profile/DataExport'
import { DataSources } from '@/components/profile/DataSources'
import { AboutSection } from '@/components/profile/AboutSection'
import { DeleteAccount } from '@/components/profile/DeleteAccount'
import { useRefreshHandler } from '@/hooks/useRefreshHandler'

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
  const { refetch: refetchEntitlement } = useEntitlement()
  const navigate = useNavigate()
  const { locale, setLocale, isLocaleExplicit, loading: profileLoading } = useProfile()
  const { preference: themePreference, setPreference } = useTheme()
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [savingLang, setSavingLang] = useState(false)
  const [langError, setLangError] = useState<string | null>(null)
  const [themeError, setThemeError] = useState<string | null>(null)

  // Everything else on this page is a local preference the user just set. What
  // a pull is for here is the subscription: it is decided by the store, and it
  // changes without the app being told — a renewal that went through, a
  // billing problem that got fixed on another device.
  useRefreshHandler(refetchEntitlement)

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

  const appearanceKeys = useRadioGroupKeys(THEME_PREFERENCES, handleAppearanceChange)

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
            {/* Wraps rather than truncating: this is the one place the app tells
                you which account you are in, and "sam@exa…" — which is what a
                large text size turned it into — does not answer that. `break-all`
                because an email has no spaces to break at. */}
            <p className="break-all font-headline-md text-headline-md text-on-surface">
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
            <Icon name="light_mode" className="text-[1.25rem] text-on-surface-variant" />
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
            onKeyDown={appearanceKeys}
            // `flex-wrap` + a basis rather than a bare `flex-1`: three labelled
            // options do not fit a phone's width at a large text size, and
            // `flex-1` alone let them push past the card's right edge instead of
            // moving to a second row. `rounded-2xl` because a wrapped row of
            // pills inside a pill reads as a mistake.
            className="flex flex-wrap gap-1 rounded-2xl glass-chip p-1"
          >
            {THEME_PREFERENCES.map((option) => {
              const active = themePreference === option
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={radioTabIndex(active)}
                  onClick={() => handleAppearanceChange(option)}
                  className={`flex min-w-0 flex-1 basis-[6rem] items-center justify-center gap-1.5 rounded-full px-2 py-2.5 font-label-md text-label-md transition-colors ${
                    active
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface-variant hover:bg-(--glass-chip-hover)'
                  }`}
                >
                  <Icon name={APPEARANCE_ICON[option]} className="text-[1.125rem]" />
                  {t(APPEARANCE_LABEL[option])}
                </button>
              )
            })}
          </div>
          {themeError && <p role="alert" className="font-label-md text-label-md text-error">{themeError}</p>}
        </div>

        <hr className="border-surface-container-highest" />

        {/* App + food database language (single preference) */}
        <div className="flex flex-col gap-sm">
          <div className="flex items-center gap-2">
            <Icon name="translate" className="text-[1.25rem] text-on-surface-variant" />
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
              <Icon name="smartphone" className="text-[1rem]" />
              {t('profile.languageFollowsDevice')}
            </p>
          )}
          <div className="relative">
            <select
              id="locale"
              value={locale}
              disabled={profileLoading || savingLang}
              onChange={(e) => handleLanguageChange(e.target.value as Locale)}
              className="min-h-2xl w-full appearance-none rounded-[16px] glass-field px-4 pr-10 font-body-md text-body-md text-on-surface outline-hidden transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
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
            <p role="alert" className="font-label-md text-label-md text-error">
              {langError}
            </p>
          )}
        </div>

        <hr className="border-surface-container-highest" />

        {/* Body + goal: the inputs an energy estimate needs */}
        <BodyMetrics />

        <hr className="border-surface-container-highest" />

        {/* Hydration goal (empty = derived from bodyweight) */}
        <WaterSettings />

        <hr className="border-surface-container-highest" />

        {/* Reminders against that goal — Pro, and native-only in practice */}
        <HydrationReminders />

        <hr className="border-surface-container-highest" />

        {/* Meals: names, how many there are, and their order */}
        <MealSettings />

        <hr className="border-surface-container-highest" />

        {/* Subscription status, restore, and the store's own manage link. Above
            the export because a lapsed subscriber looking for either one is
            really looking for this. */}
        <ProSubscription />

        <hr className="border-surface-container-highest" />

        {/* Take everything with you — Pro */}
        <DataExport />

        <hr className="border-surface-container-highest" />

        {/* Attribution for the national food-composition tables. The open
            licences they ship under require the source and edition to be stated
            wherever the data is reused, so this is an obligation, not credits. */}
        <DataSources />

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
            className="flex min-h-2xl items-center justify-center gap-sm rounded-full font-label-md text-label-md text-on-surface transition-all hover:brightness-[1.06] glass-field active:scale-95"
          >
            <Icon name="login" className="text-[1.25rem]" />
            {t('auth.signInAction')}
          </button>
        ) : (
          <button
            onClick={handleSignOut}
            disabled={busy}
            className="flex min-h-2xl items-center justify-center gap-sm rounded-full bg-error-container font-label-md text-label-md text-on-error-container transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
          >
            {busy ? <Spinner className="h-4 w-4" /> : <Icon name="logout" className="text-[1.25rem]" />}
            {t('profile.signOut')}
          </button>
        )}

        {/* Apple 5.1.1(v): an app that creates accounts must delete them from
            inside the app. Registered accounts only — a guest never created
            one, has no credentials to revoke and nothing to sign back into, so
            the section (and its rule) are dropped rather than left showing an
            irreversible button for an account that does not exist yet. Last on
            the page, behind a confirmation, as its destructiveness deserves. */}
        {!isAnonymous && (
          <>
            <hr className="border-surface-container-highest" />
            <DeleteAccount />
          </>
        )}
      </div>
    </div>
  )
}
