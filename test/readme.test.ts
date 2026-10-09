// The READMEs repeat facts the code holds: which languages are offered and
// read aloud or from images, what each flag says, which bench scripts exist. These tests fail when one side
// moves without the other. Numbers from a bench run cannot be checked this way;
// the rule in .claude/rules/translator-readmes.md covers those.
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { CANDIDATES } from '../bench/candidates'
import { FLAG_TEXT } from '../src/blocks'
import { LANGUAGES } from '../src/languages'
import { TYPED } from '../src/typed'

const readme = readFileSync('README.md', 'utf8')
const bench = readFileSync('bench/README.md', 'utf8')

/** Every language the bench knows, by name: the offered ones and the rest. */
const NAMES = [...new Set(Object.values(CANDIDATES).map((l) => l.name))]
const offered = Object.values(LANGUAGES).filter((l) => l.code !== 'en').map((l) => l.name).sort()
const named = (text: string) => NAMES.filter((n) => new RegExp(`\\b${n}\\b`).test(text)).sort()

const section = (md: string, heading: string) => md.split(`\n## ${heading}\n`)[1]?.split('\n## ')[0] ?? ''

describe('README', () => {
  test('names exactly the languages the app offers', () => {
    expect(named(section(readme, 'Languages').trim().split('\n\n')[0])).toEqual(offered)
  })

  test('names exactly the languages that can be read aloud', () => {
    const voiced = Object.values(LANGUAGES).filter((l) => l.code !== 'en' && l.voice).map((l) => l.name).sort()
    expect(named(section(readme, 'Reading aloud').trim().split('\n\n')[0])).toEqual(voiced)
  })

  test('names exactly the languages that can be read from images', () => {
    const read = Object.values(LANGUAGES).filter((l) => l.code !== 'en' && l.ocr).map((l) => l.name).sort()
    expect(named(section(readme, 'Reading images and PDFs').trim().split('\n\n')[0])).toEqual(read)
  })

  test('names exactly the languages a source can be typed in', () => {
    expect(named(section(readme, 'Typed in Latin letters').trim().split('\n\n')[0])).toEqual(TYPED.map((c) => LANGUAGES[c].name).sort())
  })

  test('explains every flag the app shows, by its label', () => {
    const rows = section(readme, 'Warning flags').match(/^\| (?!Flag|---)[^|]+\|/gm)!.map((r) => r.slice(2, -2).trim())
    expect(rows.sort()).toEqual(Object.values(FLAG_TEXT).sort())
  })
})

describe('bench/README', () => {
  test('lists exactly the offered languages as passed', () => {
    const rows = bench.split('\n').filter((l) => /^\|[^|]+\| Passed\b/.test(l))
    expect([...new Set(rows.flatMap((r) => named(r.split('|')[1])))].sort()).toEqual(offered)
  })

  test('mentions every file in bench/', () => {
    const files = readdirSync('bench').filter((f) => f !== 'README.md')
    expect(files.filter((f) => !bench.includes(f))).toEqual([])
  })
})
