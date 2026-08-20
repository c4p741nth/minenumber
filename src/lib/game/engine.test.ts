import { describe, expect, it } from 'bun:test'
import { createGame, createGameFromState, type GameHandle } from './engine'
import { createRng } from './rng'
import { refillBombs } from './setup'
import { defaultSettings } from './config'
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
  defuseSeconds: 15,
    musicUrl: '',
    musicVolume: 30,
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

  it('glitch bomb → ทีมไม่ตาย, glitchTurnsLeft = 2, ระเบิดย้ายไปช่องอื่น (FIX #35)', () => {
    const settings = baseSettings({ glitchEnabled: true, glitchRatio: 0.5, rangeMin: 1, rangeMax: 30 })
    const h = createGame(settings, 11)
    const cell = bombCellOf(h, 'glitch')
    const openerId = h.getState().currentTeamIndex
    const before = h.getState().bombsRemaining
    const state = h.dispatch({ type: 'OPEN_CELL', cell })
    expect(state.cells[cell]).toBe('glitched')
    expect(state.teams[openerId].alive).toBe(true)
    expect(state.teams[openerId].glitchTurnsLeft).toBe(2)
    // FIX #35: glitch ที่โดนเปิดต้องย้ายไปช่องอื่น ไม่ใช่หายไป
    // (เดิมหายทำให้ระเบิดในกระดานลดลงเรื่อย ๆ ระหว่างเล่น)
    expect(state.bombsRemaining).toBe(before)
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
  it('TIMEOUT → ทีมนั้นเสีย turn ไปเลย ไม่มีการสุ่มเปิดให้ (FIX #18)', () => {
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 20 })
    const h = createGame(settings, 5)
    const before = h.getState()
    const openedBefore = Object.keys(before.cells).length
    const s2 = h.dispatch({ type: 'TIMEOUT' })
    // ไม่มีช่องไหนถูกเปิดเพิ่ม — เสีย turn เฉย ๆ
    expect(Object.keys(s2.cells).length).toBe(openedBefore)
    // ขึ้นตาถัดไปแล้ว
    expect(s2.turnNumber).toBe(before.turnNumber + 1)
    expect(s2.currentTeamIndex).not.toBe(before.currentTeamIndex)
  })

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

  it('ในตาเดียวใช้การ์ดหลายใบได้ (ไม่มีลิมิตต่อตา)', () => {
    const settings = baseSettings({
      teamNames: ['A', 'B'],
      rangeMin: 1,
      rangeMax: 30,
      cardsEnabled: true,
      startingHand: 3,
      maxHandSize: 0,
    })
    // หา seed ที่ทีม A เริ่มมี scan อย่างน้อย 2 ใบ
    let h = createGame(settings, 0)
    for (let seed = 0; seed < 30000; seed++) {
      const cand = createGame(settings, seed)
      const hand = cand.getState().teams[0].hand
      if (hand.filter((c) => c === 'scan').length >= 2) {
        h = cand
        break
      }
    }
    const before = h.getState().teams[0].hand.length
    h.dispatch({ type: 'PLAY_CARD', card: 'scan', targetCell: 5 })
    h.dispatch({ type: 'PLAY_CARD', card: 'scan', targetCell: 15 })
    const st = h.getState()
    // ใช้ไป 2 ใบในตาเดียว และยังอยู่ในตาเดิม (scan ไม่จบตา)
    expect(st.teams[0].hand.length).toBe(before - 2)
    expect(st.currentTeamIndex).toBe(0)
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

  it('FIX #25: Block เป็นการ์ดตั้งรับ — เก็บเป็น charge ไม่ได้แบนการ์ดทีมอื่น', () => {
    const settings = baseSettings({
      teamNames: ['A', 'B'],
      rangeMin: 1,
      rangeMax: 30,
      cardsEnabled: true,
      startingHand: 3,
      maxHandSize: 0,
    })
    let h = createGame(settings, 0)
    for (let seed = 0; seed < 30000; seed++) {
      const cand = createGame(settings, seed)
      if (cand.getState().teams[0].hand.includes('block')) {
        h = cand
        break
      }
    }
    const st = h.dispatch({ type: 'PLAY_CARD', card: 'block' })
    expect(st.teams[0].blockCharges).toBe(1)
    // ไม่มีใครโดนแบนการ์ด
    expect(st.teams.every((t) => t.blockedTurnsLeft === 0)).toBe(true)
  })

  it('maxHandSize 0 = จั่วได้ไม่จำกัด (เกิน 7 ใบ)', () => {
    const settings = baseSettings({
      cardsEnabled: true,
      maxHandSize: 0,
      startingHand: 0,
      teamNames: ['A', 'B'],
    })
    const h = createGame(settings, 5)
    for (let i = 0; i < 20; i++) h.dispatch({ type: 'DRAW_CARD', teamId: '0' })
    expect(h.getState().teams[0].hand).toHaveLength(20)
  })

  it('default ใหม่: startingHand 3 + maxHandSize 0 (ไม่จำกัด) — แจก 3 ใบ/ทีม', () => {
    const s = defaultSettings()
    expect(s.startingHand).toBe(3)
    expect(s.maxHandSize).toBe(0)
    const h = createGame(
      { ...s, teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 20, cardsEnabled: true },
      1,
    )
    for (const t of h.getState().teams) expect(t.hand).toHaveLength(3)
  })

  it('DISCARD_CARD ทิ้งใบที่ index → หายจากมือ, ไม่จบตา, ไม่ได้จั่วชดเชย', () => {
    const settings = baseSettings({
      cardsEnabled: true,
      startingHand: 1,
      maxHandSize: 5,
      teamNames: ['A', 'B'],
      rangeMin: 1,
      rangeMax: 20,
    })
    const h = createGame(settings, 5)
    const before = h.getState().teams[0].hand.length
    expect(before).toBe(1)
    const s = h.dispatch({ type: 'DISCARD_CARD', index: 0 })
    expect(s.teams[0].hand).toHaveLength(before - 1)
    expect(s.teams[0].stats.cardsDiscarded).toBe(1)
    expect(s.phase).toBe('cards') // ไม่จบตา
    expect(s.currentTeamIndex).toBe(0) // ยังเป็นตาทีมเดิม
    expect(s.log.some((l) => l.message.includes('ทิ้งการ์ด'))).toBe(true)
  })

  it('DISCARD_CARD ตอนติด glitch → ไม่มีผล (การ์ดไม่หาย)', () => {
    const settings = baseSettings({
      glitchEnabled: true,
      glitchMode: 'manual',
      glitchCount: 3,
      cardsEnabled: true,
      startingHand: 1,
      maxHandSize: 5,
      teamNames: ['A', 'B'],
      rangeMin: 1,
      rangeMax: 30,
    })
    // หา seed ที่: ทีม 0 เปิด glitch ก่อน (glitchTurnsLeft=2) แล้ววนกลับมาตา 0 ติด glitch
    let seed = -1
    for (let s = 0; s < 20000; s++) {
      const h = createGame(settings, s)
      const secret = h.serializeSecret()
      const glitch = Object.entries(secret).find(([, k]) => k === 'glitch')
      if (!glitch) continue
      h.dispatch({ type: 'OPEN_CELL', cell: Number(glitch[0]) })
      if (h.getState().teams[0].glitchTurnsLeft !== 2) continue
      const s2 = h.getState()
      let safe = -1
      for (let n = s2.rangeMin; n <= s2.rangeMax; n++) {
        if (!(n in secret) && !(n in s2.cells)) {
          safe = n
          break
        }
      }
      if (safe < 0) continue
      h.dispatch({ type: 'OPEN_CELL', cell: safe })
      if (h.getState().currentTeamIndex !== 0) continue
      seed = s
      break
    }
    expect(seed).toBeGreaterThanOrEqual(0)
    const h = createGame(settings, seed)
    const secret = h.serializeSecret()
    const glitchCell = Number(Object.entries(secret).find(([, k]) => k === 'glitch')![0])
    h.dispatch({ type: 'OPEN_CELL', cell: glitchCell })
    const s2 = h.getState()
    let safe = -1
    for (let n = s2.rangeMin; n <= s2.rangeMax; n++) {
      if (!(n in secret) && !(n in s2.cells)) {
        safe = n
        break
      }
    }
    h.dispatch({ type: 'OPEN_CELL', cell: safe })
    const state = h.getState()
    expect(state.currentTeamIndex).toBe(0)
    expect(state.currentGlitched).toBe(true)
    const handBefore = state.teams[0].hand.length
    h.dispatch({ type: 'DISCARD_CARD', index: 0 })
    expect(h.getState().teams[0].hand).toHaveLength(handBefore)
  })

  it('DISCARD_CARD ตอนติด glitch → ไม่มีผล (การ์ดไม่หาย)', () => {
    // ต้องมีทีมพอให้ bombQuota สูงพอที่ glitchRatio จะปัดขึ้นได้อย่างน้อย 1 ลูก
    const settings = baseSettings({
      teamNames: ['A', 'B', 'C', 'D'],
      rangeMin: 1,
      rangeMax: 30,
      cardsEnabled: true,
      startingHand: 3,
      maxHandSize: 0,
      glitchEnabled: true,
      glitchRatio: 0.5,
    })
    // หา seed ที่มี glitch bomb และทีม A มีการ์ดในมือ
    let h = createGame(settings, 0)
    for (let seed = 0; seed < 30000; seed++) {
      const cand = createGame(settings, seed)
      const hasGlitch = Object.values(cand.serializeSecret()).includes('glitch')
      if (hasGlitch && cand.getState().teams[0].hand.length > 0) {
        h = cand
        break
      }
    }
    // ทีม A เหยียบ glitch → ติดกลิตช์ 2 ตา
    const cell = bombCellOf(h, 'glitch')
    h.dispatch({ type: 'OPEN_CELL', cell })
    // วนกลับมาตา A
    let guard = 0
    while (h.getState().currentTeamIndex !== 0 && h.getState().phase !== 'gameover' && guard++ < 20) {
      const st = h.getState()
      const safe = (() => {
        const secret = h.serializeSecret()
        for (let n = st.rangeMin; n <= st.rangeMax; n++) {
          if (!(n in secret) && !(n in st.cells)) return n
        }
        return -1
      })()
      if (safe === -1) break
      h.dispatch({ type: 'OPEN_CELL', cell: safe })
    }
    const st = h.getState()
    if (st.currentGlitched && st.teams[0].hand.length > 0) {
      const before = st.teams[0].hand.length
      const after = h.dispatch({ type: 'DISCARD_CARD', index: 0 })
      expect(after.teams[0].hand.length).toBe(before)
    }
  })

  it('lastDraw เคลียร์เป็น null เมื่อขึ้นตาถัดไป แต่จั่วจริง (มี log draw)', () => {
    const settings = baseSettings({
      cardsEnabled: true,
      startingHand: 0,
      maxHandSize: 5,
      teamNames: ['A', 'B'],
      rangeMin: 1,
      rangeMax: 12,
    })
    const h = createGame(settings, 5)
    const s = h.getState()
    const secret = h.serializeSecret()
    const safe = (() => {
      for (let n = s.rangeMin; n <= s.rangeMax; n++) {
        if (!(n in secret) && !(n in s.cells)) return n
      }
      return -1
    })()
    h.dispatch({ type: 'OPEN_CELL', cell: safe })
    const after = h.getState()
    expect(after.currentTeamIndex).toBe(1) // ขึ้นตาถัดไปแล้ว
    expect(after.lastDraw).toBeNull() // เคลียร์ ไม่ให้ทีมถัดไปเห็น
    expect(after.teams[0].hand).toHaveLength(1) // A จั่วได้จริง
    // หลักฐานว่าจั่วจริง: มี log kind=draw + ระบุทีม
    const drawLog = after.log.find((l) => l.kind === 'draw')
    expect(drawLog?.card).toBeDefined()
    expect(drawLog?.teamId).toBe('0')
  })
})

