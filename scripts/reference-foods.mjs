// Pure parsing/mapping helpers for the national food-composition datasets that
// back the `reference_foods` table (see supabase/migrations/0016).
//
// Everything here is a pure function over strings and arrays: no fetch, no fs,
// no process. That is what lets scripts/reference-foods.test.mjs cover the part
// where the correctness risk actually lives, while build-reference-foods.mjs
// keeps the I/O.

// ---------------------------------------------------------------------------
// Dataset metadata
//
// The attribution strings are prescribed by the publishers. Do not paraphrase
// or translate them: both licences require the source and version to be stated
// wherever the data is reused, and ANSES specifies its citation wording.
// ---------------------------------------------------------------------------

export const DATASETS = {
  ciqual: {
    source: 'ciqual',
    nameLang: 'fr',
    license: 'Licence Ouverte / Open Licence 2.0 (Etalab)',
    attribution: 'Anses. 2025. Table de composition nutritionnelle des aliments Ciqual',
    sourceUrl: 'https://doi.org/10.57745/RDMHWY',
  },
  cofid: {
    source: 'cofid',
    nameLang: 'en',
    license: 'Open Government Licence v3.0',
    attribution:
      "McCance and Widdowson's The Composition of Foods Integrated Dataset 2021, " +
      'Office for Health Improvement and Disparities. Contains public sector information ' +
      'licensed under the Open Government Licence v3.0.',
    sourceUrl:
      'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid',
  },
  crea: {
    source: 'crea',
    nameLang: 'it',
    license: 'Used with attribution; see https://www.alimentinutrizione.it',
    attribution:
      'CREA Research Centre for Food and Nutrition — Tabelle di composizione degli alimenti (2019)',
    sourceUrl: 'https://www.crea.gov.it/alimenti-e-nutrizione',
  },
}

export const CSV_COLUMNS = [
  'source',
  'external_id',
  'name',
  'name_lang',
  'name_en',
  'synonyms',
  'serving_amount',
  'serving_unit',
  'carbs_g',
  'protein_g',
  'fats_g',
  'kcal',
  'dataset_version',
]

/**
 * Macros above this per 100 g mean we mapped the wrong column — the single most
 * likely way this import goes silently wrong is grabbing Energy (kcal) instead
 * of a macro, which lands in the hundreds.
 */
export const MACRO_SUM_LIMIT = 101

// ---------------------------------------------------------------------------
// Value parsing
//
// Shared policy across all three datasets:
//
//   trace   -> 0        ("traces", "Tr", "<x" where x <= TRACE_CEILING)
//   unknown -> drop     ("-", "N", "", missing, "<x" where x > TRACE_CEILING)
//   garbage -> throw
//
// Deliberately stricter than normalizeOff(), and matching normalizeFdc(). The
// Open Food Facts adapter fills unknowns with 0 because its long tail of
// community entries would otherwise vanish from search entirely; a national
// reference table has no such tail. Here an unknown macro is a documented data
// gap, and publishing it as 0 is precisely the "altering the data / distorting
// its meaning" that the Etalab reuse terms forbid. The importer reports every
// drop so the loss is visible rather than silent.
// ---------------------------------------------------------------------------

const TRACE_CEILING = 0.5

/** @typedef {{ value: number|null, kind: 'number'|'trace'|'unknown' }} ParsedValue */

const NUMBER = { kind: 'number' }
const TRACE = { value: 0, kind: 'trace' }
const UNKNOWN = { value: null, kind: 'unknown' }

/**
 * Shared numeric core. `decimalComma` swaps "59,7" -> "59.7" (Ciqual writes
 * French decimals; CoFID and CREA write points).
 */
