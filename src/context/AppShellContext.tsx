import { createContext, useContext, useState, type ReactNode } from 'react'
import type { MealKey } from '@/lib/constants'
import { todayISO } from '@/lib/date'

interface AppShellValue {
  /** The date the dashboard / add-food flow operates on (YYYY-MM-DD). */
  selectedDate: string
  setSelectedDate: (iso: string) => void
  /** Open the Add Food overlay, optionally pre-selecting a meal. */
  openAddFood: (opts?: { meal?: MealKey }) => void
  /** Bumped whenever food logs change, so views can refetch. */
  foodLogVersion: number
  bumpFoodLogVersion: () => void
  /** The same idea for hydration, kept separate so a drink doesn't refetch food. */
  waterVersion: number
  bumpWaterVersion: () => void
  /** A day's foods captured for pasting into another day, or null. */
  copiedDay: { date: string; count: number } | null
  copyDay: (date: string, count: number) => void
  clearCopiedDay: () => void
  /** A single meal's foods captured for pasting into any meal/day, or null. */
  copiedMeal: { date: string; meal: MealKey; count: number } | null
  copyMeal: (date: string, meal: MealKey, count: number) => void
  clearCopiedMeal: () => void
  /** internal — consumed by AppLayout to render the modal */
  _addFood: { open: boolean; meal?: MealKey }
  _closeAddFood: () => void
}

const AppShellContext = createContext<AppShellValue | undefined>(undefined)

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [selectedDate, setSelectedDate] = useState<string>(todayISO())
  const [foodLogVersion, setFoodLogVersion] = useState(0)
  const [waterVersion, setWaterVersion] = useState(0)
  const [addFood, setAddFood] = useState<{ open: boolean; meal?: MealKey }>({ open: false })
  const [copiedDay, setCopiedDay] = useState<{ date: string; count: number } | null>(null)
  const [copiedMeal, setCopiedMeal] = useState<
    { date: string; meal: MealKey; count: number } | null
  >(null)

  const value: AppShellValue = {
    selectedDate,
    setSelectedDate,
    foodLogVersion,
    bumpFoodLogVersion: () => setFoodLogVersion((v) => v + 1),
    waterVersion,
    bumpWaterVersion: () => setWaterVersion((v) => v + 1),
    copiedDay,
    copyDay: (date, count) => setCopiedDay({ date, count }),
    clearCopiedDay: () => setCopiedDay(null),
    copiedMeal,
    copyMeal: (date, meal, count) => setCopiedMeal({ date, meal, count }),
    clearCopiedMeal: () => setCopiedMeal(null),
    openAddFood: (opts) => setAddFood({ open: true, meal: opts?.meal }),
    _addFood: addFood,
    _closeAddFood: () => setAddFood({ open: false }),
  }

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppShell(): AppShellValue {
  const ctx = useContext(AppShellContext)
  if (!ctx) throw new Error('useAppShell must be used within an AppShellProvider')
  return ctx
}
