import { describe, expect, it } from 'bun:test'
import { createGame, createGameFromState, type GameHandle } from './engine'
import { createRng } from './rng'
import { refillBombs } from './setup'
import type { BombKind, CardType, CellState, GameAction, GameSettings } from './types'

function baseSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    teamNames: ['A', 'B', 'C', 'D'],
    rangeMin: 1,
    rangeMax: 20,
    turnSeconds: 60,
    glitchEnabled: false,
    glitchMode: 'auto',
    glitchRatio: 0.3,
    glitchCount: 0,
    cardsEnabled: false,
    maxHandSize: 5,
    startingHand: 0,
    scanRadius: 3,
    shrinkingEnabled: false,
    ...overrides,
  }
}

function secretMap(h: GameHandle): Record<number, BombKind> {
  return h.serializeSecret()
}

function bombCellOf(h: GameHandle, kind: BombKind): number {
  const secret = secretMap(h)
  const entry = Object.entries(secret).find(([, k]) => k === kind)
  if (!entry) throw new Error(`no ${kind} bomb for this seed`)
  return Number(entry[0])
}

function safeCellOf(h: GameHandle): number {
  const secret = secretMap(h)
  const state = h.getState()
  for (let n = state.rangeMin; n <= state.rangeMax; n++) {
    if (!(n in secret) && !(n in state.cells)) return n
  }
  throw new Error('no safe cell')
}

// หา seed ที่ defuse ได้ผลตามต้องการ — rng deterministic → seed นี้คงที่ทุกครั้งที่รัน
function findDefuseSeed(settings: GameSettings, desiredSurvived: boolean): number {
  for (let seed = 0; seed < 20000; seed++) {
    const h = createGame(settings, seed)
    const cell = bombCellOf(h, 'real')
    const openerId = h.getState().currentTeamIndex
    h.dispatch({ type: 'OPEN_CELL', cell })
    if (h.getState().phase !== 'defusing') continue
    h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
    if (h.getState().teams[openerId].alive === desiredSurvived) return seed
  }
  throw new Error('no seed found for defuse outcome')
}

describe('createGame / setup', () => {
  it('สร้างระเบิด = ทีม−1 พอดี (ไม่นับ glitch)', () => {
    const h = createGame(baseSettings({ teamNames: ['A', 'B', 'C'], rangeMin: 1, rangeMax: 30 }), 1)
    expect(h.getState().bombsRemaining).toBe(2)
    expect(Object.values(secretMap(h))).toEqual(['real', 'real'])
  })

  it('glitch เป็นระเบิดส่วนเกิน ไม่นับในโควตา ทีม−1', () => {
    // 4 ทีม → real 3, glitch = floor(0.5 × 3) = 1 → รวม 4
    const h = createGame(baseSettings({ glitchEnabled: true, glitchRatio: 0.5 }), 7)
    const kinds = Object.values(secretMap(h))
    expect(kinds.filter((k) => k === 'real')).toHaveLength(3)
    expect(kinds.filter((k) => k === 'glitch')).toHaveLength(1)
    expect(h.getState().bombsRemaining).toBe(4)
  })
})

