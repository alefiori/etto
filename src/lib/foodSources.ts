import type { ExternalSource, FoodSource } from './database.types'

/**
 * A food from an external database (Open Food Facts, USDA FoodData Central) or
 * from one of the national food-composition tables we host ourselves
 * (ANSES-Ciqual, CoFID, CREA), normalized to a fixed 100 g basis so it maps
 * cleanly onto our `foods` model.
 * `externalId` is stored in the `foods.off_id` column and de-duplicated per
 * source.
 */
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

/** Human-readable labels for each food source (used by the attribution tag). */
export const SOURCE_LABELS: Record<FoodSource, string> = {
  custom: 'Custom',
  openfoodfacts: 'Open Food Facts',
  usda: 'USDA',
  ciqual: 'ANSES-Ciqual',
  cofid: 'CoFID',
  crea: 'CREA',
  // Retired source. Kept so foods logged from Edamam before it was dropped
  // still show their attribution rather than an empty chip.
  edamam: 'Edamam',
}

/** Icon (Material Symbols) per source. */
export const SOURCE_ICONS: Record<FoodSource, string> = {
  custom: 'restaurant',
  openfoodfacts: 'public',
  usda: 'verified',
  // The three composition tables share a glyph; the label chip tells them
  // apart, and reusing one already in the subset font avoids a font rebuild.
  ciqual: 'table_view',
  cofid: 'table_view',
  crea: 'table_view',
  edamam: 'nutrition',
}

/**
 * Where each imported food's data comes from, and under what terms.
 *
 * This is a licence obligation, not a nicety: Etalab's Open Licence and the
 * Open Government Licence both require the source *and the version* to be
 * stated wherever the data is reused, and CREA asks the same. The per-result
 * {@link SOURCE_LABELS} chip satisfies "clear indication of source" at the point
 * of use; this backs it with the full notice on the profile page.
 *
 * The strings stay in English and are deliberately not routed through i18n:
 * ANSES prescribes its citation wording, and a translated licence name is no
 * longer the licence's name. Only the section heading is translated.
 *
 * `openfoodfacts` and `usda` are absent because they are credited in the app's
 * existing About/Credits copy; the entries here are the ones whose licences name
 * an attribution requirement we satisfy in-app.
 */
export const SOURCE_ATTRIBUTION: Partial<
  Record<FoodSource, { label: string; version: string; license: string; url: string }>
> = {
  ciqual: {
    label: 'ANSES-Ciqual French food composition table',
    version: '2025',
    license: 'Licence Ouverte / Open Licence 2.0 (Etalab)',
    url: 'https://doi.org/10.57745/RDMHWY',
  },
  cofid: {
    label: "McCance and Widdowson's The Composition of Foods Integrated Dataset",
    version: '2021',
    license: 'Open Government Licence v3.0',
    url: 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid',
  },
  crea: {
    label: 'CREA Research Centre for Food and Nutrition — Tabelle di composizione degli alimenti',
    version: '2019',
    license: 'Used with attribution',
    url: 'https://www.crea.gov.it/alimenti-e-nutrizione',
  },
}
