import { describe, expect, it } from 'bun:test'
import { setupBombs } from './setup'
import { createRng } from './rng'
import type { GameSettings } from './types'

function baseSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    teamNames: ['A', 'B', 'C', 'D', 'E', 'F'],
    rangeMin: 1,
    rangeMax: 40,
    turnSeconds: 60,
    glitchEnabled: true,
    glitchMode: 'manual',
    glitchRatio: 0.3,
    glitchCount: 5,
    glitchLockTurns: 2, // FIX_LISTS ชุดใหม่ #5: ค่าเดิมที่เคย hardcode ในเอนจิน
    glitchStack: false, // FIX_LISTS ชุดที่สิบสี่ #3: เหยียบซ้ำ = รีเซ็ต (พฤติกรรมเดิม)
    cardsEnabled: true,
    maxHandSize: 5,
    startingHand: 0,
    scanRadius: 3,
    shrinkingEnabled: false,
  defuseSeconds: 15,
    defendSeconds: 30,
    sfxVolume: 80,
    ...overrides,
  }
}

describe('setupBombs — manual glitch count', () => {
  it('manual glitch = 5 → ได้ glitch 5 ลูกจริง ไม่เกินช่องว่าง', () => {
    const settings = baseSettings()
    const bombs = setupBombs(settings, createRng(1))
    const kinds = Array.from(bombs.values())
    expect(kinds.filter((k) => k === 'real')).toHaveLength(5) // ทีม − 1 = 5
    expect(kinds.filter((k) => k === 'glitch')).toHaveLength(5)
    expect(bombs.size).toBe(10)
  })

  it('manual glitch มากเกินช่องว่าง → ตัดให้เท่าช่องว่าง', () => {
    // 2 ทีม range 1–3 → real 1, ว่างเหลือ 2 ช่อง → glitch ตัดเป็น 2
    const settings = baseSettings({
      teamNames: ['A', 'B'],
      rangeMin: 1,
      rangeMax: 3,
      glitchCount: 100,
    })
    const bombs = setupBombs(settings, createRng(1))
    const kinds = Array.from(bombs.values())
    expect(kinds.filter((k) => k === 'real')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'glitch')).toHaveLength(2)
    expect(bombs.size).toBe(3)
  })

  it('glitch ปิด → ไม่มี glitch แม้ตั้ง manual ไว้', () => {
    const settings = baseSettings({ glitchEnabled: false, glitchCount: 5 })
    const bombs = setupBombs(settings, createRng(1))
    const kinds = Array.from(bombs.values())
    expect(kinds.every((k) => k === 'real')).toBe(true)
    expect(kinds).toHaveLength(5)
  })
})