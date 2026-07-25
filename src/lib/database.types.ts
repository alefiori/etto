/** Hand-written types mirroring the SQL schema in supabase/migrations. */

/**
 * The slug stored on `food_logs.meal`, matching a `meals.key` row of the same
 * user. Meals are user-editable, so this is free-form text rather than a fixed
 * union — see {@link BuiltInMealKey} in lib/constants for the four defaults.
 */
export type MealKey = string
export type FoodSource = 'custom' | 'openfoodfacts' | 'usda' | 'edamam'
/** External (non-custom) food databases the app imports from. */
export type ExternalSource = Exclude<FoodSource, 'custom'>

// NOTE: these are `type` aliases, not interfaces — object types from `type`
// satisfy `Record<string, unknown>` (the supabase-js GenericSchema constraint),
// whereas `interface` declarations do not (no implicit index signature).
export type MacroTarget = {
  id: string
  user_id: string
  day_of_week: number // 0 (Sun) – 6 (Sat)
  carbs_g: number
  protein_g: number
  fats_g: number
  created_at: string
  updated_at: string
}

export type Food = {
  id: string
  user_id: string | null
  name: string
  brand: string | null
  serving_amount: number
  serving_unit: string
  carbs_g: number
  protein_g: number
  fats_g: number
  source: FoodSource
  off_id: string | null
  is_custom: boolean
  /** When true, this custom food is shared to the community and readable by all. */
  is_public: boolean
  created_at: string
}

export type Profile = {
  id: string
  /** Explicit language choice; null means "follow the device language". */
  off_language: string | null
  created_at: string
  updated_at: string
}

/**
 * One of the user's meals. `key` is the stable slug food logs point at; `name`
 * is null while the meal still uses its built-in localized label.
 */
export type Meal = {
  id: string
  user_id: string
  key: MealKey
  name: string | null
  /** Material Symbols icon name. */
  icon: string
  position: number
  created_at: string
  updated_at: string
}

export type FoodLog = {
  id: string
  user_id: string
  food_id: string
  log_date: string // YYYY-MM-DD
  meal: MealKey
  servings: number
  created_at: string
}

/** A food_logs row joined with its food, as used on the dashboard. */
export interface FoodLogWithFood extends FoodLog {
  food: Food
}

export interface Database {
  public: {
    Tables: {
      macro_targets: {
        Row: MacroTarget
        Insert: Omit<MacroTarget, 'id' | 'created_at' | 'updated_at'> &
          Partial<Pick<MacroTarget, 'id' | 'created_at' | 'updated_at'>>
        Update: Partial<MacroTarget>
        Relationships: []
      }
      foods: {
        Row: Food
        Insert: Omit<Food, 'id' | 'created_at' | 'is_public'> &
          Partial<Pick<Food, 'id' | 'created_at' | 'is_public'>>
        Update: Partial<Food>
        Relationships: []
      }
      food_logs: {
        Row: FoodLog
        Insert: Omit<FoodLog, 'id' | 'created_at'> & Partial<Pick<FoodLog, 'id' | 'created_at'>>
        Update: Partial<FoodLog>
        Relationships: []
      }
      meals: {
        Row: Meal
        Insert: Omit<Meal, 'id' | 'created_at' | 'updated_at'> &
          Partial<Pick<Meal, 'id' | 'created_at' | 'updated_at'>>
        Update: Partial<Meal>
        Relationships: []
      }
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'updated_at'> &
          Partial<Pick<Profile, 'off_language' | 'created_at' | 'updated_at'>>
        Update: Partial<Profile>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
