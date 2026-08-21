import { describe, expect, it } from 'bun:test'
import {
  bombDensity,
  chanceDisplay,
  hitChance,
  isForcedWireCut,
  suggestRange,
  verdictFor,
} from './balance'
import { bombQuota } from './config'

describe('bombDensity', () => {
  it('คิดความหนาแน่น = ระเบิด / ช่อง', () => {
    expect(bombDensity(3, 30)).toBeCloseTo(0.1)
    expect(bombDensity(0, 30)).toBe(0)
    expect(bombDensity(10, 0)).toBe(0) // กันหารศูนย์
  })
})

describe('verdictFor — ทุกขอบเขต (เกณฑ์เดียวกับ bar โอกาสโดนระเบิด W2)', () => {
  // FIX_LISTS ชุดใหม่ #6: ช่วงต่ำแยกเป็น 2 ระดับ — very-easy (ง่ายมาก) กับ easy (ง่าย)
  it('ต่ำกว่า 0.08 → very-easy (ง่ายมาก)', () => {
    expect(verdictFor(0.079)).toBe('very-easy')
    expect(verdictFor(0)).toBe('very-easy')
  })

  it('0.08–0.15 → easy (ง่าย) คั่นระหว่างง่ายมากกับสมดุล', () => {
    expect(verdictFor(0.08)).toBe('easy')
    expect(verdictFor(0.149)).toBe('easy')
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
      expect(d.level).toBe('easy')
    }
  })

  it('certain: ระเบิดเต็มทุกช่อง → หลบยังไงก่อน (100%)', () => {
    const d = chanceDisplay(10, 10, 2) // 10 ≥ 2×4 และระเบิดเต็มช่อง
    expect(d).toEqual({ kind: 'certain', text: 'หลบยังไงก่อน (100%)', percent: 100 })
  })

  it('unplayable: ช่องน้อยกว่าจำนวนทีม → เล่นยังไงก่อน (มันเล่นไม่ได้ ช่องน้อยไป๊)', () => {
    // FIX #4: ขั้นต่ำคือ "ช่อง ≥ จำนวนทีม" ไม่ใช่ ทีม × 4
    const d = chanceDisplay(5, 3, 8) // 3 ช่อง < 8 ทีม
    expect(d).toEqual({
      kind: 'unplayable',
      text: 'เล่นยังไงก่อน (มันเล่นไม่ได้ ช่องน้อยไป๊)',
    })
  })
})
describe('FIX_LISTS #14: บังคับเข้าโหมดตัดสายเมื่อโอกาสโดน 100%', () => {
  it('ช่องที่เหลือ = ระเบิดจริง → บังคับตัดสาย', () => {
    expect(isForcedWireCut(3, 3)).toBe(true)
    expect(isForcedWireCut(1, 1)).toBe(true)
  })

  it('ยังมีช่องปลอดภัยเหลือ → ยังไม่บังคับ', () => {
    expect(isForcedWireCut(3, 4)).toBe(false)
    expect(isForcedWireCut(0, 5)).toBe(false)
  })

  it('ระเบิดมากกว่าช่อง (เผื่อ state เพี้ยน) → ยังถือว่าบังคับ', () => {
    expect(isForcedWireCut(5, 3)).toBe(true)
  })

  it('ไม่มีช่องเหลือแล้ว → ไม่บังคับ (เกมจบไปแล้ว ไม่ใช่โหมดตัดสาย)', () => {
    expect(isForcedWireCut(0, 0)).toBe(false)
    expect(isForcedWireCut(3, 0)).toBe(false)
  })

  it('สอดคล้องกับ hitChance = 100%', () => {
    expect(hitChance(3, 3)).toBe(1)
    expect(isForcedWireCut(3, 3)).toBe(true)
  })
})
