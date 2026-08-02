/** Local-date helpers working in YYYY-MM-DD (no timezone surprises). */

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

/** Parse a YYYY-MM-DD string into a local Date (midnight local). */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, delta: number): string {
  const d = fromISODate(iso)
  d.setDate(d.getDate() + delta)
  return toISODate(d)
}

/** JS day-of-week (0 = Sunday) for a YYYY-MM-DD string. */
export function dayOfWeek(iso: string): number {
  return fromISODate(iso).getDay()
}

export function isToday(iso: string): boolean {
  return iso === todayISO()
}

/**
 * Whole days from `from` to `to` (negative when `to` is earlier).
 *
 * Both ends are snapped to local midnight before subtracting, so a DST
 * transition inside the range can't round the result to 0.96 of a day.
 */
export function diffDays(fromISO: string, toISO: string): number {
  const MS_PER_DAY = 86_400_000
  const from = fromISODate(fromISO)
  const to = fromISODate(toISO)
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY)
}

/** Every date from `from` to `to` inclusive. Empty when `to` precedes `from`. */
export function dateRange(fromISO: string, toISO: string): string[] {
  const out: string[] = []
  const total = diffDays(fromISO, toISO)
  for (let i = 0; i <= total; i++) out.push(addDays(fromISO, i))
  return out
}

/** e.g. "Thursday, October 26" — localized when a locale is given. */
export function formatLong(iso: string, locale?: string): string {
  return fromISODate(iso).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

/** Just the weekday, e.g. "Thursday" — localized when a locale is given. */
export function formatWeekday(iso: string, locale?: string): string {
  return fromISODate(iso).toLocaleDateString(locale, { weekday: 'long' })
}

/** e.g. "October 26" (no weekday) */
export function formatMonthDay(iso: string, locale?: string): string {
  return fromISODate(iso).toLocaleDateString(locale, {
    month: 'long',
    day: 'numeric',
  })
}

/** e.g. "Oct 26, 2023" */
export function formatShort(iso: string, locale?: string): string {
  return fromISODate(iso).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
