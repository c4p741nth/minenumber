import { describe, expect, it } from 'vitest'
import { createGame, type GameHandle } from './engine'
import { createRng } from './rng'
import { refillBombs } from './setup'
import type { BombKind, CellState, GameAction, GameSettings } from './types'

function baseSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    teamNames: ['A', 'B', 'C', 'D'],
    rangeMin: 1,
    rangeMax: 20,
    turnSeconds: 60,
    glitchEnabled: false,
    glitchRatio: 0.3,
    cardsEnabled: false,
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

  it('ช่อง hidden หมด แต่เหลือ >1 ทีม → เสมอ', () => {
    // 2 ทีม range 1–8, 1 ระเบิดจริง — เปิด safe 7 ช่อง เหลือ hidden เฉพาะช่องระเบิด
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
})

describe('determinism', () => {
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
})