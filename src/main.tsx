import { StrictMode, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary'
import { bootstrapNative } from './lib/nativeBootstrap'
import { initTextScale } from './lib/textScale'
import { SUPPORT_URL } from './lib/legal'
import './index.css'

// Before the first render, so the app lays out at the reader's text size rather
// than laying out at 1× and reflowing. Synchronous and cheap — it measures a
// few throwaway spans. A no-op on the web, where `rem` already follows the
// browser's default-font setting; on iOS and Android it is the only way a
// WebView learns the OS setting at all. See lib/textScale.ts.
initTextScale()

// No-op on the web; sets up the status bar, keyboard, hardware back button and
// splash screen in the native shell. Not awaited — React should paint as soon
// as it can, and every step inside degrades to nothing on failure.
void bootstrapNative()

const container = document.getElementById('root')!

/**
 * The last-resort screen.
 *
 * Both users of it below are cases where the thing that failed might *be* the
 * thing that renders — a context provider, the locale catalogs, the shared
 * chunk — so it leans on nothing but inline styles. The colours are CSS
 * variables with literal fallbacks, so it stays legible whether or not
 * index.css loaded, and in either scheme (index.html's pre-paint script has
 * already put `.dark` on <html> by the time anything here runs).
 *
 * English, hardcoded, on purpose: reaching for `t()` would mean depending on
 * the provider that serves it, and a boundary that needs the app to be working
 * is not a boundary.
 *
 * The style objects are shared by both renderers below — `Object.assign` onto a
 * CSSStyleDeclaration takes the same camelCase keys React does.
 */
const S = {
  panel: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    padding: '24px',
    textAlign: 'center',
    fontFamily: 'system-ui, sans-serif',
    color: 'rgb(var(--on-surface, 30 33 27))',
  },
  title: { margin: '0', fontSize: '1.375rem', fontWeight: '700' },
  body: {
    margin: '0',
    maxWidth: '26rem',
    fontSize: '0.9375rem',
    lineHeight: '1.5',
    color: 'rgb(var(--on-surface-variant, 84 93 79))',
  },
  button: {
    minHeight: '48px',
    padding: '12px 24px',
    border: '0',
    borderRadius: '16px',
    cursor: 'pointer',
    font: 'inherit',
    fontWeight: '600',
    color: '#fff',
    background: 'rgb(var(--primary, 79 116 88))',
  },
  link: {
    fontSize: '0.875rem',
    color: 'rgb(var(--on-surface-variant, 84 93 79))',
    textUnderlineOffset: '3px',
  },
} satisfies Record<string, CSSProperties>

const CRASH_TITLE = 'Something went wrong'
const CRASH_BODY = 'Etto hit an unexpected problem and had to stop. Reloading usually fixes it.'

/** The panel as JSX, for the root boundary — React is alive there. */
function StaticPanel({ title, body }: { title: string; body: string }) {
  // `role="alert"` per the app's convention for errors; see the README.
  return (
    <div role="alert" style={S.panel}>
      <h1 style={S.title}>{title}</h1>
      <p style={S.body}>{body}</p>
      <button type="button" style={S.button} onClick={() => location.reload()}>
        Reload
      </button>
      <a href={SUPPORT_URL} style={S.link}>
        Email support
      </a>
    </div>
  )
}

/** The same panel as plain DOM, for the case where React never loaded. */
function renderPanel(title: string, body: string) {
  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    style: CSSProperties,
    text: string,
  ) => {
    const el = document.createElement(tag)
    Object.assign(el.style, style)
    el.textContent = text
    return el
  }

  const panel = make('div', S.panel, '')
  panel.setAttribute('role', 'alert')

  const reload = make('button', S.button, 'Reload')
  reload.type = 'button'
  reload.addEventListener('click', () => location.reload())

  const support = make('a', S.link, 'Email support')
  support.href = SUPPORT_URL

  panel.append(make('h1', S.title, title), make('p', S.body, body), reload, support)
  container.replaceChildren(panel)
}

/**
 * Start the app.
 *
 * The root module is imported dynamically so that a module which throws while
 * it is being *evaluated* is catchable at all. `src/lib/supabase.ts` is the one
 * that does: it throws when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are
 * missing, which is deliberate — a build with no backend should fail loudly
 * rather than ship a client pointed at nothing — but it fires before React
 * exists, so no error boundary can reach it. A static `import App from './App'`
 * would take main.tsx down with it and leave a blank white document.
 */
async function boot() {
  try {
    const { default: App } = await import('./App')
    createRoot(container).render(
      <StrictMode>
        {/*
          Outside every provider, so a provider that throws while mounting is
          caught too — ThemeProvider and I18nProvider both do real work on
          mount, and a crash in either would otherwise be a white page. Its
          fallback is the context-free panel for the same reason.
        */}
        <ErrorBoundary
          label="root"
          fallback={() => <StaticPanel title={CRASH_TITLE} body={CRASH_BODY} />}
        >
          <App />
        </ErrorBoundary>
      </StrictMode>,
    )
  } catch (error) {
    console.error('[boot] the app failed to load', error)
    renderPanel(
      "Etto can't start",
      'This copy of the app is missing part of its configuration, so it could not ' +
        'load. If reloading does not help, please let us know.',
    )
  }
}

void boot()
