import { useI18n } from '@/context/I18nContext'
import { Icon } from '@/components/ui/Icon'

/**
 * The launch screen — what fills the window while the session is being
 * restored, before any route has rendered.
 *
 * This is the web-side continuation of the native splash: Capacitor shows a
 * static storyboard until the WebView has a first paint, and this is the first
 * paint. So it deliberately lands on the same picture — the app icon centred on
 * the aurora, the wordmark beneath it — and only then starts moving, which is
 * what makes the handover read as one screen waking up rather than two screens
 * swapping.
 *
 * Motion: the icon pops in and then floats on a slow loop, and the bar under it
 * is indeterminate. There is nothing honest to report as a percentage — the
 * session either restores or it doesn't — and a bar that filled to 90% and sat
 * there would be a claim, where a rhythm is only a sign of life.
 *
 * It replaces a bare centred spinner. A spinner says "wait"; this says which
 * app you are waiting for, on a cold start over a slow connection where that is
 * the whole question.
 *
 * `failed` swaps the indeterminate bar for a retry. Waiting is only honest
 * while something is still in flight; once the session restore has *rejected*
 * (see AuthContext) nothing more will happen on its own, and a bar that keeps
 * moving over a dead network is the bug this screen used to have.
 */
export function BootScreen({
  label,
  failed = false,
  onRetry,
}: {
  label: string
  /** Boot has stopped for good — show the failure instead of the bar. */
  failed?: boolean
  onRetry?: () => void
}) {
  const { t } = useI18n()

  return (
    <div
      // The aurora is painted on <body> and shows through: the icon's sage
      // glow needs something to fall on, and a flat page under it would make
      // the shadow read as a smudge.
      className="flex min-h-dvh flex-col items-center justify-center gap-lg px-lg py-2xl"
    >
      {/* Two files rather than one recoloured icon: the dark variant darkens
          the ring tracks and lightens the accents, which no filter can do. Both
          ship already (they are the PWA and native icon sources), so this costs
          nothing but the tag. `alt=""` on both — the wordmark right below says
          the same thing, and a screen reader should hear it once. */}
      <img
        src="/icon.svg"
        alt=""
        width={132}
        height={132}
        className="h-[132px] w-[132px] animate-float rounded-[31px] dark:hidden"
        style={{ boxShadow: '0 26px 60px rgba(79, 116, 88, 0.35)' }}
      />
      <img
        src="/icon-dark.svg"
        alt=""
        width={132}
        height={132}
        className="hidden h-[132px] w-[132px] animate-float rounded-[31px] dark:block"
        style={{ boxShadow: '0 26px 64px rgba(143, 184, 150, 0.4)' }}
      />

      <div className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="font-headline-lg text-[2.125rem] font-bold leading-9 tracking-[-0.03em] text-on-surface">
          Etto
        </h1>
        {/* Its own line rather than the drawer's "Health Companion": that
            string is a label for a nav pane that is already on screen, and this
            is the first thing a cold start says. Sharing one would also make
            every test that waits for the drawer match the launch screen
            instead, and pass before the app had rendered. */}
        <p className="font-body-md text-body-md text-on-surface-variant">
          {t('auth.launchTagline')}
        </p>
      </div>

      {/* Failure takes the bar's place rather than sitting under it: two
          messages, one of them still claiming progress, is worse than either.
          `role="alert"` per the app's convention for errors — and it is the
          right register here, since it replaces a screen the reader was told
          to wait on. */}
      {failed ? (
        <div
          role="alert"
          className="mt-xl flex w-full max-w-[22rem] flex-col items-center gap-md text-center"
        >
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t('errors.bootFailed')}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="settle flex items-center justify-center gap-sm rounded-2xl px-6 py-3 font-label-md text-label-md hover:brightness-105 active:scale-98 grad-primary"
            >
              <Icon name="refresh" />
              {t('errors.retry')}
            </button>
          )}
        </div>
      ) : (
      /* The status lives on the track, not on the moving part: `role="status"`
         on something that animates forever would have some screen readers
         announce it forever. The visible caption below carries the same words
         for everyone else. */
      <div className="mt-xl flex flex-col items-center gap-md">
        <div
          role="status"
          aria-label={label}
          className="h-1 w-[120px] overflow-hidden rounded-full bg-(--glass-chip)"
        >
          <div
            aria-hidden
            className="h-full w-[56px] animate-bar rounded-full"
            style={{ backgroundImage: 'var(--grad-primary)' }}
          />
        </div>
        <span
          aria-hidden
          className="font-label-md text-xs uppercase tracking-widest text-on-surface-variant"
        >
          {label}
        </span>
      </div>
      )}
    </div>
  )
}
