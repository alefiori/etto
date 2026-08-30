#!/usr/bin/env node
/**
 * Render the legal documents into public/legal/.
 *
 * The Terms and Privacy Policy have to exist as **public URLs**, not just as
 * in-app screens: App Store Connect asks for a privacy policy URL in the
 * listing, Play rejects a data-safety form whose policy link doesn't resolve,
 * and a reviewer will click both. Serving them from public/ means they are
 * plain static files with no JavaScript between the reviewer and the text —
 * they render even if the SPA fails to boot.
 *
 * Two values can't be baked into the source: the contact address and the
 * deployed origin. Both differ between a fork, a preview deploy and the real
 * app, and the contact address in particular must not be a committed personal
 * email. So the sources under legal/ carry `{{TOKENS}}` and this fills them
 * from the environment at build time — the same VITE_ variables the app itself
 * reads through src/lib/legal.ts, so the links in the app and the text in the
 * documents cannot disagree.
 *
 *   node scripts/build-legal.mjs            # dev/CI: placeholder allowed
 *   node scripts/build-legal.mjs --strict   # release: placeholder is an error
 *
 * `--strict` is what stops a release build from publishing a privacy policy
 * that tells regulators to email `support@example.invalid`. The release
 * workflow passes it; CI does not, so a contributor with no secrets can still
 * build the app.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIR = 'legal'
const OUT_DIR = 'public/legal'

/** Kept in sync with PLACEHOLDER_EMAIL in src/lib/legal.ts. */
export const PLACEHOLDER_EMAIL = 'support@example.invalid'
export const DEFAULT_SITE_URL = 'https://etto.fitness'

/** The documents to render: source fragment -> output file, plus its metadata. */
export const DOCUMENTS = [
  {
    src: 'privacy.html',
    out: 'privacy.html',
    title: 'Privacy Policy',
    description: 'What Etto stores, why, who else processes it, and how to erase it.',
  },
  {
    src: 'terms.html',
    out: 'terms.html',
    title: 'Terms of Use',
    description: 'The terms governing use of Etto, including Etto Pro subscriptions.',
  },
]

/**
 * Resolve the substitution values from an environment object.
 *
 * A trailing slash on the site URL would produce `https://site//legal/...`,
 * which resolves but looks broken in a store listing, so it is stripped here
 * exactly as src/lib/legal.ts strips it.
 */
export function resolveValues(env = {}) {
  return {
    SITE_URL: (env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, ''),
    SUPPORT_EMAIL: env.VITE_SUPPORT_EMAIL || PLACEHOLDER_EMAIL,
  }
}

/**
 * Substitute `{{TOKEN}}` occurrences.
 *
 * Throws on any token left unresolved rather than shipping a document with
 * `{{SUPPORT_EMAIL}}` visible in it — a silent miss here is exactly the kind of
 * thing nobody notices until a reviewer screenshots it.
 */
export function substitute(template, values) {
  const out = template.replace(/\{\{(\w+)\}\}/g, (match, token) =>
    token in values ? values[token] : match,
  )
  const missing = [...new Set([...out.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))]
  if (missing.length > 0) {
    throw new Error(`unresolved token(s) in template: ${missing.join(', ')}`)
  }
  return out
}

/** Wrap a content fragment in the shared page shell. */
export function render(shell, fragment, doc, values) {
  return substitute(shell, {
    ...values,
    TITLE: doc.title,
    DESCRIPTION: doc.description,
    // Substituted last and separately: the fragment has already had its own
    // tokens resolved, so injecting it here cannot re-trigger substitution on
    // whatever the values happen to contain.
    CONTENT: substitute(fragment, values),
  })
}

/** Complain when a release build is about to publish the placeholder contact. */
export function strictFailures(values) {
  const failures = []
  if (values.SUPPORT_EMAIL === PLACEHOLDER_EMAIL) {
    failures.push(
      'VITE_SUPPORT_EMAIL is unset, so the legal documents would publish the ' +
        `placeholder contact "${PLACEHOLDER_EMAIL}". Both stores require a ` +
        'working support contact, and the GDPR requires a reachable controller.',
    )
  }
  if (values.SITE_URL === DEFAULT_SITE_URL && !process.env.VITE_SITE_URL) {
    failures.push(
      `VITE_SITE_URL is unset, so the documents would point at "${DEFAULT_SITE_URL}". ` +
        'Set it to the origin the release actually serves the policy from.',
    )
  }
  return failures
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const strict = process.argv.includes('--strict')
  const values = resolveValues(process.env)

  if (strict) {
    const failures = strictFailures(values)
    if (failures.length > 0) {
      console.error('build-legal: refusing to render a release build:\n')
      for (const f of failures) console.error(`  - ${f}\n`)
      process.exit(1)
    }
  }

  const shell = readFileSync(join(SRC_DIR, '_shell.html'), 'utf8')
  mkdirSync(OUT_DIR, { recursive: true })

  for (const doc of DOCUMENTS) {
    const fragment = readFileSync(join(SRC_DIR, doc.src), 'utf8')
    writeFileSync(join(OUT_DIR, doc.out), render(shell, fragment, doc, values))
  }

  const note = values.SUPPORT_EMAIL === PLACEHOLDER_EMAIL ? ' (placeholder contact)' : ''
  console.log(
    `build-legal: rendered ${DOCUMENTS.length} document(s) into ${OUT_DIR}/${note}`,
  )
  if (!existsSync(join(OUT_DIR, 'privacy.html'))) process.exit(1)
}
