import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { LOCALES } from '../src/lib/i18n/index.ts'

/**
 * Guard the listing copy against the limits the stores enforce at *upload*.
 *
 * An over-length subtitle is not a review comment, it is a failed submission —
 * and you find out after building, signing and waiting for the upload. Each
 * section heading in store/listings/*.md declares its own limit, so this reads
 * the limit from the document rather than hardcoding a table that would drift.
 */

const DIR = 'store/listings'

/** `## App name [30]` … body … -> { name: 'App name', limit: 30, body }. */
export function parseSections(markdown) {
  const sections = []
  const re = /^## (.+?) \[(\d+)[^\]]*\]\s*$/gm
  let match
  while ((match = re.exec(markdown)) !== null) {
    const start = re.lastIndex
    const next = /^## /gm
    next.lastIndex = start
    const following = next.exec(markdown)
    sections.push({
      name: match[1],
      limit: Number(match[2]),
      body: markdown.slice(start, following ? following.index : undefined).trim(),
    })
  }
  return sections
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.md'))

describe('store listings', () => {
  it('exist for every language the app ships in', () => {
    // A listing missing a locale means that language's store page falls back to
    // English, which reads as an app that only claims to be translated.
    expect(files.map((f) => f.replace('.md', '')).sort()).toEqual(
      LOCALES.map((l) => l.code).sort(),
    )
  })

  for (const file of files) {
    describe(file, () => {
      const markdown = readFileSync(join(DIR, file), 'utf8')
      const sections = parseSections(markdown)

      it('declares the fields both stores ask for', () => {
        const names = sections.map((s) => s.name)
        expect(names).toContain('App name [30]'.split(' [')[0])
        expect(names.some((n) => n.startsWith('Short description'))).toBe(true)
        expect(names.some((n) => n.startsWith('Full description'))).toBe(true)
        expect(names.some((n) => n.startsWith('Keywords'))).toBe(true)
      })

      for (const section of sections) {
        it(`"${section.name}" fits in ${section.limit} characters`, () => {
          expect(section.body.length).toBeLessThanOrEqual(section.limit)
        })
      }

      it('carries the health disclaimer', () => {
        // Both stores expect a health app to say it is not medical advice, and
        // the listing is where a user reads it before installing.
        expect(markdown.length).toBeGreaterThan(500)
        expect(sections.find((s) => s.name.startsWith('Full description'))).toBeDefined()
      })
    })
  }
})

describe('parseSections', () => {
  it('reads a section body up to the next heading', () => {
    const [first, second] = parseSections('## A [5]\n\nhello\n\n## B [9]\n\nworld\n')
    expect(first).toMatchObject({ name: 'A', limit: 5, body: 'hello' })
    expect(second).toMatchObject({ name: 'B', limit: 9, body: 'world' })
  })

  it('ignores headings with no declared limit', () => {
    expect(parseSections('## Notes\n\nfree text\n')).toEqual([])
  })
})
