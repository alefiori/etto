import { useState } from 'react'
import { useI18n } from '@/context/I18nContext'
import { FoodRow } from '@/components/ui/FoodRow'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FoodEntrySheet } from '@/components/dashboard/FoodEntrySheet'
import { caloriesForServings, round, scaleMacros } from '@/lib/macros'
import { deleteFoodLog, updateLogServings } from '@/lib/foods'
import type { FoodLogWithFood } from '@/lib/database.types'

/**
 * One logged food inside a meal card.
 *
 * The row itself — its anatomy and its press-and-hold menu — is
 * {@link FoodRow}, shared with My Foods. What lives here is the part that is
 * specific to a *log*: the servings maths, the three actions the menu offers,
 * and the two overlays behind them.
 */
export function FoodLogRow({
  log,
  onChanged,
  onCopy,
  onNotice,
}: {
  log: FoodLogWithFood
  onChanged: () => void
  onCopy: () => void
  /** Confirms an action whose only other feedback is the list quietly changing. */
  onNotice: (message: string) => void
}) {
  const { t } = useI18n()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loggedAmount = round(log.servings * log.food.serving_amount, 2)
  const scaled = scaleMacros(log.food, log.servings)
  const kcal = caloriesForServings(log.food, log.servings)

  async function saveServings(servings: number) {
    setBusy(true)
    setError(null)
    try {
      await updateLogServings(log.id, servings)
      setSheetOpen(false)
      onNotice(t('dashboard.quantityUpdated'))
      onChanged()
    } catch {
      setError(t('dashboard.couldNotUpdateEntry'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await deleteFoodLog(log.id)
      setConfirming(false)
      setSheetOpen(false)
      onNotice(t('dashboard.entryDeleted'))
      onChanged()
    } catch {
      setConfirming(false)
      setError(t('dashboard.couldNotDeleteEntry'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <FoodRow
        name={log.food.name}
        amount={`${loggedAmount} ${log.food.serving_unit}`}
        macros={scaled}
        kcalLabel={t('dashboard.mealKcal', { kcal: Math.round(kcal) })}
        menuLabel={t('dashboard.entryOptions')}
        onActivate={() => setSheetOpen(true)}
        actions={[
          { icon: 'info', label: t('dashboard.entryDetails'), onSelect: () => setSheetOpen(true) },
          { icon: 'content_copy', label: t('foodInfo.copyFood'), onSelect: onCopy },
          {
            icon: 'delete',
            label: t('common.delete'),
            destructive: true,
            onSelect: () => setConfirming(true),
          },
        ]}
      />

      {error && !sheetOpen && <p className="px-sm pt-1 font-body-md text-xs text-error">{error}</p>}

      <FoodEntrySheet
        open={sheetOpen}
        food={log.food}
        servings={log.servings}
        saving={busy}
        error={sheetOpen ? error : null}
        onClose={() => {
          setError(null)
          setSheetOpen(false)
        }}
        onSave={saveServings}
        onCopy={() => {
          setSheetOpen(false)
          onCopy()
        }}
        onDelete={() => setConfirming(true)}
      />

      <ConfirmDialog
        open={confirming}
        title={t('dashboard.deleteEntryTitle')}
        message={t('dashboard.deleteEntryConfirm', {
          name: log.food.name,
          amount: loggedAmount,
          unit: log.food.serving_unit,
        })}
        destructive
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </div>
  )
}