function parseValue(raw, { decimalComma = false, traceWords = [], unknownWords = [] } = {}) {
  if (raw === null || raw === undefined) return UNKNOWN
  let s = String(raw).replace(/\u00a0/g, ' ').trim()
  if (s === '') return UNKNOWN

  const lower = s.toLowerCase()
  if (unknownWords.includes(lower)) return UNKNOWN
  if (traceWords.includes(lower)) return TRACE

  // "< 10" is an upper bound, not a measurement. Small enough and it is
  // indistinguishable from a trace; larger and we genuinely do not know.
  const bound = s.match(/^<\s*(.+)$/)
  if (bound) {
    const inner = parseValue(bound[1], { decimalComma, traceWords, unknownWords })
    if (inner.kind !== 'number') return UNKNOWN
    return inner.value <= TRACE_CEILING ? TRACE : UNKNOWN
  }

  if (decimalComma) s = s.replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new Error(`Unparseable nutrient value: ${JSON.stringify(String(raw))}`)
  }
  const n = Number(s)
  if (!Number.isFinite(n)) {
    throw new Error(`Unparseable nutrient value: ${JSON.stringify(String(raw))}`)
  }
  // A negative macro is not a data gap, it is a corrupt file. Fail loudly.
  if (n < 0) throw new Error(`Negative nutrient value: ${JSON.stringify(String(raw))}`)
  return { value: n, kind: NUMBER.kind }
}

/**
 * Ciqual <teneur>. The ANSES documentation is explicit that missing values must
 * not be treated as zero.
 * @returns {ParsedValue}
 */
export function parseTeneur(raw) {
  return parseValue(raw, {
    decimalComma: true,
    traceWords: ['traces', 'trace'],
    unknownWords: ['-', '', 'nd', 'n.d.'],
  })
}

/**
 * CoFID. Its user guide defines `Tr` as a trace and `N` as "present in
 * significant quantities, but no reliable information on the amount".
 * @returns {ParsedValue}
 */
export function parseCofidValue(raw) {
  return parseValue(raw, {
    traceWords: ['tr', 'trace'],
    unknownWords: ['n', '-', '', 'n/a'],
  })
}

/**
 * CREA detail pages. Values are plain decimals; a blank cell means the nutrient
 * was not determined.
 * @returns {ParsedValue}
 */
export function parseCreaValue(raw) {
  return parseValue(raw, {
    decimalComma: true,
    traceWords: ['tr', 'tracce', 'trace'],
    unknownWords: ['-', '', 'nd', 'n.d.'],
  })
}

// ---------------------------------------------------------------------------
// Minimal XML reading
//
// Ciqual's files are flat and machine-generated: <TABLE> of single-level
// records, no namespaces, no CDATA, attributes only for `missing=" "`. That is
// small enough to read with regexes and keeps this module dependency-free.
// ---------------------------------------------------------------------------

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decodeXml(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, e) => ENTITIES[e])
}

/** Split a Ciqual-style document into the inner text of each <RECORD> block. */
export function xmlRecords(xml, tag) {
  const out = []
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g')
  let m
  while ((m = re.exec(xml)) !== null) out.push(m[1])
  return out
}

/**
 * Read one field from a record. Returns null for `<tag missing=" " />` and for
 * an absent tag — both mean "no value", which the callers treat as unknown.
 */
