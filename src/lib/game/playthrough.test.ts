import { describe, expect, it } from 'bun:test'
import { createGame, type GameHandle } from './engine'
import { bombQuota, defaultTeamNames, defaultSettings } from './config'
import { createRng } from './rng'
import { suggestRange } from './balance'
import type { GameAction, GameSettings } from './types'

// ============================================================
// V8 — Headless playthrough: เล่นเกมจบจริงผ่าน engine ล้วน ไม่แตะ DOM
// เล่นหลาย config combination × หลาย seed แล้วเช็ค invariant
// ============================================================

interface Combo {
  name: string
  cardsEnabled: boolean
  glitchEnabled: boolean
  shrinkingEnabled: boolean
  teamCount: number
}

const COMBOS: Combo[] = [
  { name: 'basic', cardsEnabled: false, glitchEnabled: false, shrinkingEnabled: false, teamCount: 2 },
  { name: 'full', cardsEnabled: true, glitchEnabled: true, shrinkingEnabled: true, teamCount: 6 },
  { name: 'cards-12', cardsEnabled: true, glitchEnabled: false, shrinkingEnabled: false, teamCount: 12 },
  { name: 'glitch-6', cardsEnabled: false, glitchEnabled: true, shrinkingEnabled: false, teamCount: 6 },
  { name: 'cards-glitch-2', cardsEnabled: true, glitchEnabled: true, shrinkingEnabled: false, teamCount: 2 },
  { name: 'shrink-12', cardsEnabled: false, glitchEnabled: false, shrinkingEnabled: true, teamCount: 12 },
  { name: 'cards-shrink-6', cardsEnabled: true, glitchEnabled: false, shrinkingEnabled: true, teamCount: 6 },
]

const SEEDS = 20

function makeSettings(c: Combo): GameSettings {
  const { min, max } = suggestRange(c.teamCount)
  const base = defaultSettings()
  return {
    ...base,
    teamNames: defaultTeamNames(c.teamCount),
    rangeMin: min,
    rangeMax: max,
    turnSeconds: 60,
    glitchEnabled: c.glitchEnabled,
    glitchMode: 'auto',
    glitchRatio: 0.3,
    cardsEnabled: c.cardsEnabled,
    startingHand: c.cardsEnabled ? 1 : 0,
    // กำหนดมือจำกัดไว้ให้ invariant มือมีผล (0 = ไม่จำกัด ต้องข้าม invariant)
    maxHandSize: c.cardsEnabled ? 5 : 0,
    shrinkingEnabled: c.shrinkingEnabled,
  }
}

function hiddenCells(h: GameHandle): number[] {
  const s = h.getState()
  const out: number[] = []
  for (let n = s.rangeMin; n <= s.rangeMax; n++) {
    if (!(n in s.cells)) out.push(n)
  }
  return out
}

// เลือก action แบบสุ่ม — ช่วง 'cards' มีโอกาสเปิดป้ายทันที (จำลอง B1)
function randomAction(h: GameHandle, rng: () => number): GameAction {
  const s = h.getState()
  if (s.phase === 'defusing') {
    return { type: 'CHOOSE_WIRE', wire: rng() < 0.5 ? 'red' : 'blue' }
  }
  const hidden = hiddenCells(h)
  if (hidden.length === 0) return { type: 'TIMEOUT' }
  if (s.phase === 'opening') {
    return { type: 'OPEN_CELL', cell: hidden[Math.floor(rng() * hidden.length)] }
  }
  // phase === 'cards'
  const cur = s.teams[s.currentTeamIndex]
  const canPlay = cur.hand.length > 0 && !s.currentGlitched && !s.currentBlocked
  if (canPlay && rng() < 0.3) {
    const card = cur.hand[Math.floor(rng() * cur.hand.length)]
    if (card === 'block' || card === 'attack') {
      const targets = s.teams.filter((t) => t.alive && t.id !== cur.id)
      if (targets.length > 0) {
        return {
          type: 'PLAY_CARD',
          card,
          targetTeamId: targets[Math.floor(rng() * targets.length)].id,
        }
      }
    } else if (card === 'scan') {
      const targetCell =
        s.rangeMin + Math.floor(rng() * (s.rangeMax - s.rangeMin + 1))
      return { type: 'PLAY_CARD', card, targetCell }
    } else {
      // บางครั้งทิ้งการ์ดแทนใช้ (W5.3) — ไม่จบตา ไม่กระทบความคืบหน้าเกม
      if (rng() < 0.3) {
        return { type: 'DISCARD_CARD', index: cur.hand.indexOf(card) }
      }
      return { type: 'PLAY_CARD', card }
    }
  }
  return { type: 'OPEN_CELL', cell: hidden[Math.floor(rng() * hidden.length)] }
}

