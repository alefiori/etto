import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DOCUMENTS,
  PLACEHOLDER_EMAIL,
  DEFAULT_SITE_URL,
  resolveValues,
  substitute,
  render,
  strictFailures,
} from './build-legal.mjs'

const VALUES = { SITE_URL: 'https://etto.test', SUPPORT_EMAIL: 'hi@etto.test' }

describe('resolveValues', () => {
  it('falls back to the placeholder contact and the default origin', () => {
    expect(resolveValues({})).toEqual({
      SITE_URL: DEFAULT_SITE_URL,
      SUPPORT_EMAIL: PLACEHOLDER_EMAIL,
    })
  })

  it('takes the configured values', () => {
    expect(
      resolveValues({
        VITE_SITE_URL: 'https://etto.test',
        VITE_SUPPORT_EMAIL: 'hi@etto.test',
      }),
    ).toEqual(VALUES)
  })

  it('strips a trailing slash so URLs do not double up', () => {
    // `https://site//legal/terms.html` resolves but reads as broken in a listing.
    expect(resolveValues({ VITE_SITE_URL: 'https://etto.test//' }).SITE_URL).toBe(
      'https://etto.test',
    )
  })
})

describe('substitute', () => {
  it('replaces every occurrence of a token', () => {
    expect(substitute('{{SUPPORT_EMAIL}} and {{SUPPORT_EMAIL}}', VALUES)).toBe(
      'hi@etto.test and hi@etto.test',
    )
  })

  it('throws rather than shipping an unresolved token', () => {
    // A document with a literal {{SUPPORT_EMAIL}} in it is the exact failure
    // nobody notices until a reviewer screenshots the page.
    expect(() => substitute('contact {{NOT_A_TOKEN}}', VALUES)).toThrow(/unresolved token/)
  })

  it('leaves text with no tokens alone', () => {
    expect(substitute('<p>plain</p>', VALUES)).toBe('<p>plain</p>')
  })
})

describe('strictFailures', () => {
  it('rejects the placeholder contact', () => {
    const failures = strictFailures({ ...VALUES, SUPPORT_EMAIL: PLACEHOLDER_EMAIL })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatch(/VITE_SUPPORT_EMAIL/)
  })

  it('passes a fully configured release', () => {
    // VITE_SITE_URL is read from the real environment for the origin check, so
    // only assert the contact clause here.
    expect(strictFailures(VALUES).some((f) => /VITE_SUPPORT_EMAIL/.test(f))).toBe(false)
  })
})

describe('the rendered documents', () => {
  const shell = readFileSync(join('legal', '_shell.html'), 'utf8')

  for (const doc of DOCUMENTS) {
    describe(doc.out, () => {
      const fragment = readFileSync(join('legal', doc.src), 'utf8')
      const html = render(shell, fragment, doc, VALUES)

      it('resolves every token', () => {
        expect(html).not.toMatch(/\{\{\w+\}\}/)
      })

      it('carries the configured contact and origin', () => {
        expect(html).toContain('hi@etto.test')
        expect(html).toContain('https://etto.test')
      })

      it('is a complete standalone page with the document title', () => {
        expect(html.startsWith('<!doctype html>')).toBe(true)
        expect(html).toContain(`<title>${doc.title} — Etto</title>`)
        expect(html).toContain('</html>')
      })

      it('links to the other document, so either can be reached from either', () => {
        expect(html).toContain('/legal/privacy.html')
        expect(html).toContain('/legal/terms.html')
      })

      it('needs no network to render', () => {
        // These pages load on a reviewer's bad hotel wifi. An external
        // stylesheet, font or script is one more thing that can fail.
        expect(html).not.toMatch(/<script/i)
        expect(html).not.toMatch(/<link[^>]+stylesheet/i)
        expect(html).not.toMatch(/https?:\/\/(?!etto\.test)/)
      })
    })
  }

  it('states the account-deletion route both stores look for', () => {
    const privacy = render(
      shell,
      readFileSync(join('legal', 'privacy.html'), 'utf8'),
      DOCUMENTS[0],
      VALUES,
    )
    expect(privacy).toMatch(/Delete account/)
  })
})
