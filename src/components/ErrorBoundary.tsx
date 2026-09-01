import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useI18n } from '@/context/I18nContext'
import { Icon } from '@/components/ui/Icon'
import { SUPPORT_URL } from '@/lib/legal'

/**
 * Does this error mean "the JavaScript for that screen never arrived"?
 *
 * Worth telling apart from a genuine crash, because it is the one failure the
 * user can actually fix and the one this app hits most: every route and the
 * barcode scanner are `lazy()`, a deploy replaces the hashed chunk filenames,
 * and a tab left open across a deploy — or one holding a stale service-worker
 * manifest — asks for a file that is no longer there. Nothing is broken; the
 * page is just old. "Reload" is a real fix, and "something went wrong" would be
 * a lie.
 *
 * Three shapes, because the engines disagree and Vite adds one of its own:
 *  - `ChunkLoadError` — the name webpack/Rollup's loader gives it, and what
 *    Vite's `preload-helper` re-throws for a failed `link rel=modulepreload`.
 *  - "Failed to fetch dynamically imported module" — Chromium and Vite's own
 *    `vite:preloadError` payload.
 *  - "error loading dynamically imported module" — Firefox's wording, and
 *    "Importing a module script failed" — Safari's. Matched loosely, since
 *    these strings are not part of any spec and do drift between versions.
 */
/** Exported so a caller writing its own {@link Props.fallback} can reuse this. */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false
  const err = error as { name?: unknown; message?: unknown }
  if (err.name === 'ChunkLoadError') return true
  const message = typeof err.message === 'string' ? err.message : ''
  return (
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /\bloading chunk\b.*\bfailed\b/i.test(message)
  )
}

interface Props {
  children: ReactNode
  /**
   * Render the failure yourself. Receives `reset`, which clears the caught
   * error and re-renders `children` — useful where a retry can plausibly
   * succeed. It cannot recover a failed `lazy()` import: React caches the
   * rejected promise, so the next render re-throws the same error and only a
   * reload refetches the chunk. Omit this to get {@link DefaultErrorFallback}.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode
  /** Label for the console group, so nested boundaries are tellable apart. */
  label?: string
}

interface State {
  error: Error | null
}

/**
 * Catches a render-time crash in its subtree and shows a screen instead of a
 * blank page.
 *
 * A class, because `getDerivedStateFromError` and `componentDidCatch` have no
 * hook equivalent — React has never shipped one, and this is the documented
 * reason class components still exist.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The only place the component stack is available. Nothing is reported
    // anywhere off-device — the app has no crash reporter and adding one is a
    // consent question, not a resilience one — but a user who opens DevTools
    // and a developer running `pnpm dev` should both find the real stack rather
    // than only the fallback that replaced it.
    console.error(
      `[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ''}]`,
      error,
      info.componentStack,
    )
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return this.props.fallback?.(error, this.reset) ?? <DefaultErrorFallback error={error} />
  }
}

/**
 * The app's own crash screen, rather than the browser's blank page.
 *
 * `role="alert"` per the app's convention (see the README's Accessibility
 * section): this replaces whatever the user was reading with the news that it
 * failed, which is exactly the interruption an alert is for.
 *
 * A stale-chunk failure gets its own copy and drops the support link — there is
 * nothing for support to do about a deploy that has already happened, and
 * offering the address invites mail about a non-problem.
 */
export function DefaultErrorFallback({ error }: { error: Error }) {
  const { t } = useI18n()
  const stale = isChunkLoadError(error)

  return (
    <div
      role="alert"
      className="flex min-h-dvh flex-col items-center justify-center px-container-margin-mobile py-2xl"
    >
      <div className="flex w-full max-w-[26rem] flex-col items-center gap-md rounded-[26px] p-lg text-center glass">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-tint/[0.14] text-primary">
          <Icon name={stale ? 'cloud_sync' : 'info'} className="text-2xl" />
        </span>

        <div className="flex flex-col gap-1.5">
          <h1 className="font-headline-md text-headline-md font-bold text-on-surface">
            {t(stale ? 'errors.chunkTitle' : 'errors.boundaryTitle')}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t(stale ? 'errors.chunkBody' : 'errors.boundaryBody')}
          </p>
        </div>

        <div className="mt-sm flex w-full flex-col gap-sm">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="settle flex w-full items-center justify-center gap-sm rounded-2xl px-4 py-3 font-label-md text-label-md hover:brightness-105 active:scale-98 grad-primary"
          >
            <Icon name="refresh" />
            {t('errors.reload')}
          </button>

          {!stale && (
            <a
              href={SUPPORT_URL}
              className="settle tap-target flex w-full items-center justify-center gap-sm rounded-2xl px-4 py-3 font-label-md text-label-md text-on-surface-variant hover:bg-(--glass-chip) active:scale-98"
            >
              <Icon name="mail" />
              {t('errors.emailSupport')}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
