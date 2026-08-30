import { describe, it, expect } from 'vitest'
import {
  buildExportFile,
  buildExportJson,
  buildFoodLogCsv,
  csvCell,
  csvRow,
  exportFilename,
  type ExportBundle,
} from './exportData'
import type { Food, Meal } from './database.types'

function food(overrides: Partial<Food> = {}): Food {
  return {
    id: 'f1',
    user_id: 'u1',
    name: 'Rolled oats',
    brand: 'Quaker',
    serving_amount: 100,
    serving_unit: 'g',
    carbs_g: 60,
    protein_g: 13,
    fats_g: 7,
    source: 'custom',
    off_id: null,
    is_custom: true,
    is_public: false,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function meal(key: string, name: string | null): Meal {
  return {
    id: `m-${key}`,
    user_id: 'u1',
    key,
    name,
    icon: 'restaurant',
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function bundle(overrides: Partial<ExportBundle> = {}): ExportBundle {
  return {
    exportedAt: '2026-08-12T09:00:00.000Z',
    profile: null,
    meals: [meal('breakfast', 'Colazione')],
    targets: [],
    foods: [food()],
    logs: [
      {
        id: 'l1',
        user_id: 'u1',
        food_id: 'f1',
        log_date: '2026-08-11',
        meal: 'breakfast',
        servings: 1.5,
        created_at: '2026-08-11T07:00:00.000Z',
        food: food(),
      },
    ],
    weights: [],
    water: [],
    ...overrides,
  }
}

describe('csvCell', () => {
  it('leaves a plain value alone', () => {
    expect(csvCell('Banana')).toBe('Banana')
    expect(csvCell(42)).toBe('42')
  })

  it('renders null and undefined as an empty field, not "null"', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('quotes a value containing the delimiter', () => {
    // Without this, "Beans, baked" silently becomes two columns.
    expect(csvCell('Beans, baked')).toBe('"Beans, baked"')
  })

  it('quotes and doubles embedded quotes', () => {
    expect(csvCell('Pasta "al dente"')).toBe('"Pasta ""al dente"""')
  })

  it('quotes a value containing a newline', () => {
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })

  it('does not quote an apostrophe, which needs no escaping', () => {
    expect(csvCell('Chef’s salad')).toBe('Chef’s salad')
  })
})

describe('csvRow', () => {
  it('joins cells with commas, quoting only what needs it', () => {
    expect(csvRow(['2026-08-11', 'Beans, baked', 1])).toBe('2026-08-11,"Beans, baked",1')
  })
})

describe('buildFoodLogCsv', () => {
  it('starts with a header row', () => {
    const [header] = buildFoodLogCsv(bundle()).split('\r\n')
    expect(header).toBe(
      'date,meal,food,brand,source,servings,amount,unit,kcal,carbs_g,protein_g,fats_g',
    )
  })

  it('uses CRLF line endings and ends with one', () => {
    const csv = buildFoodLogCsv(bundle())
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(2)
  })

  it('scales the macros and the amount to the servings logged', () => {
    const [, row] = buildFoodLogCsv(bundle()).split('\r\n')
    // 1.5 × 100 g of a food with 60/13/7 per 100 g = 150 g, 90/19.5/10.5,
    // and 4·90 + 4·19.5 + 9·10.5 = 533 kcal.
    expect(row).toBe('2026-08-11,Colazione,Rolled oats,Quaker,custom,1.5,150,g,533,90,19.5,10.5')
  })

  it('uses the meal’s key when it still carries its built-in label', () => {
    const b = bundle({ meals: [meal('breakfast', null)] })
    expect(buildFoodLogCsv(b).split('\r\n')[1]).toContain(',breakfast,')
  })

  it('falls back to the stored meal slug for a meal that no longer exists', () => {
    const b = bundle({ meals: [] })
    expect(buildFoodLogCsv(b).split('\r\n')[1]).toContain(',breakfast,')
  })

  it('skips a log whose food has gone, rather than emitting an empty row', () => {
    const b = bundle()
    b.logs[0].food = null
    expect(buildFoodLogCsv(b).split('\r\n').filter(Boolean)).toHaveLength(1)
  })

  it('quotes a food name containing a comma', () => {
    const b = bundle()
    b.logs[0].food = food({ name: 'Beans, baked' })
    expect(buildFoodLogCsv(b)).toContain('"Beans, baked"')
  })

  it('emits an empty brand field rather than the word null', () => {
    const b = bundle()
    b.logs[0].food = food({ brand: null })
    expect(buildFoodLogCsv(b).split('\r\n')[1]).toContain('Rolled oats,,custom')
  })
})

describe('buildExportJson', () => {
  it('carries a header naming the app, schema and units', () => {
    const parsed = JSON.parse(buildExportJson(bundle()))
    expect(parsed.app).toBe('Etto')
    expect(parsed.schema).toBe(1)
    expect(parsed.exportedAt).toBe('2026-08-12T09:00:00.000Z')
    // Numbers with no stated unit are not portable data.
    expect(parsed.units.weight).toContain('kilogram')
    expect(parsed.units.water).toContain('millilitre')
  })

  it('includes every table the account owns', () => {
    const parsed = JSON.parse(buildExportJson(bundle()))
    expect(Object.keys(parsed)).toEqual(
      expect.arrayContaining([
        'profile',
        'meals',
        'macroTargets',
        'foods',
        'foodLogs',
        'weightLogs',
        'waterLogs',
      ]),
    )
  })

  it('does not include the billing row', () => {
    // subscriptions is store-side billing state, and an export is not the place
    // to hand someone their transaction identifiers.
    expect(buildExportJson(bundle())).not.toContain('subscription')
  })

  it('round-trips the logs with their embedded food', () => {
    const parsed = JSON.parse(buildExportJson(bundle()))
    expect(parsed.foodLogs[0].food.name).toBe('Rolled oats')
  })
})

describe('exportFilename', () => {
  it('is dated and sortable', () => {
    const at = new Date(2026, 7, 12)
    expect(exportFilename('json', at)).toBe('etto-export-2026-08-12.json')
    expect(exportFilename('csv', at)).toBe('etto-food-log-2026-08-12.csv')
  })

  it('zero-pads a single-digit month and day', () => {
    expect(exportFilename('json', new Date(2026, 0, 3))).toBe('etto-export-2026-01-03.json')
  })
})

describe('buildExportFile', () => {
  it('pairs each format with its own mime type and body', () => {
    const csv = buildExportFile(bundle(), 'csv')
    expect(csv.mimeType).toBe('text/csv')
    expect(csv.contents.startsWith('date,meal,food')).toBe(true)

    const json = buildExportFile(bundle(), 'json')
    expect(json.mimeType).toBe('application/json')
    expect(JSON.parse(json.contents).app).toBe('Etto')
  })
})
