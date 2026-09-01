#!/usr/bin/env node
/**
 * Render public/.well-known/apple-app-site-association and assetlinks.json —
 * the server-hosted half of Universal Links (iOS) and App Links (Android).
 *
 * Both are fetched by the OS over **HTTPS**, not read out of the app bundle:
 * the first time the app is (or might be) installed, iOS/Android requests
 * https://etto.fitness/.well-known/{apple-app-site-association,assetlinks.json}
 * to verify that whoever controls the domain a link points at is the same
 * party who signed the app that wants to intercept it. That is what makes a
 * tap on the password-reset email open the app instead of the browser. The
 * *app*-side half of the same handshake — the Associated Domains entitlement
 * and the autoVerify intent-filter that say "check me against this domain" —
 * lives in scripts/patch-ios-project.mjs and scripts/patch-android-manifest.mjs;
 * this script is what the OS actually fetches, so it has to ship with the web
 * deploy specifically (public/ -> dist/ on `pnpm run build`, served by Netlify).
 * `netlify.toml`'s build command runs this, the same way it already runs
 * build-legal.mjs for the same "web deploy has to carry a rendered file"
 * reason.
 *
 * Two identifiers cannot be baked into source, both real launch-day setup
 * rather than anything this script can complete on its own:
 *
 *   - APPLE_TEAM_ID — the same variable scripts/patch-ios-project.mjs already
 *     reads (from .env locally, a repository secret in CI), paired with the
 *     fixed bundle id below.
 *   - ANDROID_ASSETLINKS_SHA256_FINGERPRINTS — comma-separated SHA-256
 *     certificate fingerprints (colon-hex, e.g. "AA:BB:...:00,11:22:...:FF"),
 *     one per signing key that should be trusted. Typically a debug keystore's
 *     fingerprint during development, and the Play "App signing key
 *     certificate" once a release track exists — Play Console → Setup → App
 *     integrity → App signing key certificate. Neither can be produced from
 *     this repo: both depend on a keystore nobody has generated yet. See
 *     .env.example.
 *
 * Same two-mode contract as build-legal.mjs:
 *
 *   node scripts/generate-well-known.mjs            # dev/CI: placeholders allowed
 *   node scripts/generate-well-known.mjs --strict    # release: refuses to
 *                                                       publish a placeholder
 *
 * `netlify.toml` deliberately runs the **non-strict** form. Unlike the legal
 * documents (where a placeholder support address is a compliance problem the
 * moment the site is live), a placeholder here just means Universal/App Links
 * silently do not activate yet — the web app, the email link, and every other
 * launch surface still work with a plain https:// page. Blocking every web
 * deploy on an Android signing key that cannot exist until a release track
 * does would trade a working site for a broken one over a feature that isn't
 * shippable yet either way. `--strict` exists for whenever that stops being
 * true and someone wants the build to hold the line.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ENV_FILE = '.env'
export const OUT_DIR = 'public/.well-known'

/** The app's bundle id (iOS) / application id (Android). One value, both platforms. */
export const APP_ID = 'fitness.etto'

/**
 * Paths the OS should hand straight to the app instead of opening a browser
 * tab. One list for both files, so Apple's and Google's declarations cannot
 * drift apart, and a future deep link (a shared-food invite, say) is one
 * entry here rather than two files to remember to update — kept in step with
 * ACTIONABLE_PATHS' reasoning in src/lib/deepLinks.ts, though that module
 * only *acts* on a subset of what the OS is told to hand over.
 */
export const APP_PATHS = ['/reset-password', '/signin']

/** A Team ID is 10 characters of Apple's own alphabet, same rule patch-ios-project.mjs checks. */
export const TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/

/** A SHA-256 fingerprint as Play/Apple print it: 32 colon-separated hex pairs. */
export const FINGERPRINT_PATTERN = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){31}$/

