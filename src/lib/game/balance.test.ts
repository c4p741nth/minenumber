import { describe, expect, it } from 'bun:test'
import { bombDensity, chanceDisplay, hitChance, suggestRange, verdictFor } from './balance'
import { bombQuota } from './config'

describe('bombDensity', () => {
  it('คิดความหนาแน่น = ระเบิด / ช่อง', () => {
    expect(bombDensity(3, 30)).toBeCloseTo(0.1)
    expect(bombDensity(0, 30)).toBe(0)
    expect(bombDensity(10, 0)).toBe(0) // กันหารศูนย์
  })
})

describe('verdictFor — ทุกขอบเขต (เกณฑ์เดียวกับ bar โอกาสโดนระเบิด W2)', () => {
  it('ต่ำกว่า 0.15 → too-easy', () => {
    expect(verdictFor(0.149)).toBe('too-easy')
    expect(verdictFor(0)).toBe('too-easy')
  })

  it('0.15–0.30 → good (ขอบบนรวมด้วย)', () => {
    expect(verdictFor(0.15)).toBe('good')
    expect(verdictFor(0.2)).toBe('good')
    expect(verdictFor(0.3)).toBe('good')
  })

  it('0.30–0.50 → risky (ขอบบนรวมด้วย)', () => {
    expect(verdictFor(0.31)).toBe('risky')
    expect(verdictFor(0.5)).toBe('risky')
  })

  it('มากกว่า 0.50 → brutal', () => {
    expect(verdictFor(0.51)).toBe('brutal')
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

describe('hitChance', () => {
  it('ระเบิด / ช่อง hidden (clamp 0–1, กันหารศูนย์)', () => {
    expect(hitChance(3, 30)).toBeCloseTo(0.1)
    expect(hitChance(30, 30)).toBe(1)
    expect(hitChance(0, 30)).toBe(0)
    expect(hitChance(5, 0)).toBe(0)
  })
})

describe('chanceDisplay — ทั้ง 3 kind (W2.3)', () => {
  it('normal: คำนวณ % + ระดับสีจาก verdictFor', () => {
    const d = chanceDisplay(8, 60, 6)
    expect(d.kind).toBe('normal')
    if (d.kind === 'normal') {
      expect(d.percent).toBe(13)
      expect(d.level).toBe('too-easy')
    }
  })

  it('certain: ระเบิดเต็มทุกช่อง → หลบยังไงก่อน (100%)', () => {
    const d = chanceDisplay(10, 10, 2) // 10 ≥ 2×4 และระเบิดเต็มช่อง
    expect(d).toEqual({ kind: 'certain', text: 'หลบยังไงก่อน (100%)', percent: 100 })
  })

  it('unplayable: ช่องน้อยกว่าทีม × 4 → เล่นยังไงก่อน (มันเล่นไม่ได้ ช่องน้อยไป๊)', () => {
    const d = chanceDisplay(5, 7, 2) // 7 < 2×4
    expect(d).toEqual({
      kind: 'unplayable',
      text: 'เล่นยังไงก่อน (มันเล่นไม่ได้ ช่องน้อยไป๊)',
    })
  })
})