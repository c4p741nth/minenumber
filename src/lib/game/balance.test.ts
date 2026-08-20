import { describe, expect, it } from 'bun:test'
import { bombDensity, suggestRange, verdictFor } from './balance'
import { bombQuota } from './config'

describe('bombDensity', () => {
  it('คิดความหนาแน่น = ระเบิด / ช่อง', () => {
    expect(bombDensity(3, 30)).toBeCloseTo(0.1)
    expect(bombDensity(0, 30)).toBe(0)
    expect(bombDensity(10, 0)).toBe(0) // กันหารศูนย์
  })
})

describe('verdictFor — ทุกขอบเขต', () => {
  it('ต่ำกว่า 0.08 → too-easy', () => {
    expect(verdictFor(0.079)).toBe('too-easy')
    expect(verdictFor(0)).toBe('too-easy')
  })

  it('0.08–0.20 → good (ขอบบนรวมด้วย)', () => {
    expect(verdictFor(0.08)).toBe('good')
    expect(verdictFor(0.13)).toBe('good')
    expect(verdictFor(0.2)).toBe('good')
  })

  it('0.20–0.35 → risky (ขอบบนรวมด้วย)', () => {
    expect(verdictFor(0.21)).toBe('risky')
    expect(verdictFor(0.35)).toBe('risky')
  })

  it('มากกว่า 0.35 → brutal', () => {
    expect(verdictFor(0.351)).toBe('brutal')
    expect(verdictFor(1)).toBe('brutal')
  })
})

describe('suggestRange', () => {
  it('แนะนำช่วงให้ density อยู่ในโซน good', () => {
    for (const teams of [2, 6, 12]) {
      const { min, max } = suggestRange(teams)
      const cells = max - min + 1
      const density = bombDensity(bombQuota(teams), cells)
      expect(verdictFor(density)).toBe('good')
    }
  })

  it('min เริ่มที่ 1 และ max ≥ min + 1', () => {
    const { min, max } = suggestRange(6)
    expect(min).toBe(1)
    expect(max).toBeGreaterThan(min)
  })
})