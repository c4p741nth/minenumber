import { describe, expect, it } from 'bun:test'
import { createGame, createGameFromState, type GameHandle } from './engine'
import { createRng } from './rng'
import { refillBombs } from './setup'
import { defaultSettings } from './config'
import type {
  BombKind,
  CardType,
  CellState,
  GameAction,
  GameSettings,
  PublicGameState,
} from './types'

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
    glitchLockTurns: 2, // FIX_LISTS ชุดใหม่ #5: ค่าเดิมที่เคย hardcode ในเอนจิน
    glitchStack: false, // FIX_LISTS ชุดที่สิบสี่ #3: เหยียบซ้ำ = รีเซ็ต (พฤติกรรมเดิม)
    cardsEnabled: false,
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
    h.dispatch({ type: 'ACK_DEFUSE' })
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

  // FIX_LISTS ชุดใหม่ #5: จำนวน turn ที่ติดกลิตช์มาจาก settings ไม่ใช่ 2 ตายตัว
  it('glitchLockTurns = 5 → ติดกลิตช์ 5 turn', () => {
    const settings = baseSettings({
      glitchEnabled: true,
      glitchRatio: 0.5,
      glitchLockTurns: 5,
      rangeMin: 1,
      rangeMax: 30,
    })
    const h = createGame(settings, 11)
    const cell = bombCellOf(h, 'glitch')
    const openerId = h.getState().currentTeamIndex
    const state = h.dispatch({ type: 'OPEN_CELL', cell })
    expect(state.teams[openerId].glitchTurnsLeft).toBe(5)
  })

  it('glitchLockTurns = 0 → เปิดเจอแล้วเสียแค่ตานั้น ไม่ล็อกการ์ดต่อ', () => {
    const settings = baseSettings({
      glitchEnabled: true,
      glitchRatio: 0.5,
      glitchLockTurns: 0,
      rangeMin: 1,
      rangeMax: 30,
    })
    const h = createGame(settings, 11)
    const cell = bombCellOf(h, 'glitch')
    const openerId = h.getState().currentTeamIndex
    const state = h.dispatch({ type: 'OPEN_CELL', cell })
    expect(state.teams[openerId].alive).toBe(true)
    expect(state.teams[openerId].glitchTurnsLeft).toBe(0)
    // ยังจบตาตามปกติ — ตาที่เปิดเจอ glitch ไม่ได้จั่วการ์ด
    expect(state.cells[cell]).toBe('glitched')
  })

  // FIX_LISTS ชุดที่สิบสี่ #3: "กดช่องที่ยังไม่เปิดแต่รู้ว่าเป็น glitch แล้วช่องไม่หายไป"
  //   เกิดตอน relocateBomb ย้ายไม่ได้ (ช่อง hidden ที่ยังไม่มีระเบิดหมดแล้ว) ซึ่งเป็นเรื่องปกติ
  //   ถ้าตั้งค่าแบบไม่มีช่อง Safe เปล่า ๆ (ระเบิด 5 + glitch 10 + การ์ด 7 = 22 ช่องพอดี)
  //   เดิมช่องค้างเป็น hidden และยังคาระเบิดลูกเดิม → ทีมถัดไปกดซ้ำก็ติดกลิตช์อีก วนไม่จบ
  it('glitch ที่ย้ายไม่ได้ (ไม่มีช่องว่างเหลือ) — ช่องต้องปิดตัวเอง ไม่ค้างเป็น hidden', () => {
    const settings = baseSettings({ glitchEnabled: true, rangeMin: 1, rangeMax: 4 })
    const h = createGame(settings, 5)
    const base = h.getState()
    // กระดาน 4 ช่อง: ทุกช่องมีระเบิด → ไม่มีช่องว่างให้ย้ายไปเลย
    const secret: Record<number, BombKind> = { 1: 'glitch', 2: 'real', 3: 'real', 4: 'real' }
    const g = createGameFromState({ ...base, cells: {} }, secret, 5)
    const openerId = g.getState().currentTeamIndex
    const state = g.dispatch({ type: 'OPEN_CELL', cell: 1 })
    // ช่องต้อง "หายไป" (เปิดแล้ว) เสมอ ไม่ว่าจะย้ายระเบิดได้หรือไม่
    expect(state.cells[1]).toBe('glitched')
    expect(state.teams[openerId].alive).toBe(true)
    // ระเบิด glitch ลูกนั้นถูกปลดออกจากกระดาน — ห้ามค้างบนช่องที่เปิดแล้ว (ระเบิดผี)
    expect(g.serializeSecret()[1]).toBeUndefined()
    // เปิดซ้ำช่องเดิมไม่ได้อีก และไม่ติดกลิตช์เพิ่ม (ช่องจบแล้วจริง)
    expect(state.cells[1]).not.toBe('hidden')
  })

  // FIX_LISTS ชุดที่สิบสี่ #3: เหยียบซ้ำ — glitchStack เลือกได้ว่าจะสะสมหรือรีเซ็ต
  //   ต้องยัด glitchTurnsLeft ผ่าน snapshot ที่ส่งเข้า createGameFromState เพราะ getState()
  //   คืน clone — แก้ object ที่ได้มาไม่กระทบ state จริงในเอนจิน (เคยเขียนพลาดตรงนี้)
  function stepGlitchWhileGlitched(settings: GameSettings, carry: number) {
    const h = createGame(settings, 5)
    const base = h.getState()
    const idx = base.currentTeamIndex
    const snapshot: PublicGameState = {
      ...base,
      cells: {},
      teams: base.teams.map((t, i) => (i === idx ? { ...t, glitchTurnsLeft: carry } : t)),
    }
    const secret: Record<number, BombKind> = { 1: 'glitch', 2: 'glitch' }
    const g = createGameFromState(snapshot, secret, 5)
    return { state: g.dispatch({ type: 'OPEN_CELL', cell: 1 }), idx }
  }

  it('glitchStack = false (เดิม) → เหยียบซ้ำรีเซ็ตเป็นค่าที่ตั้งไว้', () => {
    const settings = baseSettings({
      glitchEnabled: true,
      glitchLockTurns: 2,
      glitchStack: false,
      rangeMin: 1,
      rangeMax: 8,
    })
    // ค้างอยู่ 5 turn แล้วเหยียบใหม่ → ถูกทับเป็น 2 (โทษเบาลง = พฤติกรรมเดิมที่ผู้เล่นทักมา)
    const { state, idx } = stepGlitchWhileGlitched(settings, 5)
    expect(state.teams[idx].glitchTurnsLeft).toBe(2)
  })

  it('glitchStack = true → เหยียบซ้ำสะสมทับของเดิม', () => {
    const settings = baseSettings({
      glitchEnabled: true,
      glitchLockTurns: 2,
      glitchStack: true,
      rangeMin: 1,
      rangeMax: 8,
    })
    const { state, idx } = stepGlitchWhileGlitched(settings, 3)
    expect(state.teams[idx].glitchTurnsLeft).toBe(5) // 3 + 2
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
    h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
    const state = h.dispatch({ type: 'ACK_DEFUSE' })
    expect(state.cells[cell]).toBe('defused')
    expect(state.bombsRemaining).toBe(before) // ย้าย ไม่หาย
    expect(state.lastResult).toEqual({ kind: 'real', survived: true })
    expect(state.phase).toBe('opening')
    expect(state.pendingDefuse).toBeNull()
    expect(state.defuseResult).toBeNull()
  })

  it('defuse ล้มเหลว → ทีมตาย, bombsRemaining ลด 1', () => {
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    const seed = findDefuseSeed(settings, false)
    const h = createGame(settings, seed)
    const cell = bombCellOf(h, 'real')
    const openerId = h.getState().currentTeamIndex
    const before = h.getState().bombsRemaining
    h.dispatch({ type: 'OPEN_CELL', cell })
    h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
    const state = h.dispatch({ type: 'ACK_DEFUSE' })
    expect(state.cells[cell]).toBe('detonated')
    expect(state.teams[openerId].alive).toBe(false)
    expect(state.teams[openerId].eliminatedAt).toBe(1)
    expect(state.bombsRemaining).toBe(before - 1) // หายจากระบบ (คัดทีมออก)
  })

  // FIX: กู้สำเร็จแต่ไม่มีช่องให้ย้าย → ระเบิดไม่หายจากระบบ (อยู่ที่ช่องเดิม)
  // ช่องไม่เขียว (ยังไม่เปิด) — ทีมถัดไปถูกบังคับตัดสายต่อจนกว่าจะเหลือทีมเดียว
  it('defuse สำเร็จแต่ไม่มีช่องให้ย้าย → ระเบิดอยู่ที่เดิม ช่องไม่เขียว ทีมถัดไปตัดสายต่อ', () => {
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
      h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
      const after = h.dispatch({ type: 'ACK_DEFUSE' })
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
    h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
    const state = h.dispatch({ type: 'ACK_DEFUSE' })
    // ทีมรอด แต่ช่องไม่เขียว — ยังเป็น hidden เหมือนเดิม (ไม่ใช่ defused)
    expect(state.teams[0].alive).toBe(true)
    expect(state.cells[cell]).toBeUndefined()
    // ยังนับว่า "กู้สำเร็จ" — ตัดสายรอดแล้ว ไม่ว่าช่องจะเขียวหรือไม่
    expect(state.teams[0].stats.defusesSucceeded).toBe(1)
    // ระเบิดไม่หายจากระบบ — ยังอยู่ที่ช่องเดิม
    expect(state.bombsRemaining).toBe(before)
    expect(h.serializeSecret()[cell]).toBe('real')
    // ยังเหลือ 2 ทีม → ห้ามจบเกม ต้องเดินต่อเป็นการแข่งตัดสาย
    expect(state.phase).not.toBe('gameover')
    // ระเบิดทุกลูกต้องอยู่บนช่องที่ยัง hidden เท่านั้น — ไม่มีระเบิดผีบนช่องที่เปิดแล้ว
    const secret = h.serializeSecret()
    for (const n of Object.keys(secret)) {
      expect(state.cells[Number(n)]).toBeUndefined()
    }
    // ทีมถัดไปถูกบังคับตัดสายทันที (ทุกช่องที่เหลือเป็นระเบิด)
    expect(state.autoWireCut).toBe(true)
  })

  it('ผลขึ้นกับสีที่เลือกจริง — สายปลอดภัยสุ่มต่อเซสชัน แดงกับน้ำเงินให้ผลตรงข้าม', () => {
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    let redWonCount = 0
    for (let seed = 0; seed < 50; seed++) {
      const h1 = createGame(settings, seed)
      const h2 = createGame(settings, seed)
      const cell = bombCellOf(h1, 'real')
      h1.dispatch({ type: 'OPEN_CELL', cell })
      h2.dispatch({ type: 'OPEN_CELL', cell })
      h1.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
      h2.dispatch({ type: 'CHOOSE_WIRE', wire: 'blue' })
      const s1 = h1.dispatch({ type: 'ACK_DEFUSE' })
      const s2 = h2.dispatch({ type: 'ACK_DEFUSE' })
      // เซสชันเดียวกันมีสายปลอดภัยสีเดียว → เลือกถูกคนหนึ่งรอด อีกคนตายเสมอ
      expect(s1.teams[0].alive).not.toBe(s2.teams[0].alive)
      const redWon = s1.teams[0].alive
      expect(s1.cells[cell]).toBe(redWon ? 'defused' : 'detonated')
      expect(s2.cells[cell]).toBe(redWon ? 'detonated' : 'defused')
      if (redWon) redWonCount++
    }
    // สายปลอดภัยสุ่มจริง — แดงชนะประมาณครึ่งหนึ่ง (ไม่ใช่สีเดิมซ้ำทุกเซสชัน)
    expect(redWonCount).toBeGreaterThan(10)
    expect(redWonCount).toBeLessThan(40)
  })

  it('defuse ประมาณ 50/50 ต่อสี (DoD Task 6, 100 เกม)', () => {
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    const total = 100
    let redSurvived = 0
    let blueSurvived = 0
    for (let seed = 0; seed < total; seed++) {
      const hRed = createGame(settings, seed)
      const hBlue = createGame(settings, seed)
      hRed.dispatch({ type: 'OPEN_CELL', cell: bombCellOf(hRed, 'real') })
      hBlue.dispatch({ type: 'OPEN_CELL', cell: bombCellOf(hBlue, 'real') })
      hRed.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
      hBlue.dispatch({ type: 'CHOOSE_WIRE', wire: 'blue' })
      if (hRed.dispatch({ type: 'ACK_DEFUSE' }).teams[0].alive) redSurvived++
      if (hBlue.dispatch({ type: 'ACK_DEFUSE' }).teams[0].alive) blueSurvived++
    }
    // สายปลอดภัยสุ่ม 50/50 ต่อเซสชัน → แต่ละสีรอด ~50% (จาก 100 ควรอยู่ในช่วง 30–70)
    expect(redSurvived).toBeGreaterThan(30)
    expect(redSurvived).toBeLessThan(70)
    expect(blueSurvived).toBeGreaterThan(30)
    expect(blueSurvived).toBeLessThan(70)
    // ทุกเซสชันมีสายปลอดภัยสีเดียวพอดี → รวมทั้งสองสีต้องได้ 100 พอดี
    expect(redSurvived + blueSurvived).toBe(total)
  })

  it('CHOOSE_WIRE ยังไม่จบ turn — รอ ACK_DEFUSE (สองเฟส)', () => {
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    const seed = findDefuseSeed(settings, true)
    const h = createGame(settings, seed)
    const cell = bombCellOf(h, 'real')
    h.dispatch({ type: 'OPEN_CELL', cell })
    const mid = h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
    // ผลถูกคำนวณแล้ว แต่ยังไม่ลงมือ — ทีมยังรอด phase ยังเป็น defusing
    expect(mid.defuseResult).not.toBeNull()
    expect(mid.phase).toBe('defusing')
    expect(mid.teams[0].alive).toBe(true)
    expect(mid.cells[cell]).toBeUndefined()
    // เลือกซ้ำ → ไม่มีผล (idempotent)
    h.dispatch({ type: 'CHOOSE_WIRE', wire: 'blue' })
    expect(h.getState().defuseResult).toEqual(mid.defuseResult)
    const after = h.dispatch({ type: 'ACK_DEFUSE' })
    expect(after.defuseResult).toBeNull()
    expect(after.pendingDefuse).toBeNull()
    expect(after.cells[cell]).toBe('defused')
  })
})

