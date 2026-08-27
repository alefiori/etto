#!/usr/bin/env node
// Stage 2 of the reference-food pipeline: load the committed CSVs in
// data/reference/ into public.reference_foods.
//
//   node scripts/import-reference-foods.mjs [--dry-run] [--force] [--source X]
//   env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// The committed CSV is the source of truth; the database is a projection of it.
// Each dataset's row in public.reference_datasets records the checksum of the
// CSV that produced it, so a run whose checksum already matches does nothing —
// which is what makes this safe to invoke on every deploy (see the
// supabase-deploy job in .github/workflows/ci.yml).
//
// Writes go through the service role because reference rows carry no owner and
// the table has no insert policy; nothing here touches user data.
//
// Stdlib + @supabase/supabase-js only (already an app dependency): unlike
// build-reference-foods.mjs this runs in CI, so it must not need exceljs.

import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { DATASETS, fromCsv, toDbRow } from './reference-foods.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'data', 'reference')
const UPSTREAM_PATH = join(DATA_DIR, 'UPSTREAM.json')

const BATCH_SIZE = 500
// A rebuild that suddenly yields a fraction of the rows means a truncated
// download or a changed sheet, not a real edition. Refuse to prune on it.
const SHRINK_FLOOR = 0.8

const sha256 = (s) => createHash('sha256').update(s).digest('hex')

function loadDataset(source) {
  const upstream = JSON.parse(readFileSync(UPSTREAM_PATH, 'utf8'))
  const entry = upstream[source]
  if (!entry) throw new Error(`${source}: not in UPSTREAM.json — run build-reference-foods.mjs first`)
  const csvPath = join(DATA_DIR, entry.csv.file)
  if (!existsSync(csvPath)) throw new Error(`${source}: ${entry.csv.file} is missing`)

  const csv = readFileSync(csvPath, 'utf8')
  const checksum = sha256(csv)
  if (checksum !== entry.csv.sha256) {
    throw new Error(
      `${source}: ${entry.csv.file} does not match the checksum in UPSTREAM.json ` +
        `(expected ${entry.csv.sha256.slice(0, 12)}…, got ${checksum.slice(0, 12)}…). ` +
        `Rebuild rather than editing the CSV by hand.`,
    )
  }

  const rows = fromCsv(csv).map(toDbRow)
  const wrongSource = rows.find((r) => r.source !== source)
  if (wrongSource) {
    throw new Error(`${source}: ${entry.csv.file} contains a ${wrongSource.source} row`)
  }
  return { entry, checksum, rows, version: entry.version }
}

async function importOne(db, source, { dryRun, force }) {
  const { checksum, rows, version } = loadDataset(source)
  const meta = DATASETS[source]

  const { data: current, error: readErr } = await db
    .from('reference_datasets')
    .select('version, checksum, row_count')
    .eq('source', source)
    .maybeSingle()
  if (readErr) throw new Error(`${source}: reading reference_datasets failed — ${readErr.message}`)

  if (current && current.checksum === checksum && !force) {
    console.log(`${source}: up to date (${current.version}, ${current.row_count} rows) — skipping`)
    return { skipped: true }
  }

  const existing = current?.row_count ?? 0
  const shrinking = existing > 0 && rows.length < existing * SHRINK_FLOOR
  if (shrinking && !force) {
    throw new Error(
      `${source}: refusing to load ${rows.length} rows over ${existing} existing ` +
        `(below ${SHRINK_FLOOR * 100}%). A truncated download looks exactly like this. ` +
        `Pass --force if the shrink is real.`,
    )
  }

  console.log(
    `${source}: ${current ? `${current.version} -> ${version}` : `initial load (${version})`}, ` +
      `${rows.length} rows${dryRun ? ' [dry run]' : ''}`,
  )
  if (dryRun) {
    console.log(`  would upsert ${rows.length} rows in ${Math.ceil(rows.length / BATCH_SIZE)} batches`)
    console.log(`  would prune rows where dataset_version <> ${version}`)
    for (const r of rows.slice(0, 3)) console.log(`  sample: ${JSON.stringify(r)}`)
    return { skipped: false, dryRun: true }
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await db
      .from('reference_foods')
      .upsert(batch, { onConflict: 'source,external_id' })
    if (error) throw new Error(`${source}: upsert at row ${i} failed — ${error.message}`)
    process.stdout.write(`\r  upserted ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`)
  }
  process.stdout.write('\n')

  // Drop anything the new edition no longer carries.
  const { error: pruneErr, count } = await db
    .from('reference_foods')
    .delete({ count: 'exact' })
    .eq('source', source)
    .neq('dataset_version', version)
  if (pruneErr) throw new Error(`${source}: prune failed — ${pruneErr.message}`)
  if (count) console.log(`  pruned ${count} rows from earlier editions`)

  const { error: metaErr } = await db.from('reference_datasets').upsert(
    {
      source,
      version,
      checksum,
      row_count: rows.length,
      license: meta.license,
      attribution: meta.attribution,
      source_url: meta.sourceUrl,
      imported_at: new Date().toISOString(),
    },
    { onConflict: 'source' },
  )
  if (metaErr) throw new Error(`${source}: recording the dataset failed — ${metaErr.message}`)
  console.log(`  done`)
  return { skipped: false }
}

async function main(argv) {
  const dryRun = argv.includes('--dry-run')
  const force = argv.includes('--force')
  const sources = argv.includes('--source')
    ? [argv[argv.indexOf('--source') + 1]]
    : Object.keys(DATASETS)
  for (const s of sources) if (!DATASETS[s]) throw new Error(`Unknown source ${JSON.stringify(s)}`)

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }
  const db = createClient(url, key, { auth: { persistSession: false } })

  const upstream = JSON.parse(readFileSync(UPSTREAM_PATH, 'utf8'))
  for (const source of sources) {
    // A dataset that has not been built yet is not an error — CREA in
    // particular is refreshed by hand.
    if (!upstream[source]) {
      console.log(`${source}: not built yet — skipping`)
      continue
    }
    await importOne(db, source, { dryRun, force })
  }
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`\nimport-reference-foods failed: ${err.message}`)
  process.exit(1)
})
