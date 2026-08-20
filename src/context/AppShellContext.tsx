import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { MealKey } from '@/lib/constants'
import type { CustomFoodPrefill } from '@/lib/foods'
import { todayISO } from '@/lib/date'
import { useDayRollover } from '@/hooks/useDayRollover'

/**
 * What is waiting to be pasted, if anything.
 *
 * One slot rather than one per kind: a second copy replaces the first. Three
 * independent clipboards meant a day, a meal and a food could all be pending at
 * once — three banners stacked above the meals, and two competing paste buttons
 * in every meal header, which is what squeezed a meal's own name out of its
 * card. It also made "paste" ambiguous exactly when it mattered.
 *
 * A day pastes into a day and the other two paste into a meal, so `kind` is
 * what tells a surface whether the clipboard is any of its business.
 */
export type Clipboard =
  | { kind: 'day'; date: string; count: number }
  | { kind: 'meal'; date: string; meal: MealKey; count: number }
  | { kind: 'food'; foodId: string; name: string; servings: number }

interface AppShellValue {
  /** The date the dashboard / add-food flow operates on (YYYY-MM-DD). */
  selectedDate: string
  setSelectedDate: (iso: string) => void
  /** Open the Add Food overlay, optionally pre-selecting a meal. */
  openAddFood: (opts?: { meal?: MealKey }) => void
  /**
   * Open the custom-food form.
   *
   * It lives up here rather than on the page that lists foods because two
   * unrelated surfaces open it — My Foods, and the Add Food overlay's "edit as
   * custom" — and one of those is itself a modal. Owning it at the shell means
   * the caller closes itself and the form takes over, instead of a modal having
   * to render another modal inside itself.
   *
   * `id` edits an existing custom food; `prefill` starts a new one seeded from
   * an imported food. Neither is the same as the other, and passing both is a
   * caller bug — `id` wins, since editing a real row is the safer reading.
   */
  openCustomFood: (opts?: { id?: string; prefill?: CustomFoodPrefill }) => void
  /** Open the Pro paywall. Same arrangement as openAddFood. */
  openPaywall: () => void
  /** Bumped whenever food logs change, so views can refetch. */
  foodLogVersion: number
  bumpFoodLogVersion: () => void
  /** The same idea for the food *library* — a custom food saved or deleted. */
  foodsVersion: number
  bumpFoodsVersion: () => void
  /** The same idea for hydration, kept separate so a drink doesn't refetch food. */
  waterVersion: number
  bumpWaterVersion: () => void
  /** What was copied and is waiting to be pasted, or null. */
  clipboard: Clipboard | null
  /** A day's foods, for pasting into another day. */
  copyDay: (date: string, count: number) => void
  /** One meal's foods, for pasting into any meal on any day. */
  copyMeal: (date: string, meal: MealKey, count: number) => void
  /** One logged food, for pasting into any meal on any day. */
  copyFood: (foodId: string, name: string, servings: number) => void
  clearClipboard: () => void
  /** internal — consumed by AppLayout to render the modals */
  _addFood: { open: boolean; meal?: MealKey }
  _closeAddFood: () => void
  _customFood: { open: boolean; id?: string; prefill?: CustomFoodPrefill }
  _closeCustomFood: () => void
  _paywallOpen: boolean
  _closePaywall: () => void
}

const AppShellContext = createContext<AppShellValue | undefined>(undefined)

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [selectedDate, setSelectedDate] = useState<string>(todayISO())
  const [foodLogVersion, setFoodLogVersion] = useState(0)
  const [foodsVersion, setFoodsVersion] = useState(0)
  const [waterVersion, setWaterVersion] = useState(0)
  const [addFood, setAddFood] = useState<{ open: boolean; meal?: MealKey }>({ open: false })
  const [customFood, setCustomFood] = useState<{
    open: boolean
    id?: string
    prefill?: CustomFoodPrefill
  }>({ open: false })
  const [clipboard, setClipboard] = useState<Clipboard | null>(null)

  /**
   * `?checkout=pro` opens the paywall on arrival.
   *
   * This is where the native apps' external-purchase link lands (see
   * lib/purchases/externalPurchase.ts) — a link that dropped someone on the
   * dashboard and left them to go hunting for the paywall would waste the one
   * click the stores allow. Useful for a plain marketing link too.
   *
   * The parameter is stripped afterwards so a refresh, or a shared URL, doesn't
   * reopen a modal the user has already dismissed. `replaceState` rather than a
   * router navigation: this must not add a history entry that Back would land on.
   */
  const [paywallOpen, setPaywallOpen] = useState(
    () => new URL(window.location.href).searchParams.get('checkout') === 'pro',
  )

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('checkout') !== 'pro') return
    url.searchParams.delete('checkout')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }, [])

  /**
   * Re-opening the app after midnight starts on the new day.
   *
   * The date is picked once at mount, and backgrounding the app doesn't
   * unmount it — so without this, yesterday stays on screen and today's
   * breakfast gets logged against it. Snapping back unconditionally (rather
   * than only when the user was sitting on "today") is the point: the first
   * thing you see on re-opening is the day you are actually in.
   */
  useDayRollover((today) => setSelectedDate(today))

  const value: AppShellValue = {
    selectedDate,
    setSelectedDate,
    foodLogVersion,
    bumpFoodLogVersion: () => setFoodLogVersion((v) => v + 1),
    foodsVersion,
    bumpFoodsVersion: () => setFoodsVersion((v) => v + 1),
    waterVersion,
    bumpWaterVersion: () => setWaterVersion((v) => v + 1),
    clipboard,
    copyDay: (date, count) => setClipboard({ kind: 'day', date, count }),
    copyMeal: (date, meal, count) => setClipboard({ kind: 'meal', date, meal, count }),
    copyFood: (foodId, name, servings) => setClipboard({ kind: 'food', foodId, name, servings }),
    clearClipboard: () => setClipboard(null),
    openAddFood: (opts) => setAddFood({ open: true, meal: opts?.meal }),
    openCustomFood: (opts) =>
      setCustomFood(
        opts?.id
          ? { open: true, id: opts.id }
          : { open: true, prefill: opts?.prefill },
      ),
    openPaywall: () => setPaywallOpen(true),
    _addFood: addFood,
    _closeAddFood: () => setAddFood({ open: false }),
    _customFood: customFood,
    _closeCustomFood: () => setCustomFood({ open: false }),
    _paywallOpen: paywallOpen,
    _closePaywall: () => setPaywallOpen(false),
  }

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppShell(): AppShellValue {
  const ctx = useContext(AppShellContext)
  if (!ctx) throw new Error('useAppShell must be used within an AppShellProvider')
  return ctx
}