describe('opening cells', () => {
  it('เปิดช่องตอนช่วงการ์ด (cards) ได้ทันทีโดยไม่ต้องใช้การ์ด (DoD B1)', () => {
    const settings = baseSettings({ cardsEnabled: true, teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    const h = createGame(settings, 5)
    expect(h.getState().phase).toBe('cards')
    const cell = safeCellOf(h)
    const opener = h.getState().currentTeamIndex
    const state = h.dispatch({ type: 'OPEN_CELL', cell })
    expect(state.cells[cell]).toBe('safe')
    expect(state.currentTeamIndex).not.toBe(opener)
  })

  it('เปิดช่อง safe → cells[n] = safe, turn เดินต่อ', () => {
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    const h = createGame(settings, 5)
    const cell = safeCellOf(h)
    const opener = h.getState().currentTeamIndex
    const state = h.dispatch({ type: 'OPEN_CELL', cell })
    expect(state.cells[cell]).toBe('safe')
    expect(state.phase).toBe('opening')
    expect(state.lastResult).toEqual({ kind: 'safe' })
    // pendingOpens = 1 → เปิด safe แล้วจบ turn ไปทีมถัดไป
    expect(state.currentTeamIndex).not.toBe(opener)
  })

  it('เปิดช่องที่เปิดแล้ว/นอก range → ไม่มีผล', () => {
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    const h = createGame(settings, 5)
    const cell = safeCellOf(h)
    h.dispatch({ type: 'OPEN_CELL', cell })
    const before = h.getState()
    expect(h.dispatch({ type: 'OPEN_CELL', cell })).toEqual(before)
    expect(h.dispatch({ type: 'OPEN_CELL', cell: 999 })).toEqual(before)
  })

  it('เปิด real bomb → phase = defusing', () => {
    const h = createGame(baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 }), 3)
    const cell = bombCellOf(h, 'real')
    const state = h.dispatch({ type: 'OPEN_CELL', cell })
    expect(state.phase).toBe('defusing')
    expect(state.pendingDefuse).toEqual({ cell })
  })

  it('glitch bomb → ทีมไม่ตาย, glitchTurnsLeft = 2, หายจากระบบทันที', () => {
    const settings = baseSettings({ glitchEnabled: true, glitchRatio: 0.5, rangeMin: 1, rangeMax: 30 })
    const h = createGame(settings, 11)
    const cell = bombCellOf(h, 'glitch')
    const openerId = h.getState().currentTeamIndex
    const before = h.getState().bombsRemaining
    const state = h.dispatch({ type: 'OPEN_CELL', cell })
    expect(state.cells[cell]).toBe('glitched')
    expect(state.teams[openerId].alive).toBe(true)
    expect(state.teams[openerId].glitchTurnsLeft).toBe(2)
    expect(state.bombsRemaining).toBe(before - 1) // หายจากระบบ ไม่ย้าย
    expect(state.phase).not.toBe('defusing') // กู้ไม่ได้
  })
})

