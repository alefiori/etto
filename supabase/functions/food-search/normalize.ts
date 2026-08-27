// Pure, runtime-agnostic normalization for the food-search Edge Function.
//
// Everything here is free of Deno/Node globals and network I/O, so it can be
// imported both by the Deno function (index.ts) and by the Node/Vitest unit
// tests (normalize.test.ts). index.ts keeps the fetch/env/serving concerns; this
// module keeps the "raw API JSON -> ExternalFood" mapping that's worth testing.

// Mirrors src/lib/foodSources.ts ExternalFood (kept in sync intentionally; the
// Deno runtime can't import from the app's src/).
export type ExternalSource =
  | 'openfoodfacts'
  | 'usda'
  // National food-composition tables, served from our own reference_foods table
  // rather than an external API. See supabase/migrations/0016.
  | 'ciqual'
  | 'cofid'
  | 'crea'
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
 * others blank is kept, with the blanks treated as 0. That leniency is for
 * OFF specifically: it stops us from
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
  /** Barcode on Branded foods; used by index.ts as the barcode fallback. */
  gtinUpc?: string
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
// Reference food-composition tables (ANSES-Ciqual, CoFID, CREA)
//
// These rows come from our own `reference_foods` table via the
// search_reference_foods() RPC rather than an external API, so they arrive
// already validated: the import pipeline (scripts/reference-foods.mjs) drops
// any food with an undetermined macro instead of publishing it as 0. The
// mapping here is therefore a rename, not a rescue — anything malformed at this
// point means the RPC contract changed, and is dropped rather than guessed at.
// ---------------------------------------------------------------------------

/** One row as returned by the search_reference_foods() RPC. */
export interface ReferenceRow {
  source?: string
  external_id?: string
  name?: string
  serving_amount?: number
  serving_unit?: string
  carbs_g?: number
  protein_g?: number
  fats_g?: number
}

const REFERENCE_SOURCES = ['ciqual', 'cofid', 'crea'] as const

export function normalizeReference(r: ReferenceRow | undefined): ExternalFood | null {
  if (!r) return null
  const source = (r.source || '') as (typeof REFERENCE_SOURCES)[number]
  if (!REFERENCE_SOURCES.includes(source)) return null

  const id = (r.external_id || '').trim()
  const name = (r.name || '').trim()
  if (!id || !name) return null

  const carbs = num(r.carbs_g)
  const protein = num(r.protein_g)
  const fat = num(r.fats_g)
  // Unlike OFF, a missing macro here is not a thin community entry — it is a
  // broken contract, because the importer guarantees all three are present.
  if (carbs === null || protein === null || fat === null) return null

  // Composition tables are per 100 g, except CoFID's alcoholic beverages, which
  // are tabulated per 100 ml. Carry the unit through rather than silently
  // restating a volume as a mass.
  const amount = num(r.serving_amount)
  const unit = (r.serving_unit || '').trim()

  return {
    source,
    externalId: id,
    name,
    // A composition-table entry is a generic food, never a branded product.
    brand: null,
    serving_amount: amount !== null && amount > 0 ? amount : 100,
    serving_unit: unit === 'ml' ? 'ml' : 'g',
    carbs_g: round(carbs),
    protein_g: round(protein),
    fats_g: round(fat),
  }
}
