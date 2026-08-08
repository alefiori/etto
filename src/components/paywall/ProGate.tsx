import type { ReactNode } from 'react'
import { useI18n } from '@/context/I18nContext'
import { useEntitlement } from '@/context/EntitlementContext'
import { Icon } from '@/components/ui/Icon'

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
  onUpgrade,
}: {
  children: ReactNode
  /** What the feature is, shown in the locked state. */
  title: string
  onUpgrade: () => void
}) {
  const { t } = useI18n()
  const { isPro } = useEntitlement()

  if (isPro) return <>{children}</>

  return (
    <div className="flex flex-col gap-sm rounded-2xl border border-primary/30 bg-primary-tint/10 p-md shadow-card">
      <div className="flex items-start justify-between gap-md">
        <div className="min-w-0">
          <span className="flex items-center gap-1 font-label-md text-label-md text-primary">
            <Icon name="workspace_premium" className="text-[16px]" />
            {t('paywall.upgradePrompt')}
          </span>
          <p className="mt-1 font-body-md text-body-md text-on-surface">{title}</p>
        </div>
        <button
          type="button"
          onClick={onUpgrade}
          className="h-10 shrink-0 rounded-full bg-primary px-4 font-label-md text-label-md text-on-primary transition-all hover:bg-primary-hover active:scale-95"
        >
          {t('paywall.upgradeCta')}
        </button>
      </div>
    </div>
  )
}
