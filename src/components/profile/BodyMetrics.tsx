import { useEffect, useState } from 'react'
import { useProfile } from '@/context/ProfileContext'
import { useI18n } from '@/context/I18nContext'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { cmToFeetInches, feetInchesToCm, weightUnit } from '@/lib/units'
import type { ActivityLevel, GoalDirection, Sex, UnitSystem } from '@/lib/database.types'

const selectClass =
  'h-[48px] w-full appearance-none rounded-[16px] glass-field px-4 pr-10 font-body-md text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60'
const inputClass =
  'h-[48px] w-full rounded-[16px] glass-field px-4 font-body-md text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60'

const ACTIVITY_LEVELS: ActivityLevel[] = [
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
]
const ACTIVITY_LABEL_KEYS = {
  sedentary: 'body.activitySedentary',
  light: 'body.activityLight',
  moderate: 'body.activityModerate',
  active: 'body.activityActive',
  very_active: 'body.activityVeryActive',
} as const

const GOALS: GoalDirection[] = ['lose', 'maintain', 'gain']
const GOAL_LABEL_KEYS = {
  lose: 'body.goalLose',
  maintain: 'body.goalMaintain',
  gain: 'body.goalGain',
} as const

/**
 * Body and goal settings — the inputs an energy model needs.
 *
 * Everything here is optional and starts empty: a half-filled profile is
 * normal, and guessing a body is worse than not having one. Each control
 * commits on change (selects) or on blur (free-text numbers), following the
 * language picker and MealSettings respectively, so there is no save button.
 */