describe('defuse', () => {
  it('defuse สำเร็จ → ช่องเป็น defused, bombsRemaining เท่าเดิม, turn จบ', () => {
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    const seed = findDefuseSeed(settings, true)
    const h = createGame(settings, seed)
    const cell = bombCellOf(h, 'real')
    const before = h.getState().bombsRemaining
    h.dispatch({ type: 'OPEN_CELL', cell })
    const state = h.dispatch({ type: 'CHOOSE_WIRE', wire: 'blue' })
    expect(state.cells[cell]).toBe('defused')
    expect(state.bombsRemaining).toBe(before) // ย้าย ไม่หาย
    expect(state.lastResult).toEqual({ kind: 'real', survived: true })
    expect(state.phase).toBe('opening')
    expect(state.pendingDefuse).toBeNull()
  })

  it('defuse ล้มเหลว → ทีมตาย, bombsRemaining ลด 1', () => {
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    const seed = findDefuseSeed(settings, false)
    const h = createGame(settings, seed)
    const cell = bombCellOf(h, 'real')
    const openerId = h.getState().currentTeamIndex
    const before = h.getState().bombsRemaining
    h.dispatch({ type: 'OPEN_CELL', cell })
    const state = h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
    expect(state.cells[cell]).toBe('detonated')
    expect(state.teams[openerId].alive).toBe(false)
    expect(state.teams[openerId].eliminatedAt).toBe(1)
    expect(state.bombsRemaining).toBe(before - 1) // หายจากระบบ (คัดทีมออก)
  })

  it('defuse สำเร็จแต่ไม่มีช่องให้ย้าย → ระเบิดถูกทำลาย หายจากระบบ (ไม่ค้างเป็นระเบิดผี)', () => {
    // 2 ทีม range 1–3 ระเบิดจริง 1 ลูก — เปิด safe 2 ช่องก่อน เหลือแต่ช่องระเบิด
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 3, cardsEnabled: false })
    let seed = -1
    for (let s = 0; s < 5000; s++) {
      const h = createGame(settings, s)
      const cell = bombCellOf(h, 'real')
      const safe = [1, 2, 3].filter((n) => n !== cell)
      for (const c of safe) h.dispatch({ type: 'OPEN_CELL', cell: c })
      h.dispatch({ type: 'OPEN_CELL', cell })
      if (h.getState().phase !== 'defusing') continue
      const after = h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
      if (after.teams[0].alive) {
        seed = s
        break
      }
    }
    expect(seed).toBeGreaterThanOrEqual(0)
    const h = createGame(settings, seed)
    const cell = bombCellOf(h, 'real')
    const safe = [1, 2, 3].filter((n) => n !== cell)
    for (const c of safe) h.dispatch({ type: 'OPEN_CELL', cell: c })
    const before = h.getState().bombsRemaining
    h.dispatch({ type: 'OPEN_CELL', cell })
    const state = h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
    expect(state.teams[0].alive).toBe(true)
    expect(state.cells[cell]).toBe('defused')
    expect(state.bombsRemaining).toBe(before - 1) // ถูกทำลาย ไม่ย้าย ไม่ค้าง
    expect(Object.keys(h.serializeSecret())).toHaveLength(0) // ไม่มีระเบิดผีค้าง
  })

  it('ผลไม่ขึ้นกับสีที่เลือก — แดงกับน้ำเงินให้ผลเท่ากัน (ตัดสินไว้ก่อนแล้ว)', () => {
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    for (let seed = 0; seed < 50; seed++) {
      const h1 = createGame(settings, seed)
      const h2 = createGame(settings, seed)
      const cell = bombCellOf(h1, 'real')
      h1.dispatch({ type: 'OPEN_CELL', cell })
      h2.dispatch({ type: 'OPEN_CELL', cell })
      const s1 = h1.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
      const s2 = h2.dispatch({ type: 'CHOOSE_WIRE', wire: 'blue' })
      expect(s1.teams[0].alive).toBe(s2.teams[0].alive)
      expect(s1.cells[cell]).toBe(s2.cells[cell])
    }
  })

  it('defuse ประมาณ 50/50 และสีไม่มีผลเลย (DoD Task 6, 100 เกม)', () => {
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    const total = 100
    let redSurvived = 0
    let blueSurvived = 0
    for (let seed = 0; seed < total; seed++) {
      const hRed = createGame(settings, seed)
      const hBlue = createGame(settings, seed)
      hRed.dispatch({ type: 'OPEN_CELL', cell: bombCellOf(hRed, 'real') })
      hBlue.dispatch({ type: 'OPEN_CELL', cell: bombCellOf(hBlue, 'real') })
      if (hRed.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' }).teams[0].alive) redSurvived++
      if (hBlue.dispatch({ type: 'CHOOSE_WIRE', wire: 'blue' }).teams[0].alive) blueSurvived++
    }
    // ~50/50 (rng < 0.5) — จาก 100 ควรอยู่ในช่วง 30–70
    expect(redSurvived).toBeGreaterThan(30)
    expect(redSurvived).toBeLessThan(70)
    // seed เดียวกัน → ผลเดียวกัน ทั้งที่เลือกสีต่างกัน (พิสูจน์ว่าสีไม่มีผล)
    expect(redSurvived).toBe(blueSurvived)
  })
})