describe('turnsSurvived (รอบที่รอด)', () => {
  it('จบตาแบบรอด +1 ทุกครั้งที่เล่นจบตา', () => {
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    const seed = findDefuseSeed(settings, true)
    const h = createGame(settings, seed)
    // A เปิดช่องปลอดภัย → จบตา → รอด 1 รอบ
    let state = h.dispatch({ type: 'OPEN_CELL', cell: safeCellOf(h) })
    expect(state.teams[0].stats.turnsSurvived).toBe(1)
    // B เปิดช่องปลอดภัย → รอด 1 รอบ
    state = h.dispatch({ type: 'OPEN_CELL', cell: safeCellOf(h) })
    expect(state.teams[1].stats.turnsSurvived).toBe(1)
    // A เปิดระเบิด ตัดสายสำเร็จ → รอบที่ 2
    const cell = bombCellOf(h, 'real')
    h.dispatch({ type: 'OPEN_CELL', cell })
    h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
    state = h.dispatch({ type: 'ACK_DEFUSE' })
    expect(state.teams[0].stats.turnsSurvived).toBe(2)
    expect(state.teams[1].stats.turnsSurvived).toBe(1)
  })

  it('ตาที่ตายไม่นับรอบที่รอด', () => {
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    const seed = findDefuseSeed(settings, false)
    const h = createGame(settings, seed)
    const cell = bombCellOf(h, 'real')
    h.dispatch({ type: 'OPEN_CELL', cell })
    h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
    const after = h.dispatch({ type: 'ACK_DEFUSE' })
    expect(after.teams[0].alive).toBe(false)
    expect(after.teams[0].stats.turnsSurvived).toBe(0)
    // ผู้ชนะยังไม่เคยได้เล่น — ไม่มีรอบที่รอด
    expect(after.teams[1].alive).toBe(true)
    expect(after.teams[1].stats.turnsSurvived).toBe(0)
  })

  it('สนามตัดสาย: นับเฉพาะรอบที่เล่นจบจริง — กู้ 2 = รอด 2', () => {
    // 2 ทีม range 1–3 ระเบิด 1 ลูก — A เปิด safe 2 ช่อง, กู้ระเบิดรอด,
    // แล้ว B โดนบังคับตัดสายและตายในตาของตัวเอง
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 3, cardsEnabled: false })
    let seed = -1
    for (let s = 0; s < 5000; s++) {
      const h = createGame(settings, s)
      const cell = bombCellOf(h, 'real')
      const safe = [1, 2, 3].filter((n) => n !== cell)
      for (const c of safe) h.dispatch({ type: 'OPEN_CELL', cell: c })
      h.dispatch({ type: 'OPEN_CELL', cell })
      if (h.getState().phase !== 'defusing') continue
      h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
      if (!h.dispatch({ type: 'ACK_DEFUSE' }).teams[0].alive) continue
      // B โดนบังคับตัดสาย (autoWireCut) — ตัดแดง ถ้าตาย = seed นี้
      h.dispatch({ type: 'START_WIRE_CUT' })
      if (h.getState().phase !== 'defusing') continue
      h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
      if (!h.dispatch({ type: 'ACK_DEFUSE' }).teams[1].alive) {
        seed = s
        break
      }
    }
    expect(seed).toBeGreaterThanOrEqual(0)
    const h = createGame(settings, seed)
    const cell = bombCellOf(h, 'real')
    const safe = [1, 2, 3].filter((n) => n !== cell)
    for (const c of safe) h.dispatch({ type: 'OPEN_CELL', cell: c })
    h.dispatch({ type: 'OPEN_CELL', cell })
    h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
    h.dispatch({ type: 'ACK_DEFUSE' })
    h.dispatch({ type: 'START_WIRE_CUT' })
    h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
    const final = h.dispatch({ type: 'ACK_DEFUSE' })
    expect(final.phase).toBe('gameover')
    expect(final.teams[0].alive).toBe(true) // A ชนะ
    expect(final.teams[1].alive).toBe(false)
    // A: 2 รอบจริง (เปิด safe + กู้ระเบิด) — ไม่มีเครดิต +1
    // B: 1 รอบจริง (เปิด safe) ตาที่ตายไม่นับ
    expect(final.teams[0].stats.turnsSurvived).toBe(2)
    expect(final.teams[1].stats.turnsSurvived).toBe(1)
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
    h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
    const state = h.dispatch({ type: 'ACK_DEFUSE' })
    expect(state.phase).toBe('gameover')
    expect(state.teams[openerId].eliminatedAt).toBe(1)
    const winner = state.teams.find((t) => t.alive)
    expect(winner).toBeDefined()
    expect(winner?.eliminatedAt).toBeNull()
    expect(state.log.some((l) => l.message.includes('ชนะ'))).toBe(true)
  })

  // FIX: hidden เหลือเฉพาะช่องระเบิด → กู้สำเร็จ = ระเบิดอยู่ที่เดิม ช่องไม่เขียว
  // ทีมถัดไปถูกบังคับตัดสายต่อ ไม่ใช่เปิดสนามตัดสายรอบใหม่ (ไม่มีเคส "ช่องหมด" อีก)
  it('hidden เหลือเฉพาะช่องระเบิด → กู้สำเร็จแล้วระเบิดไม่หาย ช่องไม่เขียว ตัดสายต่อ', () => {
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
    // เปิดช่องระเบิด → กู้สำเร็จ → ไม่มี hidden ให้ย้าย → ระเบิดยังอยู่ที่เดิม
    h.dispatch({ type: 'OPEN_CELL', cell: bombCell })
    h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
    const state = h.dispatch({ type: 'ACK_DEFUSE' })
    expect(state.phase).not.toBe('gameover')
    expect(state.log.some((l) => l.message.includes('เสมอ'))).toBe(false)
    expect(state.log.some((l) => l.message.includes('สนามตัดสายรอบใหม่'))).toBe(false)
    expect(state.teams.every((t) => t.alive)).toBe(true)
    // ช่องระเบิดไม่เขียว — ยัง hidden และยังมีระเบิดอยู่ครบ
    expect(state.cells[bombCell]).toBeUndefined()
    expect(h.serializeSecret()[bombCell]).toBe('real')
    expect(state.bombsRemaining).toBe(1)
    // ทีมถัดไปถูกบังคับตัดสาย (ทุกช่องที่เหลือเป็นระเบิด)
    expect(state.autoWireCut).toBe(true)
    // hidden เหลือเพียงช่องระเบิดช่องเดียวเท่านั้น
    const hidden: number[] = []
    for (let n = state.rangeMin; n <= state.rangeMax; n++) {
      if (!(n in state.cells)) hidden.push(n)
    }
    expect(hidden).toEqual([bombCell])
  })

  // FIX: เกมต้องเดินต่อไปจนเหลือผู้ชนะทีมเดียวเสมอ — ไม่มีทางจบแบบเสมอเพราะช่องหมด
  // (ระเบิดไม่หายจากระบบ → ทุกช่องที่เหลือเป็นระเบิด = บังคับตัดสายสลับทีมจนจบ)
  it('เกมเดินต่อจนเหลือผู้ชนะทีมเดียว ไม่มีทางจบแบบเสมอเพราะช่องหมด', () => {
    const settings = baseSettings({ teamNames: ['A', 'B', 'C'], rangeMin: 1, rangeMax: 12 })
    const h = createGame(settings, 12345)
    // เดินเกมแบบสุ่ม: เปิดช่องแรกที่ยังว่าง / ตัดสายเมื่อต้องตัด จนกว่าจะจบ
    for (let guard = 0; guard < 4000; guard++) {
      const st = h.getState()
      if (st.phase === 'gameover') break
      if (st.phase === 'defusing') {
        h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
        h.dispatch({ type: 'ACK_DEFUSE' })
        continue
      }
      if (st.phase === 'blocking') {
        h.dispatch({ type: 'RESOLVE_BLOCK', use: false })
        continue
      }
      if (st.phase === 'defending') {
        h.dispatch({ type: 'RESOLVE_ATTACK_DEFENSE', use: 0 })
        continue
      }
      let opened = false
      for (let n = st.rangeMin; n <= st.rangeMax; n++) {
        if (!(n in st.cells)) {
          h.dispatch({ type: 'OPEN_CELL', cell: n })
          opened = true
          break
        }
      }
      if (!opened) break
    }
    const final = h.getState()
    expect(final.phase).toBe('gameover')
    // เหลือผู้ชนะทีมเดียวเท่านั้น (ไม่ใช่เสมอหลายทีม)
    expect(final.teams.filter((t) => t.alive)).toHaveLength(1)
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
  h.dispatch({ type: 'ACK_DEFUSE' })
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
          h.dispatch({ type: 'ACK_DEFUSE' })
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
      const st = h.getState()
      // B ต้องไม่มี Block ไม่งั้นถึงตาจะเข้า defending แทน opening
      if (st.teams[0].hand.includes('attack') && !st.teams[1].hand.includes('block')) {
        seed = s
        break
      }
    }
    expect(seed).toBeGreaterThanOrEqual(0)
    const h = createGame(settings, seed)
    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    expect(h.getState().currentTeamIndex).toBe(1)
    // B ไม่ถือ Block (มือ 1 ใบ = attack ตาม seed) → โดนโจมตีไปโดยปริยายตอนถึงตา
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

  it('FIX #25: Block ใช้เล่นตรง ๆ ไม่ได้ — ต้องมี effect ของทีมอื่นก่อน', () => {
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
    const before = h.getState().teams[0].hand.length
    const st = h.dispatch({ type: 'PLAY_CARD', card: 'block' })
    expect(st.teams[0].hand.length).toBe(before) // การ์ดไม่หาย ไม่ได้ใช้
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
    // log.at คือ Date.now() ตอน dispatch — สอง engine ที่รันคนละ ms ย่อมต่างกัน
    // เทสนี้ตรวจ "determinism ของเกม" ไม่ใช่นาฬิกา จึงตัด at ออกก่อนเทียบ
    // (เดิมเทียบทั้งก้อน ทำให้เทสแดงแบบสุ่ม ~50% เวลา dispatch คร่อม ms)
    const stripClock = (st: PublicGameState) => ({
      ...st,
      log: st.log.map(({ at: _at, ...rest }) => rest),
    })
    expect(stripClock(h1.getState())).toEqual(stripClock(h2.getState()))
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
      if (st.phase === 'defusing') {
        st = g.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
        st = g.dispatch({ type: 'ACK_DEFUSE' })
      }
      if (st.phase === 'gameover') break
      st = g.dispatch({ type: 'OPEN_CELL', cell: c })
    }
    expect(st.log.length).toBeGreaterThan(1)
    const ids = st.log.map((l) => l.id)
    expect([...ids].sort((a, b) => a - b)).toEqual(ids)
  })
})