export function xmlField(record, tag) {
  const paired = record.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`))
  if (paired) {
    const v = decodeXml(paired[1]).replace(/\u00a0/g, ' ').trim()
    return v === '' ? null : v
  }
  // Self-closing form, e.g. <alim_nom_sci missing=" " />
  if (new RegExp(`<${tag}(?:\\s[^>]*)?/>`).test(record)) return null
  return null
}

// ---------------------------------------------------------------------------
// Ciqual
// ---------------------------------------------------------------------------

/**
 * The constituents we pull, keyed by the column they feed.
 *
 * `code_INFOODS` alone is NOT unique in Ciqual 2025 — PROCNT matches both 25000
 * ("Protein") and 25003 ("Protein, crude, N x 6.25"), and ENERC matches four
 * energy variants. So each entry carries a name pattern too, and the resolver
 * asserts the pair identifies exactly one constituent.
 *
 * protein deliberately takes N x 6.25 rather than N x Jones' factor: 6.25 is the
 * EU 1169/2011 labelling basis, which is what a user comparing against a package
 * label expects and what the other sources in the app report.
 */
export const CIQUAL_CONSTITUENTS = {
  carbs_g: { tag: 'CHOAVL', name: /^carbohydrate\b/i },
  protein_g: { tag: 'PROCNT', name: /n\s*x\s*6\.25/i },
  fats_g: { tag: 'FAT', name: /^fat\b/i },
  kcal: { tag: 'ENERC', name: /regulation eu.*kcal/i },
}

/**
 * Resolve INFOODS tag + name pattern to Ciqual const_codes. Throws when a
 * constituent matches zero or several rows, printing the candidates — an
 * upstream renaming should stop the build, not silently shift a column.
 */
export function resolveConstCodes(constXml, wanted = CIQUAL_CONSTITUENTS) {
  const rows = xmlRecords(constXml, 'CONST').map((r) => ({
    code: xmlField(r, 'const_code'),
    tag: xmlField(r, 'code_INFOODS'),
    nameEn: xmlField(r, 'const_nom_eng') ?? '',
  }))
  if (rows.length === 0) throw new Error('const.xml contained no <CONST> records')

  const out = {}
  for (const [column, spec] of Object.entries(wanted)) {
    const hits = rows.filter((r) => r.tag === spec.tag && spec.name.test(r.nameEn))
    if (hits.length !== 1) {
      const sameTag = rows.filter((r) => r.tag === spec.tag)
      throw new Error(
        `Ciqual constituent for ${column} (${spec.tag} matching ${spec.name}) resolved to ` +
          `${hits.length} rows, expected 1. Candidates with that tag:\n` +
          sameTag.map((r) => `  ${r.code}  ${r.nameEn}`).join('\n'),
      )
    }
    out[column] = hits[0].code
  }
  return out
}

/** alim_grp.xml -> { [grp_code]: 'french name english name' }, used as synonyms. */
export function parseCiqualGroups(grpXml) {
  const byCode = {}
  for (const r of xmlRecords(grpXml, 'ALIM_GRP')) {
    const code = xmlField(r, 'alim_grp_code')
    if (!code || byCode[code]) continue
    byCode[code] = [xmlField(r, 'alim_grp_nom_fr'), xmlField(r, 'alim_grp_nom_eng')]
      .filter(Boolean)
      .join(' ')
  }
  return byCode
}

/**
 * Build the Ciqual rows.
 *
 * compo.xml is ~66 MB, so it is scanned once with a streaming-style regex that
 * keeps only the four constituents we care about (of 74) rather than
 * materializing every measurement.
 */
export function parseCiqual({ alimXml, compoXml, constXml, grpXml, version }) {
  const codes = resolveConstCodes(constXml)
  const columnByCode = new Map(Object.entries(codes).map(([col, code]) => [code, col]))
  const groups = grpXml ? parseCiqualGroups(grpXml) : {}
  const warnings = []

  const foods = new Map()
  for (const r of xmlRecords(alimXml, 'ALIM')) {
    const code = xmlField(r, 'alim_code')
    const nameFr = xmlField(r, 'alim_nom_fr')
    if (!code || !nameFr) continue
    const grp = xmlField(r, 'alim_grp_code')
    foods.set(code, {
      external_id: code,
      name: nameFr,
      name_en: xmlField(r, 'alim_nom_eng'),
      synonyms: [xmlField(r, 'alim_nom_sci'), grp ? groups[grp] : null].filter(Boolean).join(' '),
      values: {},
    })
  }

  for (const r of xmlRecords(compoXml, 'COMPO')) {
    const constCode = xmlField(r, 'const_code')
    const column = columnByCode.get(constCode)
    if (!column) continue
    const food = foods.get(xmlField(r, 'alim_code'))
    if (!food) continue
    food.values[column] = parseTeneur(xmlField(r, 'teneur'))
  }

  return finalize({
    source: 'ciqual',
    version,
    items: [...foods.values()],
    warnings,
  })
}

// ---------------------------------------------------------------------------
// CoFID
// ---------------------------------------------------------------------------

/**
 * CoFID's Proximates sheet carries its headings across rows 1-3, so the column
 * map is built by scanning those rows for nutrient tags rather than trusting a
 * fixed index. `rows` is an array of raw cell arrays as read from the sheet.
 */
export function cofidColumns(headerRows) {
  const find = (...patterns) => {
    for (const pattern of patterns) {
      for (const row of headerRows) {
        for (let i = 0; i < row.length; i++) {
          const cell = String(row[i] ?? '').trim()
          if (cell && pattern.test(cell)) return i
        }
      }
    }
    return -1
  }
  const cols = {
    id: find(/^food\s*code$/i, /^code$/i),
    name: find(/^food\s*name$/i, /^name$/i),
    desc: find(/^description$/i, /^desc$/i),
    group: find(/^group$/i),
    protein_g: find(/^protein\b.*\(g\)/i, /^protein$/i),
    fats_g: find(/^fat\b.*\(g\)/i, /^fat$/i),
    carbs_g: find(/^carbohydrate\b.*\(g\)/i, /^carbohydrate$/i),
    kcal: find(/energy.*kcal/i, /^kcal$/i),
  }
  const required = ['id', 'name', 'protein_g', 'fats_g', 'carbs_g']
  const missing = required.filter((k) => cols[k] < 0)
  if (missing.length) {
    throw new Error(
      `CoFID Proximates sheet is missing required columns: ${missing.join(', ')}. ` +
        `Headers seen: ${JSON.stringify(headerRows.flat().filter(Boolean).slice(0, 40))}`,
    )
  }
  return cols
}

/**
 * @param headerRows rows 1-3 of the Proximates sheet
 * @param dataRows   rows 4+ of the Proximates sheet
 */
export function parseCofid({ headerRows, dataRows, version }) {
  const cols = cofidColumns(headerRows)
  const at = (row, key) => (cols[key] >= 0 ? row[cols[key]] : null)
  const items = []

  for (const row of dataRows) {
    const id = String(at(row, 'id') ?? '').trim()
    const name = String(at(row, 'name') ?? '').trim()
    if (!id || !name) continue

    const group = String(at(row, 'group') ?? '').trim()
    items.push({
      external_id: id,
      name,
      name_en: null,
      synonyms: [String(at(row, 'desc') ?? '').trim(), group].filter(Boolean).join(' '),
      // Alcoholic beverages (group Q) are tabulated per 100 ml, not per 100 g.
      serving_unit: /^q/i.test(group) ? 'ml' : 'g',
      values: {
        carbs_g: parseCofidValue(at(row, 'carbs_g')),
        protein_g: parseCofidValue(at(row, 'protein_g')),
        fats_g: parseCofidValue(at(row, 'fats_g')),
        kcal: parseCofidValue(at(row, 'kcal')),
      },
    })
  }

  return finalize({ source: 'cofid', version, items, warnings: [] })
}

// ---------------------------------------------------------------------------
// CREA
// ---------------------------------------------------------------------------

/** Nutrient row labels on a CREA detail page, keyed by the column they feed. */
export const CREA_LABELS = {
  carbs_g: /^carboidrati\s+disponibili/i,
  protein_g: /^proteine/i,
  fats_g: /^lipidi/i,
  kcal: /^energia\s*\(kcal\)/i,
}

/**
 * Pull the nutrient table out of one CREA detail page. The rows carry a
 * `nutriente` class and are laid out as
 * <td>label</td><td>unit</td><td>value</td>.
 */
export function parseCreaDetail(html) {
  const strip = (s) => decodeXml(s.replace(/<[^>]+>/g, '')).replace(/\u00a0/g, ' ').trim()
  const values = {}
  const re =
    /class="[^"]*nutriente[^"]*"><td[^>]*>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td>/g
  let m
  while ((m = re.exec(html)) !== null) {
    const label = strip(m[1])
    for (const [column, pattern] of Object.entries(CREA_LABELS)) {
      if (pattern.test(label) && !(column in values)) values[column] = parseCreaValue(strip(m[3]))
    }
  }
  return values
}

/**
 * @param foods   [{ id, name, category }] from the Alicat category endpoint
 * @param details Map id -> detail page HTML
 */
export function parseCrea({ foods, details, version }) {
  const warnings = []
  const items = []
  for (const f of foods) {
    const html = details.get(f.id)
    if (!html) {
      warnings.push(`CREA ${f.id} (${f.name}): no detail page fetched`)
      continue
    }
    items.push({
      external_id: f.id,
      name: f.name,
      name_en: null,
      synonyms: f.category ?? '',
      values: parseCreaDetail(html),
    })
  }
  return finalize({ source: 'crea', version, items, warnings })
}

// ---------------------------------------------------------------------------
// Shared finalization
// ---------------------------------------------------------------------------

const MACROS = ['carbs_g', 'protein_g', 'fats_g']

/**
 * Apply the value policy uniformly: a food missing any macro is dropped with a
 * reason, and one whose macros exceed MACRO_SUM_LIMIT per 100 g is kept but
 * flagged (it almost always means a mis-mapped column).
 */
function finalize({ source, version, items, warnings }) {
  const meta = DATASETS[source]
  const rows = []
  const dropped = []
  const outliers = []

  for (const item of items) {
    const missing = MACROS.filter((m) => (item.values[m]?.kind ?? 'unknown') === 'unknown')
    if (missing.length) {
      dropped.push({ external_id: item.external_id, name: item.name, reason: `no ${missing.join('/')}` })
      continue
    }
    const row = {
      source,
      external_id: item.external_id,
      name: item.name,
      name_lang: meta.nameLang,
      name_en: item.name_en ?? '',
      synonyms: item.synonyms ?? '',
      serving_amount: 100,
      serving_unit: item.serving_unit ?? 'g',
      carbs_g: item.values.carbs_g.value,
      protein_g: item.values.protein_g.value,
      fats_g: item.values.fats_g.value,
      kcal: item.values.kcal?.kind === 'number' ? item.values.kcal.value : '',
      dataset_version: version,
    }
    const sum = row.carbs_g + row.protein_g + row.fats_g
    if (sum > MACRO_SUM_LIMIT) {
      outliers.push({ external_id: row.external_id, name: row.name, sum: Number(sum.toFixed(1)) })
    }
    rows.push(row)
  }

  // (source, external_id) is the primary key, so a duplicated code cannot ship.
  // CoFID 2021 has one genuine upstream defect here — 13-669 is assigned to both
  // "Aubergine, roasted" and "Watercress, raw" — and a batch containing both is
  // rejected by Postgres ("ON CONFLICT DO UPDATE command cannot affect row a
  // second time"). Keep the first occurrence and say which food was lost, rather
  // than inventing an id that would not survive the next edition.
  const byId = new Map()
  for (const row of rows) {
    const kept = byId.get(row.external_id)
    if (kept) {
      warnings.push(
        `duplicate external_id ${row.external_id}: kept "${kept.name}", dropped "${row.name}"`,
      )
      continue
    }
    byId.set(row.external_id, row)
  }

  const unique = [...byId.values()]
  unique.sort((a, b) => (a.external_id < b.external_id ? -1 : a.external_id > b.external_id ? 1 : 0))
  return { source, version, rows: unique, dropped, outliers, warnings }
}

// ---------------------------------------------------------------------------
// CSV
//
// Hand-rolled rather than a dependency: the field set is fixed and known, and
// the committed files are meant to be read as diffs.
// ---------------------------------------------------------------------------

function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows, columns = CSV_COLUMNS) {
  const lines = [columns.join(',')]
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(','))
  return lines.join('\n') + '\n'
}

/** Parse a CSV produced by {@link toCsv}: quoted fields, doubled quotes, CRLF. */
export function fromCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  let i = 0
  const s = text.replace(/^\ufeff/, '')

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
  }

  while (i < s.length) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      quoted = true
      i++
    } else if (c === ',') {
      endField()
      i++
    } else if (c === '\r') {
      i++
    } else if (c === '\n') {
      endRow()
      i++
    } else {
      field += c
      i++
    }
  }
  if (field !== '' || row.length) endRow()

  if (rows.length === 0) return []
  const header = rows[0]
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, j) => [h, r[j] ?? ''])))
}

/** Shape a CSV row back into what Postgres wants (numbers, nulls). */
export function toDbRow(row) {
  return {
    source: row.source,
    external_id: row.external_id,
    name: row.name,
    name_lang: row.name_lang,
    name_en: row.name_en === '' ? null : row.name_en,
    synonyms: row.synonyms === '' ? null : row.synonyms,
    serving_amount: Number(row.serving_amount),
    serving_unit: row.serving_unit,
    carbs_g: Number(row.carbs_g),
    protein_g: Number(row.protein_g),
    fats_g: Number(row.fats_g),
    kcal: row.kcal === '' ? null : Number(row.kcal),
    dataset_version: row.dataset_version,
  }
}

export function summarize(result) {
  const lines = [
    `${result.source} (${result.version}): ${result.rows.length} rows, ` +
      `${result.dropped.length} dropped, ${result.outliers.length} macro-sum outliers`,
  ]
  for (const d of result.dropped.slice(0, 20)) {
    lines.push(`  drop ${d.external_id} ${d.name} — ${d.reason}`)
  }
  if (result.dropped.length > 20) lines.push(`  … ${result.dropped.length - 20} more drops`)
  for (const o of result.outliers) {
    lines.push(`  WARN ${o.external_id} ${o.name} — macros sum to ${o.sum}/100g`)
  }
  for (const w of result.warnings) lines.push(`  WARN ${w}`)
  return lines.join('\n')
}