describe('end conditions', () => {
  it('ทีมสุดท้ายรอด → phase = gameover, อันดับถูกต้อง', () => {
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    const seed = findDefuseSeed(settings, false)
    const h = createGame(settings, seed)
    const cell = bombCellOf(h, 'real')
    const openerId = h.getState().currentTeamIndex
    h.dispatch({ type: 'OPEN_CELL', cell })
    const state = h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
    expect(state.phase).toBe('gameover')
    expect(state.teams[openerId].eliminatedAt).toBe(1)
    const winner = state.teams.find((t) => t.alive)
    expect(winner).toBeDefined()
    expect(winner?.eliminatedAt).toBeNull()
    expect(state.log.some((l) => l.message.includes('ชนะ'))).toBe(true)
  })

  it('ช่อง hidden หมด แต่เหลือ >1 ทีม → เสมอ', () => {    // 2 ทีม range 1–8, 1 ระเบิดจริง — เปิด safe 7 ช่อง เหลือ hidden เฉพาะช่องระเบิด
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    const seed = findDefuseSeed(settings, true)
    const h = createGame(settings, seed)
    const bombCell = bombCellOf(h, 'real')
    for (let n = 1; n <= 8; n++) {
      if (n === bombCell) continue
      h.dispatch({ type: 'OPEN_CELL', cell: n })
    }
    expect(h.getState().phase).toBe('opening')
    // เปิดช่องระเบิด → กู้สำเร็จ → ไม่มี hidden ให้ย้าย → hidden = 0 → เสมอ
    h.dispatch({ type: 'OPEN_CELL', cell: bombCell })
    const state = h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
    expect(state.phase).toBe('gameover')
    expect(state.log.some((l) => l.message.includes('เสมอ'))).toBe(true)
    expect(state.teams.every((t) => t.alive)).toBe(true)
  })

  it('ระเบิดหมดแต่เหลือ 3 ทีม → เติมระเบิดใหม่ 2 ลูก (safety net, refillBombs)', () => {
    const bombs = new Map<number, BombKind>()
    const rng = createRng(1)
    const added = refillBombs(bombs, {}, 1, 20, 3, rng)
    expect(added).toBe(2)
    expect(bombs.size).toBe(2)
    expect(Array.from(bombs.values())).toEqual(['real', 'real'])
    for (const n of bombs.keys()) {
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(20)
    }
  })

  it('เติมระเบิดให้พอดีกับช่อง hidden ที่เหลือ (ไม่เกินที่ว่าง)', () => {
    const bombs = new Map<number, BombKind>()
    const cells: Record<number, CellState> = { 1: 'safe', 2: 'safe' }
    const rng = createRng(2)
    // alive 6 → ต้องการ 5 แต่ hidden เหลือ 8 → เติม 5
    expect(refillBombs(bombs, cells, 1, 10, 6, rng)).toBe(5)
  })

  it('4 ทีมตกรอบตามลำดับ → eliminatedAt ถูกต้อง (DoD Task 9: อันดับ 1-4)', () => {
    const settings = baseSettings({ teamNames: ['A', 'B', 'C', 'D'], rangeMin: 1, rangeMax: 16 })
    let seed = -1
    for (let s = 0; s < 50000; s++) {
      const h = createGame(settings, s)
      if (openAndDefuseFail(h) && openAndDefuseFail(h) && openAndDefuseFail(h)) {
        seed = s
        break
      }
    }
    expect(seed).toBeGreaterThanOrEqual(0)
    const h = createGame(settings, seed)
    openAndDefuseFail(h)
    openAndDefuseFail(h)
    openAndDefuseFail(h)
    const s = h.getState()
    expect(s.phase).toBe('gameover')
    // ทีม 0,1,2 ตกรอบตามลำดับ (eliminatedAt = 1,2,3) ทีม 3 ชนะ
    expect(s.teams[0].eliminatedAt).toBe(1)
    expect(s.teams[1].eliminatedAt).toBe(2)
    expect(s.teams[2].eliminatedAt).toBe(3)
    expect(s.teams[3].alive).toBe(true)
    expect(s.teams[3].eliminatedAt).toBeNull()
  })
})

// เปิดระเบิดจริงช่องแรกแล้ว defuse ให้ล้มเหลว — คืน true ถ้าทีมนั้นตาย
function openAndDefuseFail(h: GameHandle): boolean {
  const s = h.getState()
  const secret = h.serializeSecret()
  const realBomb = Number(Object.entries(secret).find(([, k]) => k === 'real')![0])
  const opener = s.currentTeamIndex
  h.dispatch({ type: 'OPEN_CELL', cell: realBomb })
  if (h.getState().phase !== 'defusing') return false
  h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
  return !h.getState().teams[opener].alive
}