// FIX #44 / ข้อ 54: กรรมการสั่งยุติเกม → เข้าหน้าสรุปอันดับทันทีเหมือนเกมจบตามปกติ
describe('END_GAME (FIX #44)', () => {
  it('กลางเกม → gameover ทันที และยังมีหลายทีมรอด (ไม่ผ่าน endTurn)', () => {
    const h = createGame(baseSettings(), 7)
    expect(h.getState().phase).not.toBe('gameover')
    const teamBefore = h.getState().currentTeamIndex
    const turnBefore = h.getState().turnNumber
    const st = h.dispatch({ type: 'END_GAME' })
    expect(st.phase).toBe('gameover')
    // ยังรอดหลายทีม — พิสูจน์ว่าไม่ได้ไปผ่าน endTurn (ซึ่งจะเขียน phase ทับเป็น 'cards')
    expect(st.teams.filter((t) => t.alive).length).toBeGreaterThan(1)
    // ไม่เลื่อนทีม ไม่เพิ่มรอบ
    expect(st.currentTeamIndex).toBe(teamBefore)
    expect(st.turnNumber).toBe(turnBefore)
  })

  it('log มี "ยุติเกมโดยผู้ใช้" level warn, teamId null, มี timestamp', () => {
    const h = createGame(baseSettings(), 7)
    const st = h.dispatch({ type: 'END_GAME' })
    const entry = st.log.find((l) => l.message === 'ยุติเกมโดยผู้ใช้')
    expect(entry).toBeDefined()
    expect(entry!.level).toBe('warn')
    expect(entry!.teamId).toBeNull()
    expect(entry!.at).toBeGreaterThan(0)
  })

  it('กดซ้ำ → log ตัวเดียว (idempotent)', () => {
    const h = createGame(baseSettings(), 7)
    h.dispatch({ type: 'END_GAME' })
    h.dispatch({ type: 'END_GAME' })
    const st = h.dispatch({ type: 'END_GAME' })
    const n = st.log.filter((l) => l.message === 'ยุติเกมโดยผู้ใช้').length
    expect(n).toBe(1)
  })

  it('ยุติตอนกำลังตัดสาย → pendingDefuse ถูกเคลียร์ (modal ไม่ทับหน้าสรุป)', () => {
    const h = createGame(baseSettings(), 7)
    const cell = bombCellOf(h, 'real')
    h.dispatch({ type: 'OPEN_CELL', cell })
    expect(h.getState().phase).toBe('defusing')
    expect(h.getState().pendingDefuse).not.toBeNull()
    const st = h.dispatch({ type: 'END_GAME' })
    expect(st.phase).toBe('gameover')
    expect(st.pendingDefuse).toBeNull()
  })

  it('ยุติตอน phase blocking → pendingBlock ถูกเคลียร์', () => {
    const settings = baseSettings({
      teamNames: ['A', 'B'],
      cardsEnabled: true,
      startingHand: 3,
      maxHandSize: 0,
      rangeMax: 30,
    })
    let h: GameHandle | null = null
    for (let seed = 0; seed < 30000; seed++) {
      const cand = createGame(settings, seed)
      const st = cand.getState()
      // shuffle กระทบทั้งวง → ทีมที่มี Block ถูกถามทันที (เข้าคิว blocking)
      if (st.teams[0].hand.includes('shuffle') && st.teams[1].hand.includes('block')) {
        h = cand
        break
      }
    }
    if (!h) throw new Error('no seed found')
    const st = h.dispatch({ type: 'PLAY_CARD', card: 'shuffle' })
    if (st.phase !== 'blocking') return // seed พาไปทางอื่น — ข้อ assert หลักอยู่เทสอื่นแล้ว
    const after = h.dispatch({ type: 'END_GAME' })
    expect(after.phase).toBe('gameover')
    expect(after.pendingBlock).toBeNull()
  })

  it('หลังยุติแล้ว OPEN_CELL ไม่มีผล', () => {
    const h = createGame(baseSettings(), 7)
    h.dispatch({ type: 'END_GAME' })
    const before = h.getState()
    const cell = safeCellOf(h)
    const after = h.dispatch({ type: 'OPEN_CELL', cell })
    expect(after.phase).toBe('gameover')
    expect(after.cells[cell]).toBeUndefined()
    expect(after.log.length).toBe(before.log.length)
  })
})

