#!/usr/bin/env node
// Stage 1 of the reference-food pipeline: fetch the upstream datasets, parse
// them, and write the committed CSVs under data/reference/.
//
//   node scripts/build-reference-foods.mjs [--check] [--source ciqual|cofid|crea]
//
// --check fetches only upstream *metadata* (file ids, checksums, sizes,
// publication dates) and compares it with data/reference/UPSTREAM.json:
//   exit 0  nothing changed
//   exit 10 a new edition is available
//   exit 1  something broke (a URL moved, an API changed shape)
// That is what .github/workflows/reference-foods.yml runs monthly, so it stays
// cheap: no 66 MB download, no parsing.
//
// A full run rewrites the CSVs and UPSTREAM.json. The CSVs are committed, which
// is the point: a dataset refresh arrives as a reviewable diff of real
// nutrition values, and `git` answers "which version is live?".
// scripts/import-reference-foods.mjs then loads those CSVs into Postgres.
//
// This is the only script in the pipeline with a dependency (exceljs, for
// CoFID's workbook). It runs on a maintainer's machine every few years, never
// in CI and never in the deploy path.

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCiqual, parseCofid, parseCrea, summarize, toCsv } from './reference-foods.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'data', 'reference')
const UPSTREAM_PATH = join(DATA_DIR, 'UPSTREAM.json')
const CACHE_DIR = join(DATA_DIR, '.cache')

// Ciqual's Dataverse record, and the gov.uk publication page for CoFID.
const CIQUAL_DOI = 'doi:10.57745/RDMHWY'
const CIQUAL_API = 'https://entrepot.recherche.data.gouv.fr/api'
const COFID_API =
  'https://www.gov.uk/api/content/government/publications/composition-of-foods-integrated-dataset-cofid'
const CREA_BASE = 'https://www.alimentinutrizione.it'
const CREA_CATEGORIES = 20
const CREA_VERSION = 'crea-2019'

