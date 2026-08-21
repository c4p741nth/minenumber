import { describe, expect, it } from 'bun:test'
import {
  DEFAULTS,
  LIMITS,
  autoCellsFor,
  bombQuota,
  defaultSettings,
  defaultTeamNames,
  glitchCountFor,
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

describe('FIX_LISTS #3: ช่องขั้นต่ำขยับตาม option ที่เปิด', () => {
  it('ไม่เปิด option อะไรเลย → ขั้นต่ำ = ระเบิดจริง (พฤติกรรมเดิม #2/#15)', () => {
    expect(minCellsFor(8)).toBe(bombQuota(8))
    expect(minCellsFor(8, {})).toBe(bombQuota(8))
  })

  it('เปิด glitch แบบกำหนดเอง → ขั้นต่ำบวกจำนวน glitch ที่กรอกไว้', () => {
    // 8 ทีม → ระเบิดจริง 7 + glitch 3 = 10 ช่อง
    expect(minCellsFor(8, { glitchCount: 3 })).toBe(bombQuota(8) + 3)
  })

  it('เปิดการ์ดด้วย → ขั้นต่ำเผื่อที่ให้การ์ดในสำรับ', () => {
    expect(minCellsFor(8, { deckSize: 7 })).toBe(bombQuota(8) + 7)
  })

  it('เปิดทั้ง glitch และการ์ด → บวกทั้งสองอย่าง', () => {
    expect(minCellsFor(8, { glitchCount: 2, deckSize: 7 })).toBe(bombQuota(8) + 9)
  })

  it('ที่ขั้นต่ำพอดี glitch ที่ตั้งไว้ต้องไม่ถูก clamp หาย (เหตุผลของข้อนี้)', () => {
    const teams = 8
    const glitch = 3
    const cells = minCellsFor(teams, { glitchCount: glitch })
    // ช่องว่างหลังวางระเบิดจริง ต้องพอสำหรับ glitch ทุกลูก
    expect(glitchCountFor(bombQuota(teams), cells, 'manual', 0, glitch)).toBe(glitch)
  })

  it('ค่าติดลบ/ว่าง ไม่ทำให้ขั้นต่ำเพี้ยน', () => {
    expect(minCellsFor(8, { glitchCount: -5, deckSize: -2 })).toBe(bombQuota(8))
  })
})

// ── FIX_LISTS ชุดใหม่ #4: ขั้นต่ำต้องนับ glitch ที่ลงกระดานจริง (auto ด้วย) ──
describe('FIX_LISTS ชุดใหม่ #4: ขั้นต่ำนับ glitch โหมด auto ด้วย', () => {
  it('ระเบิดจริง 5 + glitch(auto 30% → 1) + การ์ด 7 → ขั้นต่ำ 13 ไม่ใช่ 12', () => {
    const teams = 6 // ระเบิดจริง = 5
    expect(bombQuota(teams)).toBe(5)
    // glitch โหมด auto ที่ 30% ของระเบิดจริง 5 ลูก → floor(1.5) = 1
    const autoGlitch = glitchCountFor(5, 5 + LIMITS.maxGlitchCount, 'auto', 0.3, 0)
    expect(autoGlitch).toBe(1)
    expect(minCellsFor(teams, { glitchCount: autoGlitch, deckSize: 7 })).toBe(13)
  })

  it('ที่ขั้นต่ำพอดี glitch โหมด auto ต้องไม่ถูก clamp หาย', () => {
    const teams = 6
    const quota = bombQuota(teams)
    const autoGlitch = glitchCountFor(quota, quota + LIMITS.maxGlitchCount, 'auto', 0.3, 0)
    const cells = minCellsFor(teams, { glitchCount: autoGlitch, deckSize: 7 })
    // วางลงกระดานขนาดขั้นต่ำแล้ว glitch ต้องยังครบทุกลูก
    expect(glitchCountFor(quota, cells, 'auto', 0.3, 0)).toBe(autoGlitch)
  })
})

// ── FIX_LISTS ชุดใหม่ #5: จำนวน turn ที่ glitch ล็อกการใช้ item ───────────
describe('FIX_LISTS ชุดใหม่ #5: glitchLockTurns ตั้งค่าได้', () => {
  it('ค่า default = 2 turn (พฤติกรรมเดิมที่เคย hardcode ในเอนจิน)', () => {
    expect(DEFAULTS.glitchLockTurns).toBe(2)
    expect(defaultSettings().glitchLockTurns).toBe(2)
  })

  it('ขอบเขตตั้งได้ 0 ถึง 10 — 0 = โดนแล้วไม่ล็อกเลย', () => {
    expect(LIMITS.minGlitchLockTurns).toBe(0)
    expect(LIMITS.maxGlitchLockTurns).toBe(10)
  })
})
