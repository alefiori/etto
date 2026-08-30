import { useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '@/context/I18nContext'
import { useMeals, type MealView } from '@/context/MealsContext'
import { MAX_MEALS } from '@/lib/constants'
import { Icon } from '@/components/ui/Icon'
import { Spinner, LoadingBlock } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const inputClass =
  'min-h-[44px] w-full rounded-[16px] glass-field px-3 font-body-md text-body-md text-on-surface outline-hidden transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60'

/**
 * Meal management: rename meals, add or remove them, and reorder them. Meals
 * are per-user rows, so the dashboard, the add-food flow and the exports all
 * follow whatever is set here.
 */
export function MealSettings() {
  const { t } = useI18n()
  const { meals, loading, error, atLimit, addMeal, rename, move, remove } = useMeals()
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [pending, setPending] = useState<MealView | null>(null)
  const [removing, setRemoving] = useState(false)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name || atLimit) return
    setAdding(true)
    try {
      await addMeal(name)
      setNewName('')
    } catch {
      // The provider surfaces the failure in `error`.
    } finally {
      setAdding(false)
    }
  }

  /** The meal logs move to when `pending` is deleted (see MealsContext). */
  const pendingIndex = pending ? meals.findIndex((m) => m.id === pending.id) : -1
  const fallback = pendingIndex < 0 ? null : meals[pendingIndex === 0 ? 1 : pendingIndex - 1]

  async function confirmRemove() {
    if (!pending) return
    setRemoving(true)
    try {
      await remove(pending.id)
      setPending(null)
    } catch {
      // Ditto — the error banner above the list explains what happened.
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center gap-2">
        <Icon name="restaurant_menu" className="text-[1.25rem] text-on-surface-variant" />
        <h3 className="font-label-md text-label-md text-on-surface">{t('meals.title')}</h3>
      </div>
      <p className="font-body-md text-sm text-on-surface-variant">{t('meals.description')}</p>

      {error && (
        <p role="alert" className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
          {t('meals.couldNotSave')}
        </p>
      )}

      {loading ? (
        <LoadingBlock label={t('meals.loading')} />
      ) : (
        <ul className="flex flex-col gap-sm">
          {meals.map((meal, index) => (
            // `flex-wrap` and a floor on the name field: the three actions are
            // `shrink-0`, so as they grow with the text size they were pushing
            // the field — and themselves — past the card's edge. Wrapping the
            // actions under the name costs a row and keeps both reachable.
            <li key={meal.id} className="flex flex-wrap items-center gap-sm">
              <Icon name={meal.icon} className="shrink-0 text-[1.25rem] text-on-surface-variant" />
              <div className="min-w-[8rem] flex-1">
                <MealNameField meal={meal} onRename={rename} />
              </div>
              <div className="ml-auto flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => move(meal.id, -1)}
                  disabled={index === 0}
                  aria-label={t('meals.moveUp', { meal: meal.label })}
                  className="tap-target flex items-center justify-center rounded-full p-2 text-on-surface-variant transition-colors hover:glass-chip disabled:opacity-30"
                >
                  <Icon name="arrow_upward" className="text-[1.125rem]" />
                </button>
                <button
                  type="button"
                  onClick={() => move(meal.id, 1)}
                  disabled={index === meals.length - 1}
                  aria-label={t('meals.moveDown', { meal: meal.label })}
                  className="tap-target flex items-center justify-center rounded-full p-2 text-on-surface-variant transition-colors hover:glass-chip disabled:opacity-30"
                >
                  <Icon name="arrow_downward" className="text-[1.125rem]" />
                </button>
                <button
                  type="button"
                  onClick={() => setPending(meal)}
                  disabled={meals.length <= 1}
                  aria-label={t('meals.deleteAria', { meal: meal.label })}
                  className="tap-target flex items-center justify-center rounded-full p-2 text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container disabled:opacity-30"
                >
                  <Icon name="delete" className="text-[1.125rem]" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="font-body-md text-sm text-on-surface-variant">{t('meals.nameHint')}</p>

      {/* Wraps: at 200% text the field's own minimum and a labelled Add button
          do not share a 320px phone, and the button is `shrink-0` so one of
          them had to leave the card. A second row costs nothing here. */}
      <form className="flex flex-wrap items-center gap-sm" onSubmit={handleAdd}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={40}
          disabled={atLimit || adding}
          placeholder={t('meals.namePlaceholder')}
          aria-label={t('meals.newMealLabel')}
          className={`min-w-[8rem] flex-1 ${inputClass}`}
        />
        <button
          type="submit"
          disabled={atLimit || adding || newName.trim() === ''}
          className="flex min-h-[44px] shrink-0 items-center gap-xs rounded-full bg-primary-tint/20 px-4 font-label-md text-label-md text-primary transition-colors hover:bg-primary-tint/30 disabled:opacity-40"
        >
          {adding ? <Spinner className="h-4 w-4" /> : <Icon name="add" className="text-[1.125rem]" />}
          {t('meals.addMeal')}
        </button>
      </form>
      {atLimit && (
        <p className="font-label-md text-label-md text-on-surface-variant">
          {t('meals.limitReached', { count: MAX_MEALS })}
        </p>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={t('meals.deleteTitle')}
        message={t('meals.deleteConfirm', {
          name: pending?.label ?? '',
          fallback: fallback?.label ?? '',
        })}
        destructive
        busy={removing}
        onConfirm={confirmRemove}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}

/**
 * A meal's name, saved when the field loses focus (or on Enter). Emptying it
 * clears the stored name, so a built-in meal goes back to its translated label.
 */
function MealNameField({
  meal,
  onRename,
}: {
  meal: MealView
  onRename: (id: string, name: string) => Promise<void>
}) {
  const { t } = useI18n()
  const [value, setValue] = useState(meal.name ?? '')

  // Follow external changes (a reload, or a locale switch clearing the label).
  useEffect(() => {
    setValue(meal.name ?? '')
  }, [meal.name])

  async function commit() {
    if (value.trim() === (meal.name ?? '')) return
    try {
      await onRename(meal.id, value)
    } catch {
      setValue(meal.name ?? '')
    }
  }

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      maxLength={40}
      placeholder={meal.label}
      aria-label={t('meals.nameAria', { meal: meal.label })}
      className={inputClass}
    />
  )
}
