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

// settings สำหรับเทสโควตาระเบิด (FIX #35/#40) — override จาก default
function baseSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  return { ...defaultSettings(), ...overrides }
}

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
// ⚠️ ห้ามเพิ่ม END_GAME ที่นี่ — invariant ของ suite นี้คือ "เกมต้องเดินถึงจุดจบตามธรรมชาติ"
// (alive <= 1 || hiddenLeft === 0) ถ้าเกมหยุดเองได้ตอนไหนก็ได้ invariant จะเป็นจริงแบบว่างเปล่า
// แล้ว suite จะเลิกพิสูจน์อะไรเลย END_GAME มีเทสของตัวเองใน engine.test.ts
function randomAction(h: GameHandle, rng: () => number): GameAction {
  const s = h.getState()
  if (s.phase === 'defusing') {
    // เลือกสีก่อน → ต้อง ACK_DEFUSE ถึงจบ turn (สองเฟส)
    if (s.defuseResult) return { type: 'ACK_DEFUSE' }
    return { type: 'CHOOSE_WIRE', wire: rng() < 0.5 ? 'red' : 'blue' }
  }
  // FIX #25: ถูกถามว่าจะใช้ Block กันไหม — ตอบสุ่ม
  if (s.phase === 'blocking') {
    return { type: 'RESOLVE_BLOCK', use: rng() < 0.5 }
  }
  // โดนโจมตีค้างถึงตา — เลือกสุ่มว่าจะกันกี่ใบ (0..จำนวนที่กันได้)
  if (s.phase === 'defending') {
    const cur = s.teams[s.currentTeamIndex]
    const max = Math.min(
      cur.pendingAttacks.length,
      cur.hand.filter((c) => c === 'block').length,
    )
    return { type: 'RESOLVE_ATTACK_DEFENSE', use: Math.floor(rng() * (max + 1)) }
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
    if (card === 'block') {
      // Block ใช้เล่นตรง ๆ ไม่ได้ — เก็บไว้ในมือ (ใช้ได้ตอนถูกถามผ่าน popup เท่านั้น)
      // บางครั้งทิ้งทิ้งบ้าง ไม่งั้นมือจะล้น (maxHandSize จำกัด)
      if (rng() < 0.5) {
        return { type: 'DISCARD_CARD', index: cur.hand.indexOf(card) }
      }
    } else if (card === 'attack') {
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

// FIX #35 / #40: ระเบิดจริงต้อง = ทีมที่ยังรอด − 1 เสมอ ตลอดทั้งเกม
// และต้องไม่เกิดเคส "ช่องหมด/ระเบิดหมด แต่ยังเหลือหลายทีม"
describe('FIX #35/#40 — โควตาระเบิดจริงคงที่ตามทีมที่รอด', () => {
  it('ทุก dispatch: ระเบิดจริง = ทีมรอด − 1 (เมื่อยังมีช่องว่างพอ)', () => {
    const settings = baseSettings({
      teamNames: ['A', 'B', 'C', 'D', 'E', 'F'],
      rangeMin: 1,
      rangeMax: 60,
      cardsEnabled: true,
      startingHand: 2,
      glitchEnabled: true,
      glitchRatio: 0.4,
    })

    for (let seed = 0; seed < 12; seed++) {
      const h = createGame(settings, seed)
      const rng = createRng(seed + 500)
      let guard = 0

      while (h.getState().phase !== 'gameover' && guard++ < 4000) {
        const st = h.getState()
        const secret = h.serializeSecret()
        const realCount = Object.values(secret).filter((k) => k === 'real').length
        const aliveCount = st.teams.filter((t) => t.alive).length

        // ระหว่างตัดสาย/ตอบ popup ระเบิดยังไม่ resolve — ข้ามการเช็ก
        if (st.phase !== 'defusing' && st.phase !== 'blocking' && st.phase !== 'defending') {
          const hiddenLeft = hiddenCells(h).length
          const expected = Math.max(aliveCount - 1, 0)
          // "สนามตัดสาย" (ทุกช่องที่เหลือเป็นระเบิดจริง) ตั้งใจให้ระเบิดจริงเต็มทุกช่อง
          // โควตา (ทีมรอด − 1) จึงไม่ใช้กับสถานะนั้น — ที่ต้องจริงคือ
          // ระเบิดจริงไม่เกินจำนวนช่องที่ยังเปิดได้
          const inWireCutArena = realCount >= hiddenLeft && hiddenLeft > 0
          if (inWireCutArena) {
            expect(realCount).toBe(hiddenLeft)
          } else if (hiddenLeft >= expected) {
            // เช็กได้เมื่อกระดานยังมีที่ว่างพอจะวางระเบิดตามโควตา
            expect(realCount).toBe(expected)
          }
        }
        h.dispatch(randomAction(h, rng))
      }
      expect(h.getState().phase).toBe('gameover')
    }
  })

  // FIX: จบเกมต้องเหลือผู้ชนะทีมเดียวเท่านั้น
  // ทุกช่องที่เหลือเป็นระเบิด = บังคับตัดสายสลับทีมไปจนเหลือทีมเดียว (ไม่จบเสมอ)
  it('จบเกมแล้วต้องเหลือทีมรอด 1 ทีมเท่านั้น', () => {
    const settings = baseSettings({
      teamNames: ['A', 'B', 'C', 'D', 'E'],
      rangeMin: 1,
      rangeMax: 40,
      cardsEnabled: true,
      startingHand: 2,
    })

    for (let seed = 0; seed < 15; seed++) {
      const h = createGame(settings, seed)
      const rng = createRng(seed + 900)
      let guard = 0
      while (h.getState().phase !== 'gameover' && guard++ < 4000) {
        h.dispatch(randomAction(h, rng))
      }
      const st = h.getState()
      expect(st.phase).toBe('gameover')
      const alive = st.teams.filter((t) => t.alive).length
      // เหลือผู้ชนะทีมเดียว (0 ได้เฉพาะเคสสุดโต่งที่ทุกทีมตกรอบพร้อมกัน)
      expect(alive).toBeLessThanOrEqual(1)
    }
  })

  it('glitch bomb ไม่นับรวมในโควตาระเบิดจริง และระเบิดปกติไม่กลายเป็น glitch', () => {
    const settings = baseSettings({
      teamNames: ['A', 'B', 'C', 'D'],
      rangeMin: 1,
      rangeMax: 40,
      glitchEnabled: true,
      glitchMode: 'manual',
      glitchCount: 5,
      cardsEnabled: false,
    })
    const h = createGame(settings, 3)
    const secret0 = h.serializeSecret()
    expect(Object.values(secret0).filter((k) => k === 'real').length).toBe(3) // 4 ทีม − 1
    expect(Object.values(secret0).filter((k) => k === 'glitch').length).toBe(5)

    const rng = createRng(77)
    let guard = 0
    while (h.getState().phase !== 'gameover' && guard++ < 3000) {
      const secret = h.serializeSecret()
      const glitchCount = Object.values(secret).filter((k) => k === 'glitch').length
      // glitch ไม่เพิ่มเองระหว่างเกม (ระเบิดจริงไม่ mutate เป็น glitch)
      expect(glitchCount).toBeLessThanOrEqual(5)
      h.dispatch(randomAction(h, rng))
    }
  })
})
