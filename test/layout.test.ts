import { describe, expect, test } from 'bun:test'
import { LABELS, readingOrder, regionsOf, type Region } from '../src/layout'

/** One detector row: [label index, score, x1, y1, x2, y2], as PP-DocLayout-S gives it. */
const row = (label: string, score: number, x1: number, y1: number, x2: number, y2: number) => [LABELS.indexOf(label), score, x1, y1, x2, y2]
const box = (x1: number, y1: number, x2: number, y2: number, text = ''): Region => ({ box: [x1, y1, x2, y2], text })

describe("the detector's rows", () => {
  test('keep text regions above the threshold and count pictures apart', () => {
    const r = regionsOf([row('text', 0.8, 10, 10, 200, 60), row('image', 0.7, 300, 10, 500, 200), row('text', 0.1, 10, 300, 200, 340)].flat(), 600, 400)
    expect(r.text.map((t) => t.box)).toEqual([[10, 10, 200, 60]])
    expect(r.pictures).toBe(1)
  })

  test('drop a region mostly inside one already kept: the same text found twice', () => {
    const r = regionsOf([row('text', 0.9, 0, 0, 400, 200), row('paragraph_title', 0.6, 10, 10, 390, 190)].flat(), 600, 400)
    expect(r.text).toHaveLength(1)
  })

  test('clamp a region to the page and drop one too small to hold a line', () => {
    const r = regionsOf([row('text', 0.9, -20, -5, 700, 100), row('text', 0.9, 50, 300, 54, 303)].flat(), 600, 400)
    expect(r.text.map((t) => t.box)).toEqual([[0, 0, 600, 100]])
  })

  test('never count a picture below the picture threshold', () => {
    expect(regionsOf(row('image', 0.3, 0, 0, 100, 100), 600, 400).pictures).toBe(0)
  })
})

describe('reading order', () => {
  test('reads a title, then two columns, each top to bottom', () => {
    const title = box(0, 0, 600, 40, 'title')
    const order = readingOrder([box(320, 60, 600, 200, 'right top'), box(0, 220, 280, 400, 'left bottom'), title, box(0, 60, 280, 200, 'left top'), box(320, 220, 600, 400, 'right bottom')])
    expect(order.map((r) => r.text)).toEqual(['title', 'left top', 'left bottom', 'right top', 'right bottom'])
  })

  test('falls back to top to bottom when no gap separates the regions', () => {
    const order = readingOrder([box(0, 50, 300, 120, 'b'), box(100, 0, 400, 80, 'a')])
    expect(order.map((r) => r.text)).toEqual(['a', 'b'])
  })
})
