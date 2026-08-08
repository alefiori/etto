/**
 * Light/dark theme resolution and application.
 *
 * The whole scheme lives in CSS variables (src/index.css); the only thing this
 * module decides is whether the `dark` class is on <html>. It deliberately
 * mirrors the language preference in lib/i18n: an explicit choice is stored,
 * an absent choice means "follow the device", and the stored value is mirrored
 * to local storage so the pre-login screens and the very first paint can read
 * it before any profile has loaded.
 */

/** What the user picked. `system` is the absence of a choice. */
export type ThemePreference = 'system' | 'light' | 'dark'

/** What actually gets rendered once `system` has been resolved. */
export type ResolvedTheme = 'light' | 'dark'

export const THEME_PREFERENCES: ThemePreference[] = ['system', 'light', 'dark']

export function isThemePreference(value: string): value is ThemePreference {
  return (THEME_PREFERENCES as string[]).includes(value)
}

/**
 * Where an explicit choice is mirrored locally.
 *
 * Nothing is stored for `system`: an empty slot is what makes the device the
 * first-run default, and it has to stay empty for the device to keep winning.
 * Kept in sync with the inline bootstrap script in index.html, which reads this
 * same key before React mounts to avoid a flash of the wrong theme.
 */
const THEME_STORAGE_KEY = 'macrotrack.theme'

export function getStoredTheme(): ThemePreference | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored && isThemePreference(stored) ? stored : null
  } catch {
    return null // Storage can be unavailable (private mode, blocked cookies).
  }
}

export function storeTheme(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Not fatal: the choice still applies for this session.
  }
}

export function clearStoredTheme(): void {
  storeTheme('system')
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** The device's current scheme. Light when the platform can't say. */
export function detectDeviceTheme(): ResolvedTheme {
  try {
    return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? detectDeviceTheme() : preference
}

/**
 * Subscribe to device scheme changes. Only meaningful while the preference is
 * `system`; the caller is responsible for not listening otherwise.
 */
export function watchDeviceTheme(onChange: (theme: ResolvedTheme) => void): () => void {
  let media: MediaQueryList
  try {
    media = window.matchMedia(DARK_QUERY)
  } catch {
    return () => {}
  }
  const handler = (e: MediaQueryListEvent) => onChange(e.matches ? 'dark' : 'light')
  media.addEventListener('change', handler)
  return () => media.removeEventListener('change', handler)
}

/**
 * The browser-chrome color for each scheme — the address bar on Android, the
 * status bar in the installed PWA and the native shell.
 *
 * These are the *chrome* surfaces rather than the page: light keeps the top bar
 * on `surface`, dark lifts it to `surface-container-low`, one step above the
 * page, the same way the sidebar sits above the page in both.
 */
export const CHROME_COLOR: Record<ResolvedTheme, string> = {
  light: '#f8f9ff',
  dark: '#17223a',
}

/** The theme currently on the document, whoever put it there. */
export function documentTheme(): ResolvedTheme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/**
 * Put a resolved theme on the document: the `dark` class Tailwind's variants
 * key off, plus the meta tag browsers read for their own chrome.
 *
 * Safe to call before React mounts — index.html calls the same logic inline.
 */
export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme

  // By id, not by name: vite-plugin-pwa appends a second theme-color meta from
  // the manifest's brand color. See the tag's comment in index.html.
  const meta = document.getElementById('app-theme-color')
  if (meta) meta.setAttribute('content', CHROME_COLOR[theme])
}
