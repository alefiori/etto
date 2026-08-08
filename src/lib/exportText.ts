/**
 * Plain-text export of meals/days for sharing over chat (WhatsApp, iMessage…).
 * Produces compact, emoji-annotated text and hands it to the Web Share API,
 * falling back to the clipboard where no share sheet exists.
 */
import { MACROS, isBuiltInMealKey, type BuiltInMealKey, type MealKey } from '@/lib/constants'
import { caloriesForServings, round, scaleMacros, sumMacros } from '@/lib/macros'
import { formatLong } from '@/lib/date'
import type { TranslationKey } from '@/lib/i18n'
import type { FoodLogWithFood } from '@/lib/database.types'

type TFunction = (key: TranslationKey, params?: Record<string, string | number>) => string

/** The bit of a meal the export needs: its key (for the emoji) and its label. */
export interface ExportMeal {
  key: MealKey
  label: string
}

const MEAL_EMOJI: Record<BuiltInMealKey, string> = {
  breakfast: '🌅',
  lunch: '🌞',
  dinner: '🌙',
  snack: '🍎',
}

/** Meals the user created have no emoji of their own — use a neutral one. */
function mealEmoji(key: MealKey): string {
  return isBuiltInMealKey(key) ? MEAL_EMOJI[key] : '🍽️'
}

/** e.g. "C 54g · P 11g · F 6g" using the locale's macro abbreviations. */
function macroLine(logs: FoodLogWithFood[], t: TFunction): string {
  const total = sumMacros(logs.map((l) => scaleMacros(l.food, l.servings)))
  return MACROS.map((m) => `${t(`macro.${m.key}Abbr`)} ${round(total[m.field])}g`).join(' · ')
}

function kcalTotal(logs: FoodLogWithFood[]): number {
  return Math.round(logs.reduce((sum, l) => sum + caloriesForServings(l.food, l.servings), 0))
}

/** One bullet per logged food: name, logged quantity, kcal and macros. */
function foodLines(logs: FoodLogWithFood[], t: TFunction): string[] {
  return logs.map((log) => {
    const amount = round(log.servings * log.food.serving_amount, 2)
    const kcal = Math.round(caloriesForServings(log.food, log.servings))
    const scaled = scaleMacros(log.food, log.servings)
    const macros = MACROS.map((m) => `${t(`macro.${m.key}Abbr`)} ${round(scaled[m.field])}g`).join(
      ' · ',
    )
    return `• ${log.food.name} — ${amount} ${log.food.serving_unit} · ${kcal} ${t('common.kcal')} (${macros})`
  })
}

/** Chat-ready text for a single meal on a date. Empty string when no logs. */
export function formatMealText(
  meal: ExportMeal,
  logs: FoodLogWithFood[],
  date: string,
  locale: string,
  t: TFunction,
): string {
  if (logs.length === 0) return ''
  const lines = [
    `${mealEmoji(meal.key)} ${meal.label} — ${formatLong(date, locale)}`,
    ...foodLines(logs, t),
    '',
    `${t('export.total')}: ${kcalTotal(logs)} ${t('common.kcal')} · ${macroLine(logs, t)}`,
  ]
  return lines.join('\n')
}

/**
 * Chat-ready text for a whole day, grouped by the user's meals in their own
 * order (empty meals skipped).
 */
export function formatDayText(
  logs: FoodLogWithFood[],
  date: string,
  locale: string,
  t: TFunction,
  meals: ExportMeal[],
): string {
  if (logs.length === 0) return ''
  const sections = meals.flatMap((meal) => {
    const mealLogs = logs.filter((l) => l.meal === meal.key)
    if (mealLogs.length === 0) return []
    return [
      [
        `${mealEmoji(meal.key)} ${meal.label} · ${kcalTotal(mealLogs)} ${t('common.kcal')}`,
        ...foodLines(mealLogs, t),
      ].join('\n'),
    ]
  })
  const totals = sumMacros(logs.map((l) => scaleMacros(l.food, l.servings)))
  const totalNames = MACROS.map((m) => `${t(`macro.${m.key}`)} ${round(totals[m.field])}g`).join(
    ' · ',
  )
  return [
    `📅 ${formatLong(date, locale)}`,
    '',
    sections.join('\n\n'),
    '',
    `${t('export.total')}: ${kcalTotal(logs)} ${t('common.kcal')}`,
    totalNames,
  ].join('\n')
}

import { isNativePlatform } from './platform'

export type ShareOutcome = 'shared' | 'copied' | 'dismissed'

/**
 * Share text via the native share sheet when available, otherwise copy it to
 * the clipboard. Returns how the text left the app so the caller can show the
 * right feedback ('dismissed' = user closed the share sheet without sending).
 *
 * Inside a Capacitor WebView neither Web API is usable — `navigator.share` is
 * undefined and `navigator.clipboard` is blocked on the non-secure custom
 * scheme — so both would throw and the caller would show a share failure for
 * something that works fine natively. The native plugins are loaded through a
 * dynamic import so they never enter the web bundle, and the return type is
 * unchanged so callers need no branch of their own.
 */
export async function shareText(text: string): Promise<ShareOutcome> {
  if (isNativePlatform()) return shareNative(text)

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'dismissed'
      // NotAllowedError etc. — fall through to the clipboard.
    }
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}

async function shareNative(text: string): Promise<ShareOutcome> {
  try {
    const { Share } = await import('@capacitor/share')
    await Share.share({ text })
    return 'shared'
  } catch {
    // @capacitor/share rejects when the user dismisses the sheet, and there is
    // no distinguishable error for it, so fall back to the clipboard rather
    // than reporting a failure the user caused deliberately.
    try {
      const { Clipboard } = await import('@capacitor/clipboard')
      await Clipboard.write({ string: text })
      return 'copied'
    } catch {
      return 'dismissed'
    }
  }
}
