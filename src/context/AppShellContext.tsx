import { createContext, useContext, useState, type ReactNode } from 'react'
import type { MealKey } from '@/lib/constants'
import { todayISO } from '@/lib/date'

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
  /** Open the Pro paywall. Same arrangement as openAddFood. */
  openPaywall: () => void
  /** Bumped whenever food logs change, so views can refetch. */
  foodLogVersion: number
  bumpFoodLogVersion: () => void
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
  _paywallOpen: boolean
  _closePaywall: () => void
}

const AppShellContext = createContext<AppShellValue | undefined>(undefined)

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [selectedDate, setSelectedDate] = useState<string>(todayISO())
  const [foodLogVersion, setFoodLogVersion] = useState(0)
  const [waterVersion, setWaterVersion] = useState(0)
  const [addFood, setAddFood] = useState<{ open: boolean; meal?: MealKey }>({ open: false })
  const [paywallOpen, setPaywallOpen] = useState(false)
  const [clipboard, setClipboard] = useState<Clipboard | null>(null)

  const value: AppShellValue = {
    selectedDate,
    setSelectedDate,
    foodLogVersion,
    bumpFoodLogVersion: () => setFoodLogVersion((v) => v + 1),
    waterVersion,
    bumpWaterVersion: () => setWaterVersion((v) => v + 1),
    clipboard,
    copyDay: (date, count) => setClipboard({ kind: 'day', date, count }),
    copyMeal: (date, meal, count) => setClipboard({ kind: 'meal', date, meal, count }),
    copyFood: (foodId, name, servings) => setClipboard({ kind: 'food', foodId, name, servings }),
    clearClipboard: () => setClipboard(null),
    openAddFood: (opts) => setAddFood({ open: true, meal: opts?.meal }),
    openPaywall: () => setPaywallOpen(true),
    _addFood: addFood,
    _closeAddFood: () => setAddFood({ open: false }),
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
