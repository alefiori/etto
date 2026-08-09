#!/usr/bin/env node
/**
 * Work out the version numbers a store build must carry.
 *
 * Both stores reject a second upload that reuses a version. `android/` and
 * `ios/` are generated fresh on every release run, so they always come back
 * carrying Capacitor's template defaults — `versionCode 1`, `versionName "1.0"`,
 * `MARKETING_VERSION 1.0`, `CURRENT_PROJECT_VERSION 1`. The first upload of the
 * app's life would work and every one after it would be refused, for as long as
 * nobody noticed why.
 *
 * The git tag is the source of truth: releases are cut by pushing `vX.Y.Z`, so
 * that is the one number a human already chose deliberately.
 *
 * Emits shell-assignable lines for a workflow to eval:
 *
 *   $ node scripts/native-version.mjs --ref refs/tags/v1.4.2
 *   VERSION_NAME=1.4.2
 *   VERSION_CODE=104002
 *
 * `--write-package` additionally rewrites package.json's version in the
 * workspace (never committed — the release runner's checkout is thrown away).
 * That keeps the version on the Profile page, which is inlined from
 * package.json, honest about which build a support email came from.
 */

import { readFileSync, writeFileSync } from 'node:fs'

/** Bounds implied by the versionCode packing below. */
export const MAX_MINOR = 999
export const MAX_PATCH = 999

/** `refs/tags/v1.4.2` / `v1.4.2` / `1.4.2` -> `{major, minor, patch}`. */
export function parseVersion(input) {
  const cleaned = String(input ?? '')
    .replace(/^refs\/tags\//, '')
    .replace(/^v/, '')
    .trim()
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(cleaned)
  if (!match) throw new Error(`not a X.Y.Z version: "${input}"`)

  const [major, minor, patch] = match.slice(1).map(Number)
  if (minor > MAX_MINOR || patch > MAX_PATCH) {
    throw new Error(
      `version ${cleaned} exceeds the versionCode packing (minor and patch must be ` +
        `<= ${MAX_MINOR}); widen the packing in scripts/native-version.mjs first`,
    )
  }
  return { major, minor, patch }
}

/**
 * A single integer that increases with the version, for Play's versionCode and
 * iOS's build number.
 *
 * Packed rather than sequential so it is derivable from the tag alone: a
 * counter would need state the runner doesn't have, and a run number would
 * reset or jump if the workflow were ever recreated. 1.4.2 -> 104002.
 *
 * Play's ceiling is 2100000000, so this leaves room for major versions into the
 * thousands.
 */
export function versionCode({ major, minor, patch }) {
  return major * 1_000_000 + minor * 1_000 + patch
}

export function versionName({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`
}

/**
 * Resolve the version for a run.
 *
 * A tag push is the real case. A manual dispatch has no tag, so it falls back
 * to package.json — those runs only build artifacts for inspection and never
 * publish, so the number just has to exist and be plausible.
 */
export function resolve({ ref, packageVersion }) {
  const isTag = String(ref ?? '').startsWith('refs/tags/')
  const parsed = parseVersion(isTag ? ref : packageVersion)
  return {
    name: versionName(parsed),
    code: versionCode(parsed),
    source: isTag ? 'tag' : 'package.json',
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const refIndex = process.argv.indexOf('--ref')
  const ref = refIndex === -1 ? (process.env.GITHUB_REF ?? '') : process.argv[refIndex + 1]

  const pkgPath = 'package.json'
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

  let resolved
  try {
    resolved = resolve({ ref, packageVersion: pkg.version })
  } catch (e) {
    console.error(`native-version: ${e.message}`)
    process.exit(1)
  }

  if (process.argv.includes('--write-package') && pkg.version !== resolved.name) {
    // Two spaces + trailing newline, matching npm's own formatting, so this
    // never shows up as a whitespace diff if anyone does commit it.
    pkg.version = resolved.name
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    console.error(`native-version: package.json version -> ${resolved.name}`)
  }

  console.error(`native-version: ${resolved.name} (${resolved.code}) from ${resolved.source}`)
  console.log(`VERSION_NAME=${resolved.name}`)
  console.log(`VERSION_CODE=${resolved.code}`)
}
