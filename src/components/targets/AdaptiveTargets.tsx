import { useState } from 'react'
import { useI18n, type TFunction } from '@/context/I18nContext'
import { useProfile } from '@/context/ProfileContext'
import { useAdaptiveTargets } from '@/hooks/useAdaptiveTargets'
import { useEntitlement } from '@/context/EntitlementContext'
import { useAppShell } from '@/context/AppShellContext'
import { ProGate } from '@/components/paywall/ProGate'
import { macroSplit, type AdaptiveResult } from '@/lib/tdee'
import { calories } from '@/lib/macros'
import { MACROS } from '@/lib/constants'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { Toggle } from '@/components/ui/Toggle'
import type { MacroTarget } from '@/lib/database.types'
import type { MacroGrams } from '@/lib/macros'

/**
 * The adaptive-targets panel above the weekly grid.
 *
 * The explanation is not decoration — it is the product. A target that changes
 * without saying why reads as a bug, and "we raised your carbs because your
 * weight held flat while you averaged 2,100 kcal" is the sentence people are
 * actually paying for. Everything else here is plumbing around getting that
 * sentence right, including refusing to show it when the data can't support it.
 */
export function AdaptiveTargets({
  byDay,
  onApply,
}: {
  byDay: Record<number, MacroTarget>
  /** Write the same macros to all seven weekdays. */
  onApply: (macros: MacroGrams) => Promise<void>
}) {
  const { t } = useI18n()
  const { profile, updateProfile } = useProfile()
  const { isPro } = useEntitlement()
  const { openPaywall } = useAppShell()
  // Gate the calculation as well as the UI: a non-subscriber should not be
  // issuing the queries behind a paid feature, and `enabled` is what the hook
  // keys off.
  const enabled = isPro && (profile?.adaptive_targets_enabled ?? false)
  const { result, loading, error } = useAdaptiveTargets(byDay, enabled)

  const [toggling, setToggling] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleToggle(next: boolean) {
    setActionError(null)
    setToggling(true)
    try {
      await updateProfile({ adaptive_targets_enabled: next })
    } catch {
      setActionError(t('adaptive.couldNotSave'))
    } finally {
      setToggling(false)
    }
  }

  async function handleApply() {
    if (!result?.targetKcal) return
    setActionError(null)
    setApplying(true)
    try {
      await onApply(macroSplit(result.targetKcal, result.latestWeightKg))
      setApplied(true)
      window.setTimeout(() => setApplied(false), 2500)
    } catch {
      setActionError(t('adaptive.couldNotSave'))
    } finally {
      setApplying(false)
    }
  }

  if (!isPro) {
    return <ProGate title={t('adaptive.description')} onUpgrade={openPaywall}>{null}</ProGate>
  }

  return (
    <section className="flex flex-col gap-sm rounded-lens border border-primary/30 bg-primary-tint/12 p-md shadow-card backdrop-blur-xl">
      <div className="flex items-start justify-between gap-md">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
            <Icon name="auto_awesome" className="text-[20px] text-primary" />
            {t('adaptive.title')}
          </h3>
          <p className="mt-1 font-body-md text-sm text-on-surface-variant">
            {t('adaptive.description')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-sm">
          {(toggling || loading) && <Spinner className="h-4 w-4 text-primary" />}
          <Toggle
            checked={enabled}
            disabled={toggling}
            onChange={handleToggle}
            label={t('adaptive.toggleAria')}
          />
        </div>
      </div>

      {actionError && (
        <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
          {actionError}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
          {t('adaptive.couldNotLoad')}
        </p>
      )}

      {enabled && !loading && result && (
        <AdaptiveBody
          result={result}
          applying={applying}
          applied={applied}
          onApply={handleApply}
        />
      )}

      {enabled && (
        <p className="flex items-center gap-1 font-label-md text-label-md text-outline">
          <Icon name="info" className="text-[16px]" />
          {t('adaptive.disclaimer')}
        </p>
      )}
    </section>
  )
}

function AdaptiveBody({
  result,
  applying,
  applied,
  onApply,
}: {
  result: AdaptiveResult
  applying: boolean
  applied: boolean
  onApply: () => void
}) {
  const { t } = useI18n()

  // Each refusal names the one thing the user can do about it, rather than a
  // generic "not enough data".
  if (result.status === 'needs-goal') return <Guidance text={t('adaptive.needsGoal')} />
  if (result.status === 'needs-weigh-ins') {
    return <Guidance text={t('adaptive.needsWeighIns')} />
  }
  if (result.status === 'needs-body-data') return <Guidance text={t('adaptive.needsBody')} />
  if (result.status === 'needs-food-logs') {
    return <Guidance text={t('adaptive.needsFoodLogs', { days: result.loggedDays })} />
  }

  const target = result.targetKcal
  if (target == null) return <Guidance text={t('adaptive.needsBody')} />

  const macros = macroSplit(target, result.latestWeightKg)

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-end gap-lg">
        {result.tdeeKcal != null && (
          <Stat label={t('adaptive.maintenance')} value={t('adaptive.perDay', { kcal: fmt(result.tdeeKcal) })} />
        )}
        <Stat
          label={t('adaptive.targetLabel')}
          value={t('adaptive.perDay', { kcal: fmt(target) })}
          emphasis
        />
      </div>

      {/* The split the seven days would be set to. */}
      <div className="flex flex-wrap gap-sm">
        {MACROS.map((m) => (
          <span
            key={m.key}
            className="flex items-center gap-1 rounded-full px-3 py-1 font-label-md text-label-md"
            style={{ backgroundColor: m.tint, color: m.textColor }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
            {t(`macro.${m.key}`)} {Math.round(macros[m.field])}g
          </span>
        ))}
        <span className="flex items-center rounded-full glass-chip px-3 py-1 font-label-md text-label-md text-on-surface-variant">
          {Math.round(calories(macros))} {t('common.kcal')}
        </span>
      </div>

      {result.status === 'estimated' ? (
        <p className="font-body-md text-sm text-on-surface-variant">{t('adaptive.estimatedNote')}</p>
      ) : (
        <>
          <p className="font-body-md text-sm text-on-surface">
            {t('adaptive.explanation', {
              intake: fmt(result.meanIntakeKcal ?? 0),
              change: changePhrase(result, t),
              tdee: fmt(result.tdeeKcal ?? 0),
            })}
          </p>
          <p className="font-label-md text-label-md text-outline">
            {t('adaptive.measured', { days: result.loggedDays })}
          </p>
        </>
      )}

      {result.clamped && (
        <p className="flex items-center gap-1 font-label-md text-label-md text-on-surface-variant">
          <Icon name="trending_flat" className="text-[16px]" />
          {t('adaptive.clampedNote')}
        </p>
      )}

      <button
        type="button"
        onClick={onApply}
        disabled={applying}
        className="mt-xs flex h-[44px] w-full items-center justify-center gap-2 rounded-full font-label-md text-label-md transition-all hover:brightness-105 active:scale-95 disabled:opacity-40 grad-primary sm:w-auto sm:px-lg"
      >
        {applying && <Spinner className="h-4 w-4" />}
        {applied ? t('adaptive.applied') : t('adaptive.apply')}
      </button>
    </div>
  )
}

function Guidance({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg glass-chip px-md py-sm font-body-md text-sm text-on-surface-variant">
      <Icon name="lightbulb" className="mt-0.5 text-[16px] shrink-0" />
      {text}
    </p>
  )
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <span className="block font-label-md text-label-md text-on-surface-variant">{label}</span>
      <span
        className={
          emphasis
            ? 'font-headline-lg-mobile text-headline-lg-mobile text-primary'
            : 'font-headline-md text-headline-md text-on-surface'
        }
      >
        {value}
      </span>
    </div>
  )
}

/**
 * The human half of the explanation sentence.
 *
 * Below 0.1 kg/week the measured change is inside scale noise, so it is
 * described as steady rather than given a direction — the same band the weight
 * card uses, for the same reason.
 */
function changePhrase(result: AdaptiveResult, t: TFunction): string {
  const change = result.weeklyChangeKg ?? 0
  const value = Math.abs(change).toFixed(2)
  if (Math.abs(change) < 0.1) return t('adaptive.weightSteady')
  return change < 0
    ? t('adaptive.weightDown', { value })
    : t('adaptive.weightUp', { value })
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString()
}