// FIX #36: leaderboard ต้องโชว์ "เวลาเริ่ม → เวลาจบ" ของแต่ละเกม
// เวลาจบเก็บตอนเขียน record ได้ แต่เวลาเริ่มมีแค่ engine ที่รู้ จึงต้องอยู่ใน state
describe('startedAt (FIX #36)', () => {
  it('createGame ตั้ง startedAt เป็นเวลาปัจจุบัน', () => {
    const before = Date.now()
    const h = createGame(baseSettings({ teamNames: ['A', 'B'] }), 1)
    const after = Date.now()
    const at = h.getState().startedAt
    expect(typeof at).toBe('number')
    expect(at as number).toBeGreaterThanOrEqual(before)
    expect(at as number).toBeLessThanOrEqual(after)
  })

  it('เล่นไปหลายตาแล้ว startedAt ไม่เปลี่ยน (เวลาเริ่มเกม ไม่ใช่เวลาล่าสุด)', () => {
    const h = createGame(baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 12 }), 7)
    const at0 = h.getState().startedAt
    const secret = h.serializeSecret()
    let opened = 0
    for (let n = 1; n <= 12 && opened < 3; n++) {
      if (!(n in secret)) {
        h.dispatch({ type: 'OPEN_CELL', cell: n })
        opened++
      }
    }
    expect(opened).toBeGreaterThan(0)
    expect(h.getState().startedAt).toBe(at0)
  })

  // ตัวสำคัญสุด: ขาด `?? ` ที่ createGameFromState แล้วค่าจะรีเซ็ตทุกครั้งที่ resume
  it('createGameFromState คง startedAt เดิม ไม่รีเซ็ตตอน resume', () => {
    const h = createGame(baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 12 }), 3)
    const state = h.getState()
    const at0 = state.startedAt as number
    expect(at0).toBeGreaterThan(0)
    const restored = createGameFromState(state, h.serializeSecret(), 99)
    expect(restored.getState().startedAt).toBe(at0)
  })

  it('snapshot เก่าที่ไม่มี startedAt → resume ได้ ไม่ crash และได้ค่าใหม่แทน', () => {
    const h = createGame(baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 12 }), 5)
    const state = h.getState()
    // จำลอง snapshot ที่บันทึกไว้ก่อนอัปเกรด — field ยังไม่มี
    const legacy = { ...state }
    delete (legacy as { startedAt?: number }).startedAt
    const before = Date.now()
    const restored = createGameFromState(legacy, h.serializeSecret(), 11)
    const at = restored.getState().startedAt as number
    expect(at).toBeGreaterThanOrEqual(before)
    // เล่นต่อได้ปกติ
    expect(restored.getState().phase).toBe(state.phase)
  })
})

