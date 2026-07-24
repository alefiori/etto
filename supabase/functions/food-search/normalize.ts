// Pure, runtime-agnostic normalization for the food-search Edge Function.
//
// Everything here is free of Deno/Node globals and network I/O, so it can be
// imported both by the Deno function (index.ts) and by the Node/Vitest unit
// tests (normalize.test.ts). index.ts keeps the fetch/env/serving concerns; this
// module keeps the "raw API JSON -> ExternalFood" mapping that's worth testing.

// Mirrors src/lib/foodSources.ts ExternalFood (kept in sync intentionally; the
// Deno runtime can't import from the app's src/).
export type ExternalSource = 'openfoodfacts' | 'usda' | 'edamam'
export interface ExternalFood {
  source: ExternalSource
  externalId: string
  name: string
  brand: string | null
  serving_amount: number
  serving_unit: string
  carbs_g: number
  protein_g: number
  fats_g: number
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Mirrors src/lib/macros.ts round(). */
export function round(n: number, decimals = 1): number {
  const f = 10 ** decimals
  return Math.round((n + Number.EPSILON) * f) / f
}

export function num(v: number | string | undefined): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : null
}

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

/** De-duplicate by externalId, preserving order. */
export function dedupe(foods: ExternalFood[]): ExternalFood[] {
  const seen = new Set<string>()
  const out: ExternalFood[] = []
  for (const f of foods) {
    const key = `${f.source}:${f.externalId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(f)
  }
  return out
}

// ---------------------------------------------------------------------------
// Open Food Facts
// ---------------------------------------------------------------------------

export interface OffProduct {
  code?: string
  product_name?: string
  // The v2 product API returns brands as a comma-separated string;
  // Search-a-licious returns an array. Accept both.
  brands?: string | string[]
  nutriments?: Record<string, number | string | undefined>
  [key: string]: unknown
}

function offLocalizedName(p: OffProduct, lang: string): string {
  const localized = p[`product_name_${lang}`]
  return (typeof localized === 'string' ? localized : p.product_name || '').trim()
}

/** First brand from either an array (Search-a-licious) or a comma-separated string (v2). */
function offBrand(brands: string | string[] | undefined): string | null {
  if (Array.isArray(brands)) {
    const first = brands.find((b) => typeof b === 'string' && b.trim())
    return first ? first.trim() : null
  }
  if (typeof brands === 'string' && brands.trim()) return brands.split(',')[0].trim()
  return null
}

/**
 * Normalize one OFF product to a fixed 100 g basis.
 *
 * Returns null only when the product can't be logged at all: no code, no name,
 * or no macro data whatsoever. A product that carries *some* macros but leaves
 * others blank is kept, with the blanks treated as 0. This mirrors how the
 * Edamam adapter handles omitted nutrients and, importantly, stops us from
 * hiding the newly-added / community-entered OFF products that so often have
 * partial nutrition — exactly the foods users reported as "missing" from
 * search. Trade-off: a genuinely-unknown macro is recorded as 0 (which can
 * understate a food) rather than dropping the whole result; users can adjust it
 * by editing the imported food as a custom one.
 */
export function normalizeOff(p: OffProduct, lang: string): ExternalFood | null {
  const code = p.code
  if (!code) return null

  const name = offLocalizedName(p, lang)
  if (!name) return null

  const carbs100 = num(p.nutriments?.carbohydrates_100g)
  const protein100 = num(p.nutriments?.proteins_100g)
  const fat100 = num(p.nutriments?.fat_100g)
  // Drop only a bare match with no nutrition at all; otherwise keep it and fill
  // any missing macro with 0.
  if (carbs100 === null && protein100 === null && fat100 === null) return null

  return {
    source: 'openfoodfacts',
    externalId: code,
    name,
    brand: offBrand(p.brands),
    serving_amount: 100,
    serving_unit: 'g',
    carbs_g: round(carbs100 ?? 0),
    protein_g: round(protein100 ?? 0),
    fats_g: round(fat100 ?? 0),
  }
}

// ---------------------------------------------------------------------------
// USDA FoodData Central
// ---------------------------------------------------------------------------

export interface FdcNutrient {
  nutrientNumber?: string
  value?: number
}
export interface FdcFood {
  fdcId?: number
  description?: string
  brandName?: string
  brandOwner?: string
  foodNutrients?: FdcNutrient[]
}

// Standard FDC nutrient numbers: 203 protein, 204 fat, 205 carbohydrate.
const FDC_NUTRIENT = { protein: '203', fat: '204', carbs: '205' }

function fdcNutrient(nutrients: FdcNutrient[], number: string): number | null {
  const n = nutrients.find((x) => x.nutrientNumber === number)
  if (!n || typeof n.value !== 'number' || !Number.isFinite(n.value)) return null
  return n.value
}

export function normalizeFdc(f: FdcFood): ExternalFood | null {
  const id = f.fdcId
  const name = (f.description || '').trim()
  if (!id || !name) return null

  const nutrients = f.foodNutrients ?? []
  const carbs = fdcNutrient(nutrients, FDC_NUTRIENT.carbs)
  const protein = fdcNutrient(nutrients, FDC_NUTRIENT.protein)
  const fat = fdcNutrient(nutrients, FDC_NUTRIENT.fat)
  if (carbs === null || protein === null || fat === null) return null

  // FDC descriptions are often ALL CAPS for branded items; present nicely.
  const prettyName = name === name.toUpperCase() ? toTitleCase(name) : name

  return {
    source: 'usda',
    externalId: String(id),
    name: prettyName,
    brand: (f.brandName || f.brandOwner || '').trim() || null,
    serving_amount: 100,
    serving_unit: 'g',
    carbs_g: round(carbs),
    protein_g: round(protein),
    fats_g: round(fat),
  }
}

// ---------------------------------------------------------------------------
// Edamam Food Database
// ---------------------------------------------------------------------------

export interface EdamamFood {
  foodId?: string
  label?: string
  brand?: string
  // Nutrients are per 100 g: ENERC_KCAL energy, PROCNT protein, FAT fat,
  // CHOCDF carbohydrate. Edamam omits keys it has no value for.
  nutrients?: Record<string, number | undefined>
}
export interface EdamamHit {
  food?: EdamamFood
}

function edamamNutrient(f: EdamamFood, key: string): number | null {
  const v = f.nutrients?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function normalizeEdamam(f: EdamamFood | undefined): ExternalFood | null {
  if (!f) return null
  const id = (f.foodId || '').trim()
  const name = (f.label || '').trim()
  if (!id || !name) return null

  const carbs = edamamNutrient(f, 'CHOCDF')
  const protein = edamamNutrient(f, 'PROCNT')
  const fat = edamamNutrient(f, 'FAT')
  // Edamam omits zero-valued nutrients, so a missing macro on an otherwise
  // nutrition-bearing entry means 0 — but drop entries with no macro data at
  // all (e.g. bare parser matches without nutrition).
  if (carbs === null && protein === null && fat === null) return null

  return {
    source: 'edamam',
    externalId: id,
    name,
    brand: (f.brand || '').trim() || null,
    serving_amount: 100,
    serving_unit: 'g',
    carbs_g: round(carbs ?? 0),
    protein_g: round(protein ?? 0),
    fats_g: round(fat ?? 0),
  }
}
