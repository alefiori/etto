/**
 * Full data export (Pro).
 *
 * Distinct from `exportText.ts`, which formats one meal or one day as chat-ready
 * prose for a share sheet. This is the other kind of export: everything the
 * account owns, in a machine-readable form, for a spreadsheet, another app, or a
 * data-portability request.
 *
 * Two formats, because they answer different questions:
 *
 *   - **JSON** is the complete record — profile, meals, targets, foods, logs,
 *     weigh-ins, drinks — with the raw stored values and their units named in a
 *     header. It is what "give me my data" means, and it round-trips.
 *   - **CSV** is the food log, one logged food per row, with the macros already
 *     scaled to the quantity logged. It exists because a spreadsheet is what
 *     people actually do this with, and a nested JSON document isn't one.
 *
 * The billing row is deliberately *not* included. `public.subscriptions` is
 * store-side billing state the client can only read, it says nothing about the
 * user's own logging, and an export is not the place to hand someone a document
 * containing their transaction identifiers.
 */

import { supabase } from './supabase'
import { caloriesForServings, round, scaleMacros } from './macros'
import { isNativePlatform } from './platform'
import type {
  Food,
  FoodLog,
  MacroTarget,
  Meal,
  Profile,
  WaterLog,
  WeightLog,
} from './database.types'

/** Everything an export is built from. One fetch, then pure formatting. */
export interface ExportBundle {
  exportedAt: string
  profile: Profile | null
  meals: Meal[]
  targets: MacroTarget[]
  foods: Food[]
  logs: (FoodLog & { food: Food | null })[]
  weights: WeightLog[]
  water: WaterLog[]
}

export type ExportFormat = 'json' | 'csv'

/**
 * Read the whole account.
 *
 * No date range: an export that quietly stopped at 90 days would be the kind of
 * half-answer that makes people distrust the feature. RLS scopes every one of
 * these to the caller, which is why none of them filters on user_id — the same
 * reason the rest of the app's reads don't.
 *
 * `foods` is the user's own library only. Community foods they have logged
 * arrive through the join on `logs`, but their whole shared catalogue is not
 * theirs to export.
 */
export async function collectExport(): Promise<ExportBundle> {
  const [profile, meals, targets, foods, logs, weights, water] = await Promise.all([
    supabase.from('profiles').select('*').maybeSingle(),
    supabase.from('meals').select('*').order('position', { ascending: true }),
    supabase.from('macro_targets').select('*').order('day_of_week', { ascending: true }),
    supabase.from('foods').select('*').order('name', { ascending: true }),
    supabase
      .from('food_logs')
      .select('*, food:foods(*)')
      .order('log_date', { ascending: true }),
    supabase.from('weight_logs').select('*').order('log_date', { ascending: true }),
    supabase.from('water_logs').select('*').order('log_date', { ascending: true }),
  ])

  const failure = [profile, meals, targets, foods, logs, weights, water].find((r) => r.error)
  if (failure?.error) throw new Error(failure.error.message)

  return {
    exportedAt: new Date().toISOString(),
    profile: profile.data ?? null,
    meals: meals.data ?? [],
    targets: targets.data ?? [],
    foods: foods.data ?? [],
    // `as unknown as` for the same reason useFoodLogs needs it: database.types
    // is hand-written with empty `Relationships`, so supabase-js cannot infer
    // the embedded row's shape and types it as a relation error.
    logs: (logs.data ?? []) as unknown as ExportBundle['logs'],
    weights: weights.data ?? [],
    water: water.data ?? [],
  }
}

/**
 * The complete record, as JSON.
 *
 * Carries a small header naming the app, the schema version and the units, so
 * the file is readable in a year by someone who no longer has the app — an
 * export whose numbers need this codebase to interpret isn't portable.
 */
export function buildExportJson(bundle: ExportBundle): string {
  return JSON.stringify(
    {
      app: 'Etto',
      schema: 1,
      exportedAt: bundle.exportedAt,
      units: {
        macros: 'grams',
        weight: 'kilograms',
        water: 'millilitres',
        energy: 'kcal, derived from macros at 4/4/9 kcal per gram',
        servings: 'multiples of the food’s serving_amount + serving_unit',
      },
      profile: bundle.profile,
      meals: bundle.meals,
      macroTargets: bundle.targets,
      foods: bundle.foods,
      foodLogs: bundle.logs,
      weightLogs: bundle.weights,
      waterLogs: bundle.water,
    },
    null,
    2,
  )
}