describe('W6 — scan radius clamp + result center', () => {
  it('clamp scanRadius ตอนเริ่มเกม ถ้า settings เก่า radius เกินกระดาน', () => {
    const settings = baseSettings({
      teamNames: ['A', 'B'],
      rangeMin: 1,
      rangeMax: 20,
      scanRadius: 50,
    })
    const h = createGame(settings, 1)
    expect(h.getState().settings.scanRadius).toBe(2) // maxScanRadiusFor(20) = 2
  })

  it('scan ผลมี center + found (ไม่รู้ตำแหน่งระเบิด)', () => {
    const settings = baseSettings({
      cardsEnabled: true,
      startingHand: 1,
      maxHandSize: 5,
      teamNames: ['A', 'B'],
      rangeMin: 1,
      rangeMax: 20,
      scanRadius: 2,
    })
    // หา seed ที่ทีม 0 เริ่มด้วยการ์ด scan
    let seed = -1
    for (let s = 0; s < 20000; s++) {
      const h = createGame(settings, s)
      if (h.getState().teams[0].hand[0] === 'scan') {
        seed = s
        break
      }
    }
    expect(seed).toBeGreaterThanOrEqual(0)
    const h = createGame(settings, seed)
    const after = h.dispatch({ type: 'PLAY_CARD', card: 'scan', index: 0, targetCell: 10 })
    expect(after.lastCardResult).toEqual({ card: 'scan', found: expect.any(Boolean), center: 10 })
  })
})

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

// log ต้องเรียงเก่า→ใหม่ (push ต่อท้าย) — UI พึ่ง order นี้ในการ slice(-N).reverse()
// ถ้ากลับด้านที่ engine เมื่อไหร่ LogPanel จะโชว์ผิดทันที
describe('log ordering', () => {
  it('เรียงจากเก่าไปใหม่ และ id เพิ่มขึ้นเรื่อย ๆ', () => {
    const g = createGame(defaultSettings(), 999)
    let st = g.getState()
    for (let c = 1; c <= 5; c++) {
      if (st.phase === 'defusing') st = g.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
      if (st.phase === 'gameover') break
      st = g.dispatch({ type: 'OPEN_CELL', cell: c })
    }
    expect(st.log.length).toBeGreaterThan(1)
    const ids = st.log.map((l) => l.id)
    expect([...ids].sort((a, b) => a - b)).toEqual(ids)
  })
})