describe('maxHandSize / startingHand', () => {
  it('maxHandSize: 3 → จั่วใบที่ 4 ไม่เข้า (DoD V4)', () => {
    const settings = baseSettings({
      cardsEnabled: true,
      maxHandSize: 3,
      startingHand: 0,
      teamNames: ['A', 'B'],
    })
    const h = createGame(settings, 5)
    for (let i = 0; i < 5; i++) {
      h.dispatch({ type: 'DRAW_CARD', teamId: '0' })
    }
    expect(h.getState().teams[0].hand.length).toBe(3)
    h.dispatch({ type: 'DRAW_CARD', teamId: '0' })
    expect(h.getState().teams[0].hand.length).toBe(3)
  })

  it('startingHand: 2 → ทุกทีมเริ่มด้วยการ์ด 2 ใบ', () => {
    const settings = baseSettings({
      cardsEnabled: true,
      startingHand: 2,
      teamNames: ['A', 'B', 'C'],
    })
    const h = createGame(settings, 5)
    for (const t of h.getState().teams) {
      expect(t.hand).toHaveLength(2)
    }
  })

  it('จั่วอัตโนมัติจบตาไม่เกิน maxHandSize (4/5/7)', () => {
    for (const size of [3, 5, 7]) {
      const settings = baseSettings({
        cardsEnabled: true,
        maxHandSize: size,
        startingHand: 0,
        teamNames: ['A', 'B'],
        rangeMin: 1,
        rangeMax: 12,
      })
      const h = createGame(settings, 11)
      let guard = 0
      while (h.getState().phase !== 'gameover' && guard < 5000) {
        guard++
        const s = h.getState()
        if (s.phase === 'defusing') {
          h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
        } else {
          const hidden: number[] = []
          for (let n = s.rangeMin; n <= s.rangeMax; n++) {
            if (!(n in s.cells)) hidden.push(n)
          }
          const secret = secretMap(h)
          const safe = hidden.find((n) => !(n in secret))
          if (safe !== undefined) h.dispatch({ type: 'OPEN_CELL', cell: safe })
          else h.dispatch({ type: 'OPEN_CELL', cell: hidden[0] })
        }
        for (const t of h.getState().teams) {
          expect(t.hand.length).toBeLessThanOrEqual(size)
        }
      }
    }
  })
})