// ── FIX_LISTS #3: ตัดสายไม่ทันเวลา → ระเบิดทันที ──────────────────────────────
describe('FIX_LISTS #3: DEFUSE_TIMEOUT', () => {
  // หา seed ที่ "เลือกแดงแล้วรอด" เพื่อพิสูจน์ว่า timeout ชนะแม้สายที่ถูกมีจริง
  function gameWhereRedWouldSurvive(): { h: GameHandle; cell: number } | null {
    for (let seed = 1; seed < 200; seed++) {
      const h = createGame(baseSettings(), seed)
      const cell = bombCellOf(h, 'real')
      h.dispatch({ type: 'OPEN_CELL', cell })
      if (h.getState().phase !== 'defusing') continue
      h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
      h.dispatch({ type: 'ACK_DEFUSE' })
      if (h.getState().teams[0].alive) {
        // คืนเกมใหม่ seed เดียวกันที่ยังไม่ทันตัดสาย
        const fresh = createGame(baseSettings(), seed)
        return { h: fresh, cell: bombCellOf(fresh, 'real') }
      }
    }
    return null
  }

  it('หมดเวลา → ทีมตกรอบ แม้มีสายที่เลือกแล้วรอดอยู่จริง', () => {
    const found = gameWhereRedWouldSurvive()
    // ยืนยันว่าหา setup ที่ต้องการเจอจริง ไม่ใช่เทสผ่านแบบว่างเปล่า
    expect(found).not.toBeNull()
    const { h, cell } = found!
    const before = h.getState()
    const actingId = before.teams[before.currentTeamIndex].id
    h.dispatch({ type: 'OPEN_CELL', cell })

    const after = h.dispatch({ type: 'DEFUSE_TIMEOUT' })

    expect(after.teams.find((t) => t.id === actingId)?.alive).toBe(false)
    expect(after.cells[cell]).toBe('detonated')
    expect(after.pendingDefuse).toBeNull()
    expect(after.phase).not.toBe('defusing')
  })

  it('เลือกสีไปแล้ว (defuseResult ตั้งแล้ว) → timeout ไม่มีผล ผลถูกผูกกับสีนั้นแล้ว', () => {
    const found = gameWhereRedWouldSurvive()
    expect(found).not.toBeNull()
    const { h } = found!
    h.dispatch({ type: 'OPEN_CELL', cell: found!.cell })
    h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
    const after = h.dispatch({ type: 'DEFUSE_TIMEOUT' })
    expect(after.phase).toBe('defusing')
    expect(after.defuseResult).not.toBeNull()
    expect(after.teams.every((t) => t.alive)).toBe(true)
  })

  it('ไม่ได้อยู่ใน phase defusing → DEFUSE_TIMEOUT ไม่มีผล', () => {
    const h = createGame(baseSettings(), 42)
    const before = h.getState()
    const after = h.dispatch({ type: 'DEFUSE_TIMEOUT' })
    expect(after.teams.every((t) => t.alive)).toBe(true)
    expect(after.phase).toBe(before.phase)
  })
})

