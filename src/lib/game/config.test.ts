import { describe, expect, it } from 'bun:test'
import { LIMITS, defaultTeamNames, maxScanRadiusFor, suggestedScanRadius } from './config'

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