// เล่นจนจบ — คืนผลการเล่น + จำนวน dispatch ที่ใช้
function playToEnd(h: GameHandle, maxDispatches: number): { dispatches: number } {
  const rng = createRng(999)
  let dispatches = 0
  while (dispatches < maxDispatches) {
    const s = h.getState()
    if (s.phase === 'gameover') return { dispatches }
    h.dispatch(randomAction(h, rng))
    dispatches++
  }
  throw new Error(`เกมไม่จบใน ${maxDispatches} dispatches (phase=${h.getState().phase})`)
}

describe('V8 playthrough — เล่นเกมจบจริงทุก config', () => {
  for (const combo of COMBOS) {
    it(`${combo.name}: ${SEEDS} seeds จบเกมได้ + invariant ครบ`, () => {
      for (let seed = 0; seed < SEEDS; seed++) {
        const settings = makeSettings(combo)
        const h = createGame(settings, seed)
        const totalCells = settings.rangeMax - settings.rangeMin + 1
        const maxDispatches = totalCells * 10 + 3000
        const { dispatches } = playToEnd(h, maxDispatches)
        const s = h.getState()

        // 1. จบภายในรอบที่กำหนด (ไม่ infinite loop) — playToEnd ขว้างถ้าเกิน
        expect(dispatches).toBeLessThan(maxDispatches)
        // 2. phase สุดท้าย = gameover
        expect(s.phase).toBe('gameover')

        // 3. ทีมที่รอด ≤ 1 หรือช่องหมด
        const alive = s.teams.filter((t) => t.alive).length
        const hiddenLeft = hiddenCells(h).length
        expect(alive <= 1 || hiddenLeft === 0).toBe(true)

        // 6. eliminatedAt ไม่ซ้ำกัน
        const ats = s.teams
          .filter((t) => t.eliminatedAt !== null)
          .map((t) => t.eliminatedAt as number)
        expect(new Set(ats).size).toBe(ats.length)

        // 5. ไม่มีทีมถือการ์ดเกิน maxHandSize (ข้ามเมื่อ 0 = ไม่จำกัด)
        if (s.settings.maxHandSize > 0) {
          for (const t of s.teams) {
            expect(t.hand.length).toBeLessThanOrEqual(s.settings.maxHandSize)
          }
        }
      }
    })
  }

  it('invariant ระหว่างเกม: bombsRemaining ไม่เคยติดลบ, มือไม่เกิน maxHandSize (ทุก dispatch)', () => {
    for (const combo of COMBOS) {
      const settings = makeSettings(combo)
      const h = createGame(settings, 3)
      const rng = createRng(42)
      const totalCells = settings.rangeMax - settings.rangeMin + 1
      const maxDispatches = totalCells * 10 + 3000
      let d = 0
      while (d < maxDispatches) {
        const s = h.getState()
        if (s.phase === 'gameover') break
        expect(s.bombsRemaining).toBeGreaterThanOrEqual(0)
        if (s.settings.maxHandSize > 0) {
          for (const t of s.teams) {
            expect(t.hand.length).toBeLessThanOrEqual(s.settings.maxHandSize)
          }
        }
        h.dispatch(randomAction(h, rng))
        d++
      }
      expect(h.getState().phase).toBe('gameover')
    }
  })

  it('จับ B1: ต้นตา (phase=cards) เปิดช่องได้ทันทีโดยไม่ใช้การ์ด — ถ้า engine ปิดจะแดง', () => {
    const settings = makeSettings(COMBOS[0]) // cardsEnabled: false → phase เริ่ม = opening
    // ใช้ config ที่การ์ดเปิด → phase เริ่ม = cards
    const cardsOn = makeSettings({ ...COMBOS[0], cardsEnabled: true })
    const h = createGame(cardsOn, 5)
    expect(h.getState().phase).toBe('cards')
    // เปิดช่องแรก (hidden) โดยตรง ไม่ผ่านการ์ด — ต้องได้ผล
    const cell = hiddenCells(h)[0]
    const before = h.getState()
    h.dispatch({ type: 'OPEN_CELL', cell })
    const after = h.getState()
    const changed =
      after.phase !== before.phase || (cell in after.cells && !(cell in before.cells))
    expect(changed).toBe(true)
    void settings
  })
})

// การันตีว่าโค้ดนี้มีระเบิดจริง = ทีม − 1 (เพื่อให้เล่นจบได้จริง)
describe('V8 sanity — bombQuota', () => {
  it('ระเบิดจริง = ทีม − 1', () => {
    expect(bombQuota(6)).toBe(5)
    expect(bombQuota(12)).toBe(11)
    expect(bombQuota(2)).toBe(1)
  })
})