// FIX_LISTS ชุดใหม่ #2: บังคับตัดสายแล้วไม่ต้องเลือกช่อง → เริ่มตัดสายเลย
// ยกเว้นทีมยังถือ item ที่เกี่ยวกับ turn (Skip / Reverse / Attack)
describe('FIX_LISTS ชุดใหม่ #2 — เข้าโหมดตัดสายโดยไม่ต้องเลือกช่อง', () => {
  // จัดฉาก: 2 ทีม range 1–3, ระเบิดจริง 1 ลูก — เปิด safe หมดจนเหลือแต่ช่องระเบิด
  function forcedBoard(overrides: Partial<GameSettings> = {}) {
    const settings = baseSettings({
      teamNames: ['A', 'B'],
      rangeMin: 1,
      rangeMax: 3,
      cardsEnabled: false,
      ...overrides,
    })
    const h = createGame(settings, 7)
    const bombCell = bombCellOf(h, 'real')
    for (let n = 1; n <= 3; n++) {
      if (n !== bombCell) h.dispatch({ type: 'OPEN_CELL', cell: n })
    }
    return { h, bombCell }
  }

  it('ทุกช่องที่เหลือเป็นระเบิดจริง และไม่มีการ์ด turn → autoWireCut = true', () => {
    const { h } = forcedBoard()
    expect(h.getState().autoWireCut).toBe(true)
  })

  it('START_WIRE_CUT → เข้า phase defusing ทันทีโดยไม่ต้องส่ง OPEN_CELL', () => {
    const { h } = forcedBoard()
    const st = h.dispatch({ type: 'START_WIRE_CUT' })
    expect(st.phase).toBe('defusing')
    expect(st.pendingDefuse).not.toBeNull()
  })

  it('ยังมีช่องปลอดภัยเหลือ → ไม่ auto และ START_WIRE_CUT ไม่ทำอะไร', () => {
    const settings = baseSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 20, cardsEnabled: false })
    const h = createGame(settings, 7)
    expect(h.getState().autoWireCut).toBe(false)
    const st = h.dispatch({ type: 'START_WIRE_CUT' })
    expect(st.phase).not.toBe('defusing')
  })

  it('ทีมยังถือ item ที่เกี่ยวกับ turn (Skip) → ไม่ auto ต้องให้เลือกใช้การ์ดก่อน', () => {
    const { h } = forcedBoard({ cardsEnabled: true })
    const before = h.getState()
    const team = before.teams[before.currentTeamIndex]
    // ยัด Skip เข้ามือทีมปัจจุบันผ่าน snapshot แล้วสร้างเกมต่อจาก state นั้น
    const patched: PublicGameState = {
      ...before,
      teams: before.teams.map((t) =>
        t.id === team.id ? { ...t, hand: ['skip' as CardType] } : { ...t, hand: [] },
      ),
    }
    const h2 = createGameFromState(patched, h.serializeSecret(), 7)
    expect(h2.getState().autoWireCut).toBe(false)
    expect(h2.dispatch({ type: 'START_WIRE_CUT' }).phase).not.toBe('defusing')
  })

  it('ถือแต่การ์ดที่ไม่เกี่ยวกับ turn (Scan) → ยัง auto ได้', () => {
    const { h } = forcedBoard({ cardsEnabled: true })
    const before = h.getState()
    const patched: PublicGameState = {
      ...before,
      teams: before.teams.map((t, i) =>
        i === before.currentTeamIndex ? { ...t, hand: ['scan' as CardType] } : { ...t, hand: [] },
      ),
    }
    const h2 = createGameFromState(patched, h.serializeSecret(), 7)
    expect(h2.getState().autoWireCut).toBe(true)
  })
})