describe('V5 turn flow — use many cards + block', () => {
  function cardGame(overrides: Partial<GameSettings> = {}): GameSettings {
    return baseSettings({
      cardsEnabled: true,
      startingHand: 0,
      teamNames: ['A', 'B', 'C'],
      rangeMin: 1,
      rangeMax: 20,
      ...overrides,
    })
  }

  // จั่วจนครบมือ แล้วเช็คว่ามีการ์ดตามที่ต้องการครบไหม — true = ได้ seed นี้
  function seedHasCards(settings: GameSettings, teamId: string, need: CardType[]): boolean {
    const h = createGame(settings, 0)
    const maxHand = h.getState().settings.maxHandSize
    for (let i = 0; i < maxHand; i++) {
      h.dispatch({ type: 'DRAW_CARD', teamId })
    }
    const hand = h.getState().teams[Number(teamId)].hand
    for (const c of need) {
      if (hand.filter((x) => x === c).length < need.filter((x) => x === c).length) return false
    }
    return true
  }

  function findSeedForCards(settings: GameSettings, teamId: string, need: CardType[]): number {
    for (let s = 0; s < 40000; s++) {
      const h = createGame(settings, s)
      const maxHand = h.getState().settings.maxHandSize
      for (let i = 0; i < maxHand; i++) h.dispatch({ type: 'DRAW_CARD', teamId })
      const hand = h.getState().teams[Number(teamId)].hand
      const ok = need.every(
        (c) => hand.filter((x) => x === c).length >= need.filter((x) => x === c).length,
      )
      if (ok) return s
    }
    throw new Error('no seed for cards')
  }

  it('ในตาเดียวใช้ scan 2 ใบ + block 1 ใบ ได้ (ไม่มีลิมิตต่อตา)', () => {
    const settings = cardGame()
    const seed = findSeedForCards(settings, '0', ['scan', 'scan', 'block'])
    const h = createGame(settings, seed)
    const maxHand = h.getState().settings.maxHandSize
    for (let i = 0; i < maxHand; i++) h.dispatch({ type: 'DRAW_CARD', teamId: '0' })

    const before = h.getState().teams[0].hand.length
    h.dispatch({ type: 'PLAY_CARD', card: 'scan', targetCell: 1 })
    h.dispatch({ type: 'PLAY_CARD', card: 'scan', targetCell: 5 })
    h.dispatch({ type: 'PLAY_CARD', card: 'block', targetTeamId: '1' })
    const s = h.getState()
    expect(s.phase).toBe('cards') // ยังไม่จบตา
    expect(s.teams[0].hand.length).toBe(before - 3) // ใช้ 3 ใบในตาเดียว
    expect(s.teams[1].blockedTurnsLeft).toBe(1)
  })

  it('หลัง OPEN_CELL แล้ว PLAY_CARD ไม่มีผล (การ์ดไม่หายจากมือ)', () => {
    // A โจมตี B → B ต้องเปิด 2 → B เปิด 1 แล้วยังอยู่ตาเดิม (opening) → ใช้การ์ดต่อไม่ได้
    const settings = cardGame({ startingHand: 1, teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    let seed = -1
    for (let s = 0; s < 40000; s++) {
      const h = createGame(settings, s)
      if (h.getState().teams[0].hand.includes('attack')) {
        seed = s
        break
      }
    }
    expect(seed).toBeGreaterThanOrEqual(0)
    const h = createGame(settings, seed)
    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    expect(h.getState().currentTeamIndex).toBe(1)
    expect(h.getState().teams[1].pendingOpens).toBe(2)

    const safe = safeCellOf(h)
    h.dispatch({ type: 'OPEN_CELL', cell: safe })
    const s = h.getState()
    expect(s.phase).toBe('opening')
    expect(s.currentTeamIndex).toBe(1) // ยังตาเดิม เหลือเปิดอีก 1

    const handBefore = s.teams[1].hand.length
    const anyCard = s.teams[1].hand[0]
    h.dispatch({ type: 'PLAY_CARD', card: anyCard, targetTeamId: '0' })
    expect(h.getState().teams[1].hand.length).toBe(handBefore) // ไม่หาย
  })

  it('block ทีม B → ตาถัดไปของ B currentBlocked=true และตาถัดไปอีกตาเป็น false', () => {
    const settings = cardGame({ startingHand: 1, teamNames: ['A', 'B', 'C'] })
    let seed = -1
    for (let s = 0; s < 40000; s++) {
      const h = createGame(settings, s)
      if (h.getState().teams[0].hand.includes('block')) {
        seed = s
        break
      }
    }
    expect(seed).toBeGreaterThanOrEqual(0)
    const h = createGame(settings, seed)
    h.dispatch({ type: 'PLAY_CARD', card: 'block', targetTeamId: '1' })
    expect(h.getState().teams[1].blockedTurnsLeft).toBe(1)

    endCurrentTurnSafe(h) // A เปิด safe จบตา → ถึง B
    expect(h.getState().currentTeamIndex).toBe(1)
    expect(h.getState().currentBlocked).toBe(true)

    endCurrentTurnSafe(h) // B จบตา → C
    endCurrentTurnSafe(h) // C จบตา → A
    endCurrentTurnSafe(h) // A จบตา → B อีกครั้ง
    expect(h.getState().currentTeamIndex).toBe(1)
    expect(h.getState().currentBlocked).toBe(false)
  })
})

// เปิด safe จนจบตาของทีมปัจจุบัน (วนจน turn เปลี่ยน)
function endCurrentTurnSafe(h: GameHandle): void {
  const startTurn = h.getState().turnNumber
  const startTeam = h.getState().currentTeamIndex
  let guard = 0
  while (guard < 200) {
    guard++
    const s = h.getState()
    if (s.phase === 'defusing') {
      h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
      continue
    }
    if (s.phase === 'gameover') return
    if (s.phase === 'cards') {
      // เปิดป้ายเลย — ข้ามช่วงการ์ด
    }
    const secret = secretMap(h)
    let opened = false
    for (let n = s.rangeMin; n <= s.rangeMax; n++) {
      if (!(n in secret) && !(n in s.cells)) {
        h.dispatch({ type: 'OPEN_CELL', cell: n })
        opened = true
        break
      }
    }
    if (!opened) {
      // ไม่มี safe → เปิดช่องแรกที่ยัง hidden
      for (let n = s.rangeMin; n <= s.rangeMax; n++) {
        if (!(n in s.cells)) {
          h.dispatch({ type: 'OPEN_CELL', cell: n })
          break
        }
      }
    }
    if (h.getState().currentTeamIndex !== startTeam || h.getState().turnNumber !== startTurn) return
  }
}

describe('determinism / resume', () => {
  it('seed เดียวกัน + action ชุดเดียวกัน → state เหมือนกันทุกครั้ง', () => {
    const settings = baseSettings({ teamNames: ['A', 'B', 'C'], rangeMin: 1, rangeMax: 12 })
    const h1 = createGame(settings, 42)
    const h2 = createGame(settings, 42)
    const actions: GameAction[] = []
    for (let i = 0; i < 3; i++) {
      actions.push({ type: 'OPEN_CELL', cell: safeCellOf(h1) })
    }
    for (const a of actions) {
      h1.dispatch(a)
      h2.dispatch(a)
    }
    expect(h1.getState()).toEqual(h2.getState())
  })

  it('getState() ไม่มี field ไหนบอกตำแหน่งระเบิดได้', () => {
    const h = createGame(baseSettings({ glitchEnabled: true, glitchRatio: 0.5 }), 99)
    const secret = secretMap(h)
    const state = h.getState()
    expect('bombs' in state).toBe(false)
    // ช่องระเบิดทุกช่องยังเป็น hidden (ไม่มีใน cells)
    for (const n of Object.keys(secret)) {
      expect(state.cells[Number(n)]).toBeUndefined()
    }
    // JSON ของ public state ต้องไม่มีตำแหน่งระเบิดโผล่
    const json = JSON.stringify(state)
    for (const n of Object.keys(secret)) {
      expect(json).not.toContain(`"${n}"`)
    }
  })

  it('createGameFromState กู้ state กลับมาได้ครบ (Task 10 resume)', () => {
    const settings = baseSettings({ teamNames: ['A', 'B', 'C'], rangeMin: 1, rangeMax: 12 })
    const h = createGame(settings, 42)
    for (let i = 0; i < 3; i++) {
      const s = h.getState()
      const secret = h.serializeSecret()
      for (let n = s.rangeMin; n <= s.rangeMax; n++) {
        if (!(n in secret) && !(n in s.cells)) {
          h.dispatch({ type: 'OPEN_CELL', cell: n })
          break
        }
      }
    }
    const state = h.getState()
    const secret = h.serializeSecret()
    const restored = createGameFromState(state, secret, 999)
    expect(restored.getState()).toEqual(state)
    expect(restored.serializeSecret()).toEqual(secret)

    // กู้แล้วเล่นต่อได้ — เปิดช่องปลอดภัยถัดไปไม่ crash
    const s2 = restored.getState()
    const sec2 = restored.serializeSecret()
    for (let n = s2.rangeMin; n <= s2.rangeMax; n++) {
      if (!(n in sec2) && !(n in s2.cells)) {
        const after = restored.dispatch({ type: 'OPEN_CELL', cell: n })
        expect(after.cells[n]).toBe('safe')
        break
      }
    }
  })
})