// Identifies the project and a contact, the same courtesy the Edge Function
// extends to Open Food Facts.
const USER_AGENT =
  'MacroTrack/0.1 (daily macros tracker; +https://github.com/alefiori/macro-track; alefiori97@gmail.com)'

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, { json = false, init = {} } = {}) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers } })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`)
  return json ? res.json() : Buffer.from(await res.arrayBuffer())
}

// ---------------------------------------------------------------------------
// Upstream metadata — what --check compares
// ---------------------------------------------------------------------------

async function ciqualMeta() {
  const body = await get(`${CIQUAL_API}/datasets/:persistentId/?persistentId=${CIQUAL_DOI}`, {
    json: true,
  })
  const v = body.data.latestVersion
  const files = {}
  for (const f of v.files) {
    const { id, filename, filesize, md5 } = f.dataFile
    // alim_2025_11_03.xml -> alim
    const key = filename.replace(/_\d{4}_\d{2}_\d{2}\.xml$/, '')
    if (!filename.endsWith('.xml')) continue
    files[key] = { id, filename, filesize, md5 }
  }
  for (const need of ['alim', 'alim_grp', 'compo', 'const']) {
    if (!files[need]) {
      throw new Error(
        `Ciqual: expected an XML file named ${need}_*.xml in the Dataverse record; ` +
          `found ${Object.keys(files).join(', ') || 'none'}`,
      )
    }
  }
  // The date stamped on the files is the real edition marker; the Dataverse
  // version number moves for metadata-only edits too.
  const stamp = files.compo.filename.match(/(\d{4}_\d{2}_\d{2})/)?.[1] ?? 'unknown'
  return {
    version: `ciqual-${stamp.replace(/_/g, '-')}`,
    releaseTime: v.releaseTime,
    datasetVersion: `${v.versionNumber}.${v.versionMinorNumber}`,
    files,
  }
}

async function cofidMeta() {
  const body = await get(COFID_API, { json: true })
  const attachments = body.details?.attachments ?? []
  const xlsx = attachments.find(
    (a) => /\.xlsx$/i.test(a.url ?? '') && !/oldfoods/i.test(a.url ?? ''),
  )
  if (!xlsx) {
    throw new Error(
      `CoFID: no main .xlsx attachment on the gov.uk publication. Saw: ` +
        attachments.map((a) => a.url).join(', '),
    )
  }
  const year = (body.public_updated_at ?? '').slice(0, 4) || 'unknown'
  return {
    version: `cofid-${year}`,
    publicUpdatedAt: body.public_updated_at,
    url: xlsx.url,
    fileSize: xlsx.file_size,
  }
}

/**
 * CREA publishes no versioned artifact and no API contract — the "metadata" we
 * can cheaply observe is how many foods the category endpoints list. A change
 * there is the only automatic signal that the 2019 tables moved.
 */
async function creaMeta() {
  const foods = await creaFoodList()
  return { version: CREA_VERSION, foodCount: foods.length }
}

// ---------------------------------------------------------------------------
// CREA extraction
//
// Two steps, both through the portal's own endpoints:
//   1. 20 POSTs to the category endpoint -> the full food list (900 unique ids).
//   2. one GET per food for its nutrient table.
//
// robots.txt disallows only /administrator/, /bin/, /cache/ and friends —
// nothing under /tabelle-nutrizionali/. Requests are sequential and spaced, and
// every page is cached under data/reference/.cache/ so re-runs and parser
// iteration cost zero requests.
// ---------------------------------------------------------------------------

const CREA_DELAY_MS = 1000

async function creaFoodList() {
  const url = `${CREA_BASE}/index.php?option=com_ajax&plugin=Alicat&method=Alicat&format=json`
  const seen = new Map()
  for (let cat = 1; cat <= CREA_CATEGORIES; cat++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ cat: String(cat) }),
    })
    if (!res.ok) throw new Error(`CREA category ${cat} -> ${res.status}`)
    const body = await res.json()
    for (const group of body.data ?? []) {
      for (const row of group ?? []) {
        // A food can be listed under several categories; first wins.
        if (row.ALI_ID && !seen.has(row.ALI_ID)) {
          seen.set(row.ALI_ID, { id: row.ALI_ID, name: row.ALI_DESC, category: `cat${cat}` })
        }
      }
    }
    await sleep(CREA_DELAY_MS)
  }
  if (seen.size === 0) throw new Error('CREA: category endpoints returned no foods')
  return [...seen.values()]
}

async function creaDetails(foods) {
  const dir = join(CACHE_DIR, 'crea')
  mkdirSync(dir, { recursive: true })
  const details = new Map()
  let fetched = 0
  for (const [i, food] of foods.entries()) {
    const cached = join(dir, `${food.id}.html`)
    if (existsSync(cached)) {
      details.set(food.id, readFileSync(cached, 'utf8'))
      continue
    }
    const html = (
      await get(`${CREA_BASE}/tabelle-nutrizionali/${encodeURIComponent(food.id)}`)
    ).toString('utf8')
    writeFileSync(cached, html)
    details.set(food.id, html)
    fetched++
    if (fetched % 50 === 0) console.error(`  CREA ${i + 1}/${foods.length} …`)
    await sleep(CREA_DELAY_MS)
  }
  console.error(`  CREA: ${fetched} fetched, ${foods.length - fetched} from cache`)
  return details
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

async function buildCiqual(meta) {
  const file = async (key) =>
    (await get(`${CIQUAL_API}/access/datafile/${meta.files[key].id}`)).toString('utf8')
  const [alimXml, compoXml, constXml, grpXml] = await Promise.all([
    file('alim'),
    file('compo'),
    file('const'),
    file('alim_grp'),
  ])
  return parseCiqual({ alimXml, compoXml, constXml, grpXml, version: meta.version })
}

async function buildCofid(meta) {
  const { default: ExcelJS } = await import('exceljs')
  const buf = await get(meta.url)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  // The sheet is "1.3 Proximates" today; match on substring so a renumbering
  // doesn't break the build.
  const ws = wb.worksheets.find((w) => /proximates/i.test(w.name))
  if (!ws) {
    throw new Error(
      `CoFID: no Proximates worksheet. Sheets: ${wb.worksheets.map((w) => w.name).join(', ')}`,
    )
  }
  // exceljs row.values is 1-indexed with a leading hole; drop it so column
  // indices match what cofidColumns() reports.
  const cell = (v) => {
    if (v && typeof v === 'object') return v.result ?? v.text ?? v.richText?.map((t) => t.text).join('') ?? ''
    return v ?? ''
  }
  const rowAt = (n) => (ws.getRow(n).values ?? []).slice(1).map(cell)
  const headerRows = [rowAt(1), rowAt(2), rowAt(3)]
  const dataRows = []
  for (let n = 4; n <= ws.rowCount; n++) dataRows.push(rowAt(n))
  return parseCofid({ headerRows, dataRows, version: meta.version })
}

async function buildCrea(meta) {
  const foods = await creaFoodList()
  const details = await creaDetails(foods)
  return parseCrea({ foods, details, version: meta.version })
}

const BUILDERS = {
  ciqual: { meta: ciqualMeta, build: buildCiqual },
  cofid: { meta: cofidMeta, build: buildCofid },
  crea: { meta: creaMeta, build: buildCrea },
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Compare only the upstream-observed fields. The stored entry also carries
 * `builtAt` and `csv`, which describe *our* last build rather than upstream —
 * including them made every check report a change and would have opened a
 * pull request every month forever.
 */
function sameUpstream(before, meta) {
  if (!before) return false
  const canonical = (o) => {
    const rest = { ...o }
    delete rest.builtAt
    delete rest.csv
    // Sort keys so a reordering in the JSON file is not read as a change.
    return JSON.stringify(rest, Object.keys(rest).sort())
  }
  return canonical(before) === canonical(meta)
}

function readUpstream() {
  if (!existsSync(UPSTREAM_PATH)) return {}
  return JSON.parse(readFileSync(UPSTREAM_PATH, 'utf8'))
}

async function main(argv) {
  const check = argv.includes('--check')
  const only = argv[argv.indexOf('--source') + 1]
  const sources = argv.includes('--source') ? [only] : Object.keys(BUILDERS)
  for (const s of sources) {
    if (!BUILDERS[s]) throw new Error(`Unknown source ${JSON.stringify(s)}`)
  }

  const previous = readUpstream()
  const metas = {}
  let changed = false

  for (const source of sources) {
    const meta = await BUILDERS[source].meta()
    metas[source] = meta
    const before = previous[source]
    if (!sameUpstream(before, meta)) {
      changed = true
      console.error(
        `${source}: CHANGED — ${before ? `${before.version} -> ${meta.version}` : `new (${meta.version})`}`,
      )
    } else {
      console.error(`${source}: unchanged (${meta.version})`)
    }
  }

  if (check) {
    if (changed) console.error('\nA new edition is available. Run without --check to rebuild.')
    return changed ? 10 : 0
  }

  mkdirSync(DATA_DIR, { recursive: true })
  // Re-read rather than reusing the snapshot taken at the top: a full build can
  // run for half an hour (CREA fetches 900 pages at 1 req/s), and merging into
  // the stale copy would silently revert an entry another run wrote in the
  // meantime. The importer's checksum guard catches that, but only after the
  // fact — better not to write it.
  const upstream = readUpstream()

  for (const source of sources) {
    const meta = metas[source]
    console.error(`\nbuilding ${source} …`)
    const result = await BUILDERS[source].build(meta)
    if (result.rows.length === 0) throw new Error(`${source}: produced no rows`)
    console.error(summarize(result))

    const csv = toCsv(result.rows)
    const csvPath = join(DATA_DIR, `${meta.version}.csv`)
    writeFileSync(csvPath, csv)
    upstream[source] = { ...meta, builtAt: new Date().toISOString() }
    upstream[source].csv = {
      file: `${meta.version}.csv`,
      sha256: sha256(csv),
      rowCount: result.rows.length,
    }
    console.error(`  wrote ${csvPath} (${result.rows.length} rows)`)
  }

  // Stable key order so the committed file diffs cleanly.
  const ordered = Object.fromEntries(Object.keys(upstream).sort().map((k) => [k, upstream[k]]))
  writeFileSync(UPSTREAM_PATH, JSON.stringify(ordered, null, 2) + '\n')
  console.error(`\nwrote ${UPSTREAM_PATH}`)
  return 0
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`\nbuild-reference-foods failed: ${err.message}`)
    process.exit(1)
  })
