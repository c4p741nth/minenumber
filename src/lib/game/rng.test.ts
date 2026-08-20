import { describe, expect, it } from 'bun:test'
import { createRng, pickRandom, randomInt, shuffle, weightedPick } from './rng'

describe('createRng (mulberry32)', () => {
  it('same seed → same sequence every time (deterministic)', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 100 }, () => a())
    const seqB = Array.from({ length: 100 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('different seeds → different sequences', () => {
    const a = createRng(1)
    const b = createRng(2)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).not.toEqual(seqB)
  })

  it('outputs are in [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('randomInt', () => {
  it('stays within inclusive bounds', () => {
    const rng = createRng(99)
    for (let i = 0; i < 1000; i++) {
      const v = randomInt(rng, 5, 10)
      expect(v).toBeGreaterThanOrEqual(5)
      expect(v).toBeLessThanOrEqual(10)
    }
  })

  it('single-value range returns that value', () => {
    const rng = createRng(1)
    expect(randomInt(rng, 7, 7)).toBe(7)
  })
})

describe('pickRandom', () => {
  it('always returns a member of the array', () => {
    const rng = createRng(5)
    const arr = ['a', 'b', 'c']
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(pickRandom(rng, arr))
    }
  })

  it('single-element array always returns that element', () => {
    const rng = createRng(5)
    expect(pickRandom(rng, ['only'])).toBe('only')
  })
})

describe('shuffle', () => {
  it('is a permutation (same elements, deterministic)', () => {
    const rngA = createRng(123)
    const rngB = createRng(123)
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const outA = shuffle(rngA, input)
    const outB = shuffle(rngB, input)
    expect(outA).toEqual(outB)
    expect(outA.slice().sort((a, b) => a - b)).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) // ไม่ mutate input
  })
})

describe('weightedPick', () => {
  it('heavy weight wins overwhelmingly', () => {
    const rng = createRng(2024)
    const picks = Array.from({ length: 1000 }, () => weightedPick(rng, [['rare', 1], ['common', 999]]))
    const common = picks.filter((p) => p === 'common').length
    expect(common).toBeGreaterThan(950)
  })

  it('respects weights deterministically', () => {
    const items: ReadonlyArray<readonly [string, number]> = [
      ['a', 25],
      ['b', 20],
      ['c', 15],
      ['d', 15],
      ['e', 10],
      ['f', 15],
    ]
    const rngA = createRng(777)
    const rngB = createRng(777)
    const seqA = Array.from({ length: 50 }, () => weightedPick(rngA, items))
    const seqB = Array.from({ length: 50 }, () => weightedPick(rngB, items))
    expect(seqA).toEqual(seqB)
  })
})