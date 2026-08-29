import { useI18n } from '@/context/I18nContext'
import { Icon } from '@/components/ui/Icon'

/**
 * The "Pro" chip that marks a paid feature wherever it sits among free ones.
 *
 * It is shown on *unlocked* rows as well as locked ones. A subscriber who
 * cannot see which rows their subscription is paying for has no reason to keep
 * it, and someone still on the free plan should be able to read the shape of
 * what they would get from the settings page rather than only from the paywall.
 *
 * The label is a real word rather than an icon alone: a lone crown means
 * nothing to a screen reader, and "Daily water goal, Pro" is exactly the right
 * announcement.
 */
export function ProBadge({ className = '' }: { className?: string }) {
  const { t } = useI18n()

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-tint/[0.16] px-2 py-0.5 font-label-md text-label-md text-primary ${className}`}
    >
      <Icon name="workspace_premium" className="text-[0.875rem]" />
      {t('paywall.proBadge')}
    </span>
  )
}