/**
 * RFC 4180 quoting: wrap anything containing a delimiter, a quote or a newline,
 * and double the quotes inside. Skipping this is how an export of a food called
 * `Beans, baked` silently gains a column.
 */
export function csvCell(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',')
}

const FOOD_LOG_COLUMNS = [
  'date',
  'meal',
  'food',
  'brand',
  'source',
  'servings',
  'amount',
  'unit',
  'kcal',
  'carbs_g',
  'protein_g',
  'fats_g',
] as const

/**
 * The food log, one row per logged food, macros already scaled to the amount
 * logged.
 *
 * Stored rows hold `servings` against a food's per-serving macros, which is the
 * right shape for the app and the wrong one for a spreadsheet — nobody wants to
 * multiply 47 rows by hand. `amount`/`unit` restate the same quantity the way
 * the food is measured (1.5 × 100 g = 150 g).
 *
 * CRLF line endings, deliberately: it is what RFC 4180 specifies and what Excel
 * expects, and every other consumer accepts them.
 */
export function buildFoodLogCsv(bundle: ExportBundle): string {
  const mealNames = new Map(bundle.meals.map((m) => [m.key, m.name ?? m.key]))
  const rows = [csvRow([...FOOD_LOG_COLUMNS])]

  for (const log of bundle.logs) {
    const food = log.food
    if (!food) continue // A food deleted from under its log has nothing to report.
    const scaled = scaleMacros(food, log.servings)
    rows.push(
      csvRow([
        log.log_date,
        mealNames.get(log.meal) ?? log.meal,
        food.name,
        food.brand,
        food.source,
        round(log.servings, 3),
        round(log.servings * food.serving_amount, 3),
        food.serving_unit,
        Math.round(caloriesForServings(food, log.servings)),
        round(scaled.carbs_g, 2),
        round(scaled.protein_g, 2),
        round(scaled.fats_g, 2),
      ]),
    )
  }

  return rows.join('\r\n') + '\r\n'
}

/** `etto-export-2026-08-12.json` — sortable, and obvious a year later. */
export function exportFilename(format: ExportFormat, at = new Date()): string {
  const iso = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(
    at.getDate(),
  ).padStart(2, '0')}`
  return format === 'csv'
    ? `etto-food-log-${iso}.csv`
    : `etto-export-${iso}.json`
}

const MIME: Record<ExportFormat, string> = {
  json: 'application/json',
  csv: 'text/csv',
}

export interface ExportFile {
  filename: string
  mimeType: string
  contents: string
}

export function buildExportFile(bundle: ExportBundle, format: ExportFormat): ExportFile {
  return {
    filename: exportFilename(format),
    mimeType: MIME[format],
    contents: format === 'csv' ? buildFoodLogCsv(bundle) : buildExportJson(bundle),
  }
}

export type DeliveryOutcome = 'downloaded' | 'shared' | 'dismissed'

/**
 * Hand the file to the platform.
 *
 * A download on the web; a file written to the cache directory and passed to the
 * native share sheet otherwise. Text-sharing it the way `exportText.ts` does is
 * not an option here — a year of logs pasted into a chat message is not a file,
 * and neither store's share sheet will offer "save to Files" for a string.
 *
 * The native plugins load through a dynamic import so they stay out of the web
 * bundle, the same arrangement `shareText` uses.
 */
export async function deliverExport(file: ExportFile): Promise<DeliveryOutcome> {
  if (isNativePlatform()) return deliverNative(file)

  const blob = new Blob([file.contents], { type: `${file.mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = file.filename
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    // Give the navigation a tick before the blob goes away under it.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  return 'downloaded'
}

async function deliverNative(file: ExportFile): Promise<DeliveryOutcome> {
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])

  // Cache rather than Documents: this is a hand-off, not a document the app
  // owns, and the OS is welcome to reclaim it once the share sheet is done.
  await Filesystem.writeFile({
    path: file.filename,
    data: file.contents,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  })
  const { uri } = await Filesystem.getUri({
    path: file.filename,
    directory: Directory.Cache,
  })

  try {
    await Share.share({ title: file.filename, files: [uri] })
    return 'shared'
  } catch {
    // The plugin rejects on dismissal with nothing to distinguish it from a
    // real failure, so treat it as the user's choice — same as shareText.
    return 'dismissed'
  }
}
