import { describe, expect, it } from 'bun:test'
import {
  LIMITS,
  autoCellsFor,
  bombQuota,
  defaultTeamNames,
  maxScanRadiusFor,
  minCellsFor,
  suggestedScanRadius,
} from './config'

describe('defaultTeamNames', () => {
  it('ชื่อทีม default เป็นตัวเลข ทีม 1, ทีม 2, …', () => {
    expect(defaultTeamNames(3)).toEqual(['ทีม 1', 'ทีม 2', 'ทีม 3'])
  })

  it('รองรับ 1 ทีมขึ้นไปตามจำนวนที่ขอ', () => {
    expect(defaultTeamNames(1)).toEqual(['ทีม 1'])
    expect(defaultTeamNames(8)).toHaveLength(8)
    expect(defaultTeamNames(8)[7]).toBe('ทีม 8')
  })
})

describe('scan radius adapt (W6.2)', () => {
  it('maxScanRadiusFor ≈ 10% ของกระดาน clamp 1–20', () => {
    expect(maxScanRadiusFor(20)).toBe(2) // 10% = 2
    expect(maxScanRadiusFor(60)).toBe(6) // 10% = 6
    expect(maxScanRadiusFor(200)).toBe(20) // cap ที่ 20
    expect(maxScanRadiusFor(5)).toBe(LIMITS.minScanRadius) // ขั้นต่ำ 1
  })

  it('suggestedScanRadius ≈ 5% ของกระดาน clamp 1–20', () => {
    expect(suggestedScanRadius(20)).toBe(1) // 5% = 1
    expect(suggestedScanRadius(60)).toBe(3) // 5% = 3
    expect(suggestedScanRadius(400)).toBe(20) // cap
    expect(suggestedScanRadius(2)).toBe(1) // ขั้นต่ำ
  })

  it('แนะนำ ≤ max เสมอ', () => {
    for (const cells of [10, 60, 200]) {
      expect(suggestedScanRadius(cells)).toBeLessThanOrEqual(maxScanRadiusFor(cells))
    }
  })
})
// ── FIX_LISTS #1/#2/#15: จำนวนช่องอัตโนมัติ + ช่องขั้นต่ำ ────────────────────
describe('FIX_LISTS #1: autoCellsFor', () => {
  it('8 ทีม (ระเบิดจริง 7) + glitch 1 + การ์ด 10 → 18 ช่อง', () => {
    expect(bombQuota(8)).toBe(7)
    expect(autoCellsFor(7, 1, 10)).toBe(18)
  })

  it('ไม่มี glitch/ไม่เปิดการ์ด → เท่าจำนวนระเบิดจริง', () => {
    expect(autoCellsFor(7, 0, 0)).toBe(7)
  })

  it('อย่างน้อย 1 ช่องเสมอ (2 ทีมแต่ปิดทุกอย่าง)', () => {
    expect(autoCellsFor(0, 0, 0)).toBe(1)
  })
})

describe('FIX_LISTS #2/#15: ตั้งช่องให้เท่ากับจำนวนระเบิดได้', () => {
  it('ช่องขั้นต่ำ = จำนวนระเบิดจริง ไม่ใช่จำนวนทีม', () => {
    // 8 ทีม → ระเบิดจริง 7 → ตั้ง 7 ช่องได้ (เดิมบังคับ 8)
    expect(minCellsFor(8)).toBe(7)
    expect(minCellsFor(2)).toBe(1)
  })

  it('ช่อง = ระเบิดจริง → โอกาสโดนระเบิด 100% (บังคับเข้า cut wire)', () => {
    const teams = 8
    const bombs = bombQuota(teams)
    const cells = minCellsFor(teams)
    expect(cells).toBe(bombs)
    // ทุกช่องเป็นระเบิด → เปิดช่องไหนก็เจอ
    expect(bombs / cells).toBe(1)
  })
})
