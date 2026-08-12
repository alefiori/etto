import { useEffect, useId, useState } from 'react'
import { useScrollLock } from '@/hooks/useScrollLock'
import { useI18n } from '@/context/I18nContext'
import { pushOverlay } from '@/lib/nativeBootstrap'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { SourceTag } from '@/components/ui/SourceTag'
import { MACROS } from '@/lib/constants'
import { calories, caloriesForServings, round, scaleMacros } from '@/lib/macros'
import type { Food } from '@/lib/database.types'

/**
 * Everything you can do to one logged entry, in one sheet: read its numbers,
 * change how much of it you ate, copy it, or delete it.
 *
 * It replaces the four icon buttons that used to sit at the right edge of a food
 * row. At phone width those were ~28px targets packed against each other and
 * against the row's own tap area, and the middle one of them (edit) turned the
 * row into a cramped inline form. Trading them for one large target — the row
 * itself — buys room for a quantity editor people can actually hit: ±5 g steps
 * on 52px buttons, and one-tap jumps to the common multiples of a serving.
 *
 * The overlay language is the app's: centered card from `sm` up, bottom sheet
 * below it, matching {@link ConfirmDialog} and the rest of the modals.
 */
export function FoodEntrySheet({
  open,
  food,
  servings,
  saving,
  error,
  onClose,
  onSave,
  onCopy,
  onDelete,
}: {
  open: boolean
  food: Food
  /** Servings currently logged — what the editor starts from each time it opens. */
  servings: number
  /** True while the parent is persisting a save. */
  saving: boolean
  /** Why the last save or delete failed, shown next to the actions that failed. */
  error: string | null
  onClose: () => void
  onSave: (servings: number) => void
  onCopy: () => void
  onDelete: () => void
}) {
  const { t } = useI18n()
  const titleId = useId()

  // The editor works in the food's serving unit (grams, ml, pieces) because
  // that is what the label on the packet says; servings is derived on save.
  const loggedAmount = round(servings * food.serving_amount, 2)
  const [amount, setAmount] = useState(loggedAmount)

  useScrollLock(open)

  // Reopening always starts from what is logged, so an abandoned edit doesn't
  // come back the next time the row is tapped.
  useEffect(() => {
    if (open) setAmount(loggedAmount)
  }, [open, loggedAmount])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // See Modal: Android sends no Escape, so back must find this too.
    const unregister = pushOverlay(onClose)
    return () => {
      window.removeEventListener('keydown', onKey)
      unregister()
    }
  }, [open, onClose])

  if (!open) return null

  const unit = food.serving_unit
  const step = stepFor(unit)
  const draftServings = food.serving_amount > 0 ? amount / food.serving_amount : 0
  const scaled = scaleMacros(food, draftServings)
  const entryKcal = caloriesForServings(food, draftServings)
  const perServingKcal = calories(food)
  const changed = amount !== loggedAmount

  return (
    <div
      className="animate-overlay-fade-in fixed inset-0 z-80 flex items-end justify-center p-0 glass-scrim sm:items-center sm:p-lg"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="animate-sheet-up flex w-full flex-col gap-md rounded-t-[36px] p-lg pb-[calc(var(--spacing-lg)+(var(--spacing-safe-bottom)))] sm:max-w-[28rem] sm:rounded-lens sm:pb-lg glass-sheet">
        {/* Grab handle — the phone-only affordance for a sheet you can dismiss. */}
        <div className="mx-auto -mt-2 h-1 w-9 shrink-0 rounded-full bg-outline-variant sm:hidden" />

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
            className="shrink-0 rounded-full glass-chip p-2 text-on-surface transition-colors hover:glass-chip"
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

        {/* Quantity editor */}
        <div className="flex flex-col gap-sm rounded-2xl glass-chip p-md">
          <span className="font-label-md text-label-md text-on-surface-variant">
            {t('foodInfo.quantity')}
          </span>
          <div className="flex items-center gap-sm">
            <button
              onClick={() => setAmount((a) => Math.max(0, round(a - step, 2)))}
              disabled={amount <= 0}
              aria-label={t('foodInfo.decrease')}
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-row text-primary transition-transform active:scale-95 disabled:opacity-40 glass-field"
            >
              <Icon name="remove" className="text-2xl" />
            </button>
            <div className="flex h-[52px] flex-1 items-center justify-center gap-1 rounded-row glass-field">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={amount}
                onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                onFocus={(e) => e.target.select()}
                aria-label={t('dashboard.amountInUnit', { unit })}
                className="w-20 border-0 bg-transparent text-right text-[26px] font-bold text-on-surface outline-hidden"
              />
              <span className="font-label-md text-body-md text-on-surface-variant">{unit}</span>
            </div>
            <button
              onClick={() => setAmount((a) => round(a + step, 2))}
              aria-label={t('foodInfo.increase')}
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-row text-primary transition-transform active:scale-95 glass-field"
            >
              <Icon name="add" className="text-2xl" />
            </button>
          </div>

          {/* One-tap multiples of a serving — the amounts people actually log. */}
          <div className="flex gap-xs">
            {PRESET_MULTIPLIERS.map((multiplier) => {
              const preset = round(food.serving_amount * multiplier, 2)
              const active = preset === amount
              return (
                <button
                  key={multiplier}
                  onClick={() => setAmount(preset)}
                  aria-pressed={active}
                  className={`h-10 flex-1 rounded-xl text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface-variant hover:brightness-[1.06] glass-field'
                  }`}
                >
                  {preset} {unit}
                </button>
              )
            })}
          </div>
        </div>

        {/* Totals for the amount currently in the editor */}
        <div className="rounded-2xl glass-chip p-md">
          <div className="flex items-baseline justify-between">
            <span className="font-label-md text-label-md text-on-surface-variant">
              {amount} {unit}
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
                <span className="font-label-md text-label-md" style={{ color: m.textColor }}>
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
            unit,
            kcal: Math.round(perServingKcal),
          })}
        </p>

        {error && (
          <p className="rounded-xl bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
            {error}
          </p>
        )}

        <div className="flex gap-sm">
          <button
            onClick={onCopy}
            className="flex h-12 flex-1 items-center justify-center gap-xs rounded-xl glass-chip font-label-md text-label-md text-on-surface transition-colors hover:glass-chip"
          >
            <Icon name="content_copy" className="text-sm" />
            {t('foodInfo.copyFood')}
          </button>
          <button
            onClick={onDelete}
            className="flex h-12 flex-1 items-center justify-center gap-xs rounded-xl bg-error-container font-label-md text-label-md text-on-error-container transition-opacity hover:opacity-90"
          >
            <Icon name="delete" className="text-sm" />
            {t('common.delete')}
          </button>
        </div>

        {/* One button for both outcomes: it commits an edit, or just closes when
            there is nothing to commit, so the sheet never dead-ends. */}
        <button
          onClick={() => (changed ? onSave(draftServings) : onClose())}
          disabled={saving || amount <= 0}
          className={`flex h-[52px] w-full items-center justify-center gap-sm rounded-xl font-label-md text-label-md transition-opacity hover:opacity-90 disabled:opacity-40 ${
            changed ? 'bg-primary text-on-primary' : 'glass-chip text-on-surface-variant'
          }`}
        >
          {saving && <Spinner className="h-4 w-4" />}
          {changed ? t('foodInfo.saveAmount', { amount, unit }) : t('foodInfo.done')}
        </button>
      </div>
    </div>
  )
}

/** Multiples of one serving offered as one-tap presets. */
const PRESET_MULTIPLIERS = [0.5, 1, 1.5, 2]

/**
 * How much one press of ± moves the amount. Weights and volumes are logged in
 * tens of units, so they step by 5; everything else (pieces, cups, tablespoons)
 * is counted, and there a half is the smallest useful move.
 */
function stepFor(unit: string): number {
  return unit === 'g' || unit === 'ml' ? 5 : 0.5
}
