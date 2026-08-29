import type { ReactNode } from 'react'
import { useI18n } from '@/context/I18nContext'
import { useEntitlement } from '@/context/EntitlementContext'
import { Icon } from '@/components/ui/Icon'
import { ProBadge } from '@/components/paywall/ProBadge'

/**
 * Renders `children` for Pro subscribers, and an upgrade prompt for everyone
 * else.
 *
 * The prompt shows what the feature *is* rather than hiding it — a locked
 * feature someone can see the shape of converts; one they never knew existed
 * does not. It resolves to the locked state while entitlement is still
 * loading, so a slow network can't briefly expose a paid feature.
 */
export function ProGate({
  children,
  title,
  label,
  icon,
  onUpgrade,
}: {
  children: ReactNode
  /** What the feature is, shown in the locked state. */
  title: string
  /**
   * The feature's own name, when the gate replaces a whole row that would
   * otherwise have carried one. Without it the locked state is a description
   * with nothing to attach to — "Leave empty to follow your weight" says
   * nothing about which setting has gone missing. Where the surrounding card
   * already names the feature (the dashboard cards keep their headings), leave
   * this out and the prompt falls back to naming itself.
   */
  label?: string
  /** The row's icon, so a named gate keeps the shape of what it stands in for. */
  icon?: string
  onUpgrade: () => void
}) {
  const { t } = useI18n()
  const { isPro } = useEntitlement()

  if (isPro) return <>{children}</>

  return (
    <div className="flex flex-col gap-sm rounded-lens border border-primary/30 bg-primary-tint/12 p-md shadow-card backdrop-blur-xl">
      {/* `flex-wrap` and a floor on the text column. The CTA is `shrink-0`, so
          at a large text size it kept its width while the label beside it was
          squeezed under it — "Pro feature" ended up printed through the button.
          Wrapping drops the CTA to its own row instead. */}
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-[10rem] flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={`flex items-center gap-1 font-label-md text-label-md ${
                label ? 'text-on-surface' : 'text-primary'
              }`}
            >
              <Icon
                name={icon ?? 'workspace_premium'}
                className={`text-[1rem] ${label ? 'text-on-surface-variant' : ''}`}
              />
              {label ?? t('paywall.upgradePrompt')}
            </span>
            {/* Only alongside a real name. Against the fallback it would read
                "Pro feature · Pro", which says the same thing twice. */}
            {label && <ProBadge />}
          </span>
          <p className="mt-1 font-body-md text-body-md text-on-surface">{title}</p>
        </div>
        <button
          type="button"
          onClick={onUpgrade}
          className="ml-auto min-h-10 shrink-0 rounded-full px-4 py-2 font-label-md text-label-md transition-all hover:brightness-105 active:scale-95 grad-primary"
        >
          {t('paywall.upgradeCta')}
        </button>
      </div>
    </div>
  )
}