export function BodyMetrics() {
  const { profile, unitSystem, updateProfile, loading } = useProfile()
  const { t } = useI18n()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(patch: Parameters<typeof updateProfile>[0]) {
    setError(null)
    setSaving(true)
    try {
      await updateProfile(patch)
    } catch {
      // The provider keeps its own error; this one is the human-readable
      // version shown next to the fields the user just touched.
      setError(t('body.couldNotSave'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center gap-2">
        <Icon name="accessibility_new" className="text-[20px] text-on-surface-variant" />
        <h3 className="font-label-md text-label-md text-on-surface">{t('body.title')}</h3>
        {saving && <Spinner className="h-4 w-4 text-primary" />}
      </div>
      <p className="font-body-md text-sm text-on-surface-variant">{t('body.description')}</p>

      {error && (
        <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
          {error}
        </p>
      )}

      {loading ? (
        <div className="py-md">
          <Spinner className="h-5 w-5 text-primary" />
        </div>
      ) : (
        <div className="flex flex-col gap-md pt-sm">
          <Field id="unit-system" label={t('body.unitsLabel')}>
            <Select
              id="unit-system"
              value={unitSystem}
              disabled={saving}
              onChange={(v) => save({ unit_system: v as UnitSystem })}
            >
              <option value="metric">{t('body.unitsMetric')}</option>
              <option value="imperial">{t('body.unitsImperial')}</option>
            </Select>
          </Field>

          <Field id="sex" label={t('body.sexLabel')} hint={t('body.sexHint')}>
            <Select
              id="sex"
              value={profile?.sex ?? ''}
              disabled={saving}
              onChange={(v) => save({ sex: (v || null) as Sex | null })}
            >
              <option value="">{t('body.sexUnset')}</option>
              <option value="female">{t('body.sexFemale')}</option>
              <option value="male">{t('body.sexMale')}</option>
            </Select>
          </Field>

          <Field id="birthdate" label={t('body.birthdateLabel')}>
            <input
              id="birthdate"
              type="date"
              // iOS gives date inputs a native intrinsic size that beats `w-full`, so the
              // field renders wider and taller than its neighbours until the appearance is reset.
              className={`${inputClass} appearance-none`}
              disabled={saving}
              value={profile?.birthdate ?? ''}
              onChange={(e) => save({ birthdate: e.target.value || null })}
            />
          </Field>

          <HeightField
            heightCm={profile?.height_cm ?? null}
            unitSystem={unitSystem}
            disabled={saving}
            onCommit={(cm) => save({ height_cm: cm })}
          />

          <Field id="activity" label={t('body.activityLabel')}>
            <Select
              id="activity"
              value={profile?.activity_level ?? ''}
              disabled={saving}
              onChange={(v) => save({ activity_level: (v || null) as ActivityLevel | null })}
            >
              <option value="">{t('body.activityUnset')}</option>
              {ACTIVITY_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {t(ACTIVITY_LABEL_KEYS[level])}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="goal" label={t('body.goalLabel')}>
            <Select
              id="goal"
              value={profile?.goal_direction ?? ''}
              disabled={saving}
              onChange={(v) => save({ goal_direction: (v || null) as GoalDirection | null })}
            >
              <option value="">{t('body.goalUnset')}</option>
              {GOALS.map((goal) => (
                <option key={goal} value={goal}>
                  {t(GOAL_LABEL_KEYS[goal])}
                </option>
              ))}
            </Select>
          </Field>

          {/* A rate is only meaningful when there's a direction to apply it to. */}
          {profile?.goal_direction && profile.goal_direction !== 'maintain' && (
            <GoalRateField
              rateKg={profile.goal_rate_kg_per_week}
              unitSystem={unitSystem}
              disabled={saving}
              onCommit={(kg) => save({ goal_rate_kg_per_week: kg })}
            />
          )}

          <p className="flex items-center gap-1 font-label-md text-label-md text-on-surface-variant">
            <Icon name="info" className="text-[16px]" />
            {t('body.disclaimer')}
          </p>
        </div>
      )}
    </div>
  )
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-xs">
      <label htmlFor={id} className="font-label-md text-label-md text-on-surface">
        {label}
      </label>
      {hint && <p className="font-body-md text-sm text-on-surface-variant">{hint}</p>}
      {children}
    </div>
  )
}

function Select({
  id,
  value,
  disabled,
  onChange,
  children,
}: {
  id: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={selectClass}
      >
        {children}
      </select>
      <Icon
        name="expand_more"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-outline"
      />
    </div>
  )
}

/**
 * Height, in centimetres or feet + inches.
 *
 * Imperial doesn't round-trip through one number, so this keeps local draft
 * state and commits on blur — the same pattern MealSettings uses for renaming,
 * and the reason a partially typed "17" doesn't get saved as 17cm.
 */
function HeightField({
  heightCm,
  unitSystem,
  disabled,
  onCommit,
}: {
  heightCm: number | null
  unitSystem: UnitSystem
  disabled?: boolean
  onCommit: (cm: number | null) => void
}) {
  const { t } = useI18n()
  const imperial = unitSystem === 'imperial'
  const parts = heightCm != null ? cmToFeetInches(heightCm) : null

  const [cm, setCm] = useState(heightCm != null ? String(round1(heightCm)) : '')
  const [feet, setFeet] = useState(parts ? String(parts.feet) : '')
  const [inches, setInches] = useState(parts ? String(round1(parts.inches)) : '')

  // Re-sync when the stored value or the unit system changes underneath us.
  useEffect(() => {
    const next = heightCm != null ? cmToFeetInches(heightCm) : null
    setCm(heightCm != null ? String(round1(heightCm)) : '')
    setFeet(next ? String(next.feet) : '')
    setInches(next ? String(round1(next.inches)) : '')
  }, [heightCm, unitSystem])

  function commitMetric() {
    const value = cm.trim()
    if (value === '') return onCommit(null)
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) onCommit(parsed)
  }

  function commitImperial() {
    if (feet.trim() === '' && inches.trim() === '') return onCommit(null)
    const f = Number(feet || 0)
    const i = Number(inches || 0)
    if (Number.isFinite(f) && Number.isFinite(i) && f + i > 0) onCommit(feetInchesToCm(f, i))
  }

  if (imperial) {
    return (
      <div className="flex flex-col gap-xs">
        <span className="font-label-md text-label-md text-on-surface">{t('body.heightLabel')}</span>
        {/* Feet and inches are one value in two boxes, so the commit hangs off
            the group rather than each input: tabbing from feet to inches must
            not save a height the user is still halfway through typing. */}
        <div
          className="flex items-center gap-sm"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commitImperial()
          }}
        >
          <input
            type="number"
            inputMode="numeric"
            min={0}
            aria-label={t('body.feetAria')}
            className={inputClass}
            disabled={disabled}
            value={feet}
            onChange={(e) => setFeet(e.target.value)}
          />
          <span className="font-body-md text-body-md text-on-surface-variant">ft</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={11.99}
            aria-label={t('body.inchesAria')}
            className={inputClass}
            disabled={disabled}
            value={inches}
            onChange={(e) => setInches(e.target.value)}
          />
          <span className="font-body-md text-body-md text-on-surface-variant">in</span>
        </div>
      </div>
    )
  }

  return (
    <Field id="height-cm" label={t('body.heightLabel')}>
      <div className="flex items-center gap-sm">
        <input
          id="height-cm"
          type="number"
          inputMode="decimal"
          min={0}
          className={inputClass}
          disabled={disabled}
          value={cm}
          onChange={(e) => setCm(e.target.value)}
          onBlur={commitMetric}
        />
        <span className="font-body-md text-body-md text-on-surface-variant">cm</span>
      </div>
    </Field>
  )
}

function GoalRateField({
  rateKg,
  unitSystem,
  disabled,
  onCommit,
}: {
  rateKg: number | null
  unitSystem: UnitSystem
  disabled?: boolean
  onCommit: (kg: number | null) => void
}) {
  const { t } = useI18n()
  const unit = weightUnit(unitSystem)
  // A rate is a *difference* in weight, so it converts with the same factor as
  // a weight — lb per week is just kg per week times the ratio.
  const toDisplay = (kg: number) => (unitSystem === 'imperial' ? kg * 2.20462 : kg)
  const toKg = (value: number) => (unitSystem === 'imperial' ? value / 2.20462 : value)

  const [draft, setDraft] = useState(rateKg != null ? String(round2(toDisplay(rateKg))) : '')

  useEffect(() => {
    setDraft(rateKg != null ? String(round2(toDisplay(rateKg))) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateKg, unitSystem])

  function commit() {
    const value = draft.trim()
    if (value === '') return onCommit(null)
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) return
    // The column caps at 1.5 kg/week; clamp here so the write can't 400.
    onCommit(Math.min(1.5, toKg(parsed)))
  }

  return (
    <Field id="goal-rate" label={t('body.goalRateLabel', { unit })} hint={t('body.goalRateHint')}>
      <input
        id="goal-rate"
        type="number"
        inputMode="decimal"
        min={0}
        step={0.1}
        className={inputClass}
        disabled={disabled}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
    </Field>
  )
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