export function appleAppSiteAssociation(teamId) {
  return {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${teamId}.${APP_ID}`,
          paths: APP_PATHS,
        },
      ],
    },
  }
}

export function assetlinks(fingerprints) {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: APP_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]
}

/** Resolve the two environment-provided values, validating what is present. */
export function resolveValues(env = {}) {
  const teamId = (env.APPLE_TEAM_ID ?? '').trim()
  const fingerprints = (env.ANDROID_ASSETLINKS_SHA256_FINGERPRINTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (teamId && !TEAM_ID_PATTERN.test(teamId)) {
    throw new Error(
      `APPLE_TEAM_ID must be 10 uppercase letters or digits — got ${JSON.stringify(teamId)}.`,
    )
  }
  const badFingerprint = fingerprints.find((f) => !FINGERPRINT_PATTERN.test(f))
  if (badFingerprint) {
    throw new Error(
      `ANDROID_ASSETLINKS_SHA256_FINGERPRINTS contains a value that is not a colon-hex ` +
        `SHA-256 fingerprint: ${JSON.stringify(badFingerprint)}. Expected 32 colon-separated ` +
        'hex byte pairs, e.g. from `keytool -list -v -keystore ... | grep SHA256`.',
    )
  }

  return { teamId, fingerprints }
}

/** What a `--strict` (release) build refuses to publish a placeholder for. */
export function strictFailures({ teamId, fingerprints }) {
  const failures = []
  if (!teamId) {
    failures.push(
      'APPLE_TEAM_ID is unset, so apple-app-site-association would publish no team — ' +
        'Universal Links would never verify.',
    )
  }
  if (fingerprints.length === 0) {
    failures.push(
      'ANDROID_ASSETLINKS_SHA256_FINGERPRINTS is unset, so assetlinks.json would publish no ' +
        'fingerprint — App Links would never verify. See this script\'s own header comment for ' +
        'where to find one.',
    )
  }
  return failures
}

/**
 * A placeholder team id that cannot verify against any real app, rather than
 * omitting the file: a link that simply does not activate yet is a visible,
 * checkable state (curl the URL, see the placeholder); a missing file could
 * as easily be a build step nobody ran.
 */
export const PLACEHOLDER_TEAM_ID = 'TEAMID0000'
/** Deliberately the all-zero fingerprint: valid shape, matches no real certificate. */
export const PLACEHOLDER_FINGERPRINT = Array(32).fill('00').join(':')

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const strict = process.argv.includes('--strict')

  // Local-only convenience, same as patch-ios-project.mjs: an existing
  // environment variable (CI's secret) always wins over .env.
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE)

  let values
  try {
    values = resolveValues(process.env)
  } catch (e) {
    console.error(`generate-well-known: ${e.message}`)
    process.exit(1)
  }

  if (strict) {
    const failures = strictFailures(values)
    if (failures.length > 0) {
      console.error('generate-well-known: refusing to publish a release build:\n')
      for (const f of failures) console.error(`  - ${f}\n`)
      process.exit(1)
    }
  }

  mkdirSync(OUT_DIR, { recursive: true })

  const teamId = values.teamId || PLACEHOLDER_TEAM_ID
  writeFileSync(
    join(OUT_DIR, 'apple-app-site-association'),
    JSON.stringify(appleAppSiteAssociation(teamId), null, 2) + '\n',
  )

  const fingerprints = values.fingerprints.length > 0 ? values.fingerprints : [PLACEHOLDER_FINGERPRINT]
  writeFileSync(
    join(OUT_DIR, 'assetlinks.json'),
    JSON.stringify(assetlinks(fingerprints), null, 2) + '\n',
  )

  const placeholders = []
  if (!values.teamId) placeholders.push('APPLE_TEAM_ID')
  if (values.fingerprints.length === 0) placeholders.push('ANDROID_ASSETLINKS_SHA256_FINGERPRINTS')
  const note =
    placeholders.length > 0
      ? ` (placeholder value(s) for ${placeholders.join(', ')} — see .env.example; Universal/App Links will not verify until these are real)`
      : ''
  console.log(`generate-well-known: rendered apple-app-site-association and assetlinks.json into ${OUT_DIR}/${note}`)
}
