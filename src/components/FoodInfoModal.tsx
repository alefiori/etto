import { useEffect, useId } from 'react'
import { useScrollLock } from '@/hooks/useScrollLock'
import { useI18n } from '@/context/I18nContext'
import { Icon } from '@/components/ui/Icon'
import { SourceTag } from '@/components/ui/SourceTag'
import { MACROS } from '@/lib/constants'
import { calories, caloriesForServings, round, scaleMacros } from '@/lib/macros'
import type { Food } from '@/lib/database.types'

/**
 * Read-only nutrition breakdown for a food already logged in a meal. Shows the
 * totals for the logged amount alongside the food's per-serving reference, plus
 * a shortcut to copy the entry for pasting elsewhere. Overlay language matches
 * {@link ConfirmDialog}: centered card on desktop, bottom sheet on mobile.
 */
export function FoodInfoModal({
  open,
  onClose,
  food,
  servings,
  onCopy,
}: {
  open: boolean
  onClose: () => void
  food: Food
  servings: number
  onCopy: () => void
}) {
  const { t } = useI18n()
  const titleId = useId()

  useScrollLock(open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const loggedAmount = round(servings * food.serving_amount, 2)
  const scaled = scaleMacros(food, servings)
  const entryKcal = caloriesForServings(food, servings)
  const perServingKcal = calories(food)

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/30 p-0 backdrop-blur-[4px] sm:items-center sm:p-lg"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex w-full flex-col gap-md rounded-t-2xl bg-surface-container-lowest p-lg pb-[calc(theme(spacing.lg)+theme(spacing.safe-bottom))] shadow-card sm:max-w-md sm:rounded-2xl sm:pb-lg">
        <div className="flex items-start justify-between gap-sm">
          <div className="min-w-0">
            <h2 id={titleId} className="font-headline-md text-headline-md text-on-surface">
              {food.name}
            </h2>
            {food.brand && (
              <p className="mt-0.5 font-body-md text-body-md text-on-surface-variant">{food.brand}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full bg-surface-container-high p-2 text-on-surface transition-colors hover:bg-surface-variant"
            aria-label={t('common.close')}
          >
            <Icon name="close" className="text-sm" />
          </button>
        </div>

        {food.source !== 'custom' && (
          <span className="inline-block">
            <SourceTag source={food.source} />
          </span>
        )}

        {/* Totals for the logged amount */}
        <div className="rounded-2xl bg-surface-container-low p-md">
          <div className="flex items-baseline justify-between">
            <span className="font-label-md text-label-md text-on-surface-variant">
              {loggedAmount} {food.serving_unit}
            </span>
            <span className="font-headline-md text-headline-md text-on-surface">
              {Math.round(entryKcal)} {t('common.kcal')}
            </span>
          </div>
          <div className="mt-md flex items-center justify-around">
            {MACROS.map((m) => (
              <div key={m.key} className="flex flex-col items-center">
                <span className="font-headline-md text-headline-md text-on-surface">
                  {round(scaled[m.field])}g
                </span>
                <span className="font-label-md text-label-md" style={{ color: m.color }}>
                  {t(`macro.${m.key}`)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Per-serving reference */}
        <p className="text-center font-body-md text-sm text-on-surface-variant">
          {t('foodInfo.perServing', {
            amount: food.serving_amount,
            unit: food.serving_unit,
            kcal: Math.round(perServingKcal),
          })}
        </p>

        <button
          onClick={onCopy}
          className="mt-sm flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-label-md text-label-md text-on-primary transition-opacity hover:opacity-90"
        >
          <Icon name="content_copy" className="text-sm" />
          {t('foodInfo.copyFood')}
        </button>
      </div>
    </div>
  )
}
