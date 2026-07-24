import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Food, FoodLog, FoodLogWithFood, MealKey } from '@/lib/database.types'

/**
 * Render a component inside a MemoryRouter. UI primitives read translations via
 * `useI18n`, which falls back to the browser locale when no provider is present
 * (see src/context/I18nContext.tsx), so most component tests need no other
 * providers — mock hooks/context per-test when a page depends on them.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', ...options }: { route?: string } & RenderOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
  }
  return render(ui, { wrapper: Wrapper, ...options })
}

let seq = 0
const nextId = (prefix: string) => `${prefix}-${++seq}`

/** Build a Food row with sensible defaults; override any field. */
export function makeFood(overrides: Partial<Food> = {}): Food {
  return {
    id: nextId('food'),
    user_id: 'user-1',
    name: 'Test Food',
    brand: null,
    serving_amount: 100,
    serving_unit: 'g',
    carbs_g: 10,
    protein_g: 5,
    fats_g: 2,
    source: 'custom',
    off_id: null,
    is_custom: true,
    is_public: false,
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** Build a FoodLog row with sensible defaults; override any field. */
export function makeFoodLog(overrides: Partial<FoodLog> = {}): FoodLog {
  return {
    id: nextId('log'),
    user_id: 'user-1',
    food_id: 'food-1',
    log_date: '2024-01-01',
    meal: 'breakfast' as MealKey,
    servings: 1,
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** Build a food_logs row joined with its food (dashboard shape). */
export function makeFoodLogWithFood(
  logOverrides: Partial<FoodLog> = {},
  foodOverrides: Partial<Food> = {},
): FoodLogWithFood {
  const food = makeFood(foodOverrides)
  return { ...makeFoodLog({ food_id: food.id, ...logOverrides }), food }
}