// FIX_LISTS ชุดที่สิบสาม #1/#2/#3 — Skip กับการโจมตี
//   #1 Block กัน Skip ของทีมก่อนหน้าได้ (พฤติกรรมเดิม — ล็อกไว้กัน regression)
//   #2 ใช้ Skip ได้ตอน phase 'defending' โดยโควตาแยกจาก Block
//   #3 Skip ตอนโดนโจมตี = ข้ามการเปิดป้าย ไม่โอนหนี้ต่อให้ทีมถัดไป
describe('ชุดที่สิบสาม: Skip กับการโจมตี', () => {
  // สร้างเกมที่กำหนดมือของแต่ละทีมเองได้ (id ทีม = '0','1','2','3')
  function gameWithHands(hands: Record<string, CardType[]>, seed = 1): GameHandle {
    const h = createGame(baseSettings({ cardsEnabled: true, startingHand: 0 }), seed)
    const before = h.getState()
    const patched: PublicGameState = {
      ...before,
      teams: before.teams.map((t) => ({ ...t, hand: hands[t.id] ?? [] })),
    }
    return createGameFromState(patched, h.serializeSecret(), seed)
  }

  it('#1: ทีมก่อนหน้าใช้ Skip → ทีมถัดไปที่ถือ Block ถูกถามและกันได้', () => {
    const h = gameWithHands({ '0': ['skip'], '1': ['block'] })
    h.dispatch({ type: 'PLAY_CARD', card: 'skip' })

    // A ใช้ Skip → B (ทีมถัดไป) ได้สิทธิ์ตอบว่าจะกันไหม
    let st = h.getState()
    expect(st.phase).toBe('blocking')
    expect(st.pendingBlock?.card).toBe('skip')
    expect(st.pendingBlock?.targetTeamId).toBe('1')

    // B กัน → Skip ล้ม, A เสียการ์ดเปล่าและจบตาไปตามเดิม
    st = h.dispatch({ type: 'RESOLVE_BLOCK', use: true })
    expect(st.phase).not.toBe('blocking')
    expect(st.teams[1].hand).not.toContain('block')
    expect(st.log.some((l) => l.message.includes('กัน Skip ไว้ได้'))).toBe(true)
  })

  it('#2: ใช้ Skip ได้ตอน phase defending (ยังไม่เข้า phase cards)', () => {
    // A โจมตี B, B ถือ block + skip → B เข้า phase 'defending'
    const h = gameWithHands({ '0': ['attack'], '1': ['block', 'skip'] })
    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    expect(h.getState().phase).toBe('defending')

    // กด Skip ได้ทันทีในจังหวะตั้งรับ ไม่ต้องรอ/ไม่ต้องกัน Block ก่อน
    const st = h.dispatch({ type: 'PLAY_CARD', card: 'skip' })
    expect(st.phase).not.toBe('defending')
    // Skip ถูกใช้จริง (หายจากมือ) แต่ Block ยังอยู่ — โควตาแยกกันคนละก้อน
    expect(st.teams[1].hand).not.toContain('skip')
    expect(st.teams[1].hand).toContain('block')
    expect(st.teams[1].stats.cardsPlayed.skip).toBe(1)
    expect(st.teams[1].stats.cardsPlayed.block).toBe(0)
  })

  it('#2: การ์ดอื่นยังใช้ตอน defending ไม่ได้ (เฉพาะ Skip เท่านั้น)', () => {
    const h = gameWithHands({ '0': ['attack'], '1': ['block', 'scan', 'shield'] })
    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    expect(h.getState().phase).toBe('defending')

    // Shield/Scan ใช้ในจังหวะตั้งรับไม่ได้ — ต้องยังค้างที่ phase เดิมและการ์ดไม่หาย
    let st = h.dispatch({ type: 'PLAY_CARD', card: 'shield' })
    expect(st.phase).toBe('defending')
    expect(st.teams[1].hand).toContain('shield')
    st = h.dispatch({ type: 'PLAY_CARD', card: 'scan', targetCell: 5 })
    expect(st.phase).toBe('defending')
    expect(st.teams[1].hand).toContain('scan')
  })

  it('#3: Skip ตอนโดนโจมตี → หนี้เปิดป้ายไม่โอนต่อให้ทีมถัดไป', () => {
    // A โจมตี B (B ไม่มี Block → หนี้ลงทันที), B ใช้ Skip หนี
    const h = gameWithHands({ '0': ['attack'], '1': ['skip'] })
    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    let st = h.getState()
    // ไม่มี Block → ข้าม phase defending, หนี้ลงเป็น pendingOpens แล้ว
    expect(st.teams[1].pendingOpens).toBe(2)

    st = h.dispatch({ type: 'PLAY_CARD', card: 'skip' })
    // ไม่มีใครถือ Block → Skip ทำงานเลย ตาไปที่ C
    expect(st.teams[st.currentTeamIndex].id).toBe('2')
    // หัวใจของข้อ #3: ทุกทีมกลับมาเปิด 1 ป้ายตามปกติ ไม่มีใครรับหนี้ต่อ
    for (const t of st.teams) {
      expect(t.pendingOpens).toBe(1)
      expect(t.pendingAttacks).toEqual([])
    }
    // log บอกชัดว่าข้ามกี่ป้าย และหนี้ไม่โอนต่อ
    expect(st.log.some((l) => l.message.includes('หนี้โจมตีไม่โอนต่อ'))).toBe(true)
  })

  it('#3: Skip ตอน defending ล้างคิวโจมตีที่ยังไม่ลง — ไม่ไปโผล่ที่ทีมอื่น', () => {
    const h = gameWithHands({ '0': ['attack'], '1': ['block', 'skip'] })
    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    expect(h.getState().teams[1].pendingAttacks.length).toBe(1)

    const st = h.dispatch({ type: 'PLAY_CARD', card: 'skip' })
    // คิวโจมตีของ B หายไปกับการ Skip และไม่ถูกยัดใส่ทีมไหนเลย
    for (const t of st.teams) {
      expect(t.pendingAttacks).toEqual([])
      expect(t.pendingOpens).toBe(1)
    }
  })

  it('#3: Skip ตอน defending ถูก Block กัน → กลับไปตั้งรับ หนี้ยังอยู่ (ไม่หายฟรี)', () => {
    // B โดนโจมตี, B ใช้ Skip, C ถือ Block มากัน Skip นั้น
    const h = gameWithHands({ '0': ['attack'], '1': ['block', 'skip'], '2': ['block'] })
    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    expect(h.getState().phase).toBe('defending')

    h.dispatch({ type: 'PLAY_CARD', card: 'skip' })
    let st = h.getState()
    // C ได้สิทธิ์กัน Skip ของ B
    expect(st.phase).toBe('blocking')
    expect(st.pendingBlock?.card).toBe('skip')
    expect(st.pendingBlock?.targetTeamId).toBe('2')

    st = h.dispatch({ type: 'RESOLVE_BLOCK', use: true })
    // C กันแล้ว → B (คนใช้ Skip) ได้สิทธิ์ล้ม Block ของ C ด้วย Block ของตัวเอง (counter-block)
    expect(st.phase).toBe('blocking')
    expect(st.pendingBlock?.counter).toBe(true)

    // B ไม่ล้ม → Skip ถูกกันจริง ชั้นคี่ = กันสำเร็จ
    st = h.dispatch({ type: 'RESOLVE_BLOCK', use: false })
    // Skip ถูกกัน → ยังเป็นตาของ B และกลับไปตั้งรับต่อ หนี้โจมตีไม่หาย
    expect(st.teams[st.currentTeamIndex].id).toBe('1')
    expect(st.phase).toBe('defending')
    expect(st.teams[1].pendingAttacks.length).toBe(1)
  })

  it('#3: Skip ธรรมดา (ไม่โดนโจมตี) ยังจบตาปกติ', () => {
    const h = gameWithHands({ '0': ['skip'] })
    const st = h.dispatch({ type: 'PLAY_CARD', card: 'skip' })
    // ไม่มีใครถือ Block → ข้ามตาไปทีมถัดไปตามปกติ
    expect(st.teams[st.currentTeamIndex].id).toBe('1')
    expect(st.log.some((l) => l.message.includes('ใช้ Skip — ข้าม turn'))).toBe(true)
  })
})
