import { describe, expect, it } from 'bun:test'
import { CARD_META } from './cards'
import { createGame, type GameHandle } from './engine'
import type { BombKind, CardType, GameSettings } from './types'

function cardSettings(overrides: Partial<GameSettings> = {}): GameSettings {
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
    cardsEnabled: true,
    maxHandSize: 5,
    startingHand: 1,
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

function countHidden(s: { rangeMin: number; rangeMax: number; cells: Record<number, unknown> }): number {
  let n = 0
  for (let i = s.rangeMin; i <= s.rangeMax; i++) if (!(i in s.cells)) n++
  return n
}

function findSeed(settings: GameSettings, pred: (h: GameHandle) => boolean, maxSeed = 30000): number {
  for (let seed = 0; seed < maxSeed; seed++) {
    const h = createGame(settings, seed)
    if (pred(h)) return seed
  }
  throw new Error('no seed found')
}

function drawUntil(
  h: GameHandle,
  teamId: string,
  pred: (hand: CardType[]) => boolean,
  maxDraws = 8,
): boolean {
  const maxHand = h.getState().settings.maxHandSize
  for (let i = 0; i < maxDraws; i++) {
    const hand = h.getState().teams[Number(teamId)].hand
    if (pred(hand)) return true
    if (hand.length >= maxHand) return false
    h.dispatch({ type: 'DRAW_CARD', teamId })
  }
  return pred(h.getState().teams[Number(teamId)].hand)
}

function openSafeCell(h: GameHandle): void {
  const secret = secretMap(h)
  const state = h.getState()
  for (let n = state.rangeMin; n <= state.rangeMax; n++) {
    if (!(n in secret) && !(n in state.cells)) {
      h.dispatch({ type: 'OPEN_CELL', cell: n })
      return
    }
  }
  throw new Error('no safe cell')
}

// จบ turn ของทีมปัจจุบันโดยเปิด safe จนครบ pendingOpens
// หาช่องที่เป็นระเบิดชนิดที่ต้องการ (อ่านจาก secret — ใช้ได้เฉพาะในเทส)
function bombCellOf(h: GameHandle, kind: BombKind): number {
  const secret = secretMap(h)
  const state = h.getState()
  for (const [n, k] of Object.entries(secret)) {
    if (k === kind && !(Number(n) in state.cells)) return Number(n)
  }
  throw new Error(`ไม่มีระเบิดชนิด ${kind}`)
}

function endCurrentTurn(h: GameHandle): void {
  const s = h.getState()
  const turn = s.turnNumber
  while (h.getState().turnNumber === turn && h.getState().phase !== 'gameover') {
    openSafeCell(h)
  }
}

describe('CARD_META', () => {
  it('ทุก card มี name ตามรูปแบบและ emoji ยาว ≥ 1', () => {
    const types: CardType[] = ['scan', 'skip', 'block', 'reverse', 'shuffle', 'attack']
    for (const t of types) {
      const meta = CARD_META[t]
      expect(meta.name).toMatch(/^[A-Z][a-z]+$/)
      expect(meta.emoji.length).toBeGreaterThanOrEqual(1)
      expect(meta.th.length).toBeGreaterThan(0)
    }
  })
})

describe('card draw', () => {
  it('เริ่มเกมทุกทีมได้ 1 ใบสุ่ม (เมื่อตั้ง startingHand = 1)', () => {
    const h = createGame(cardSettings({ startingHand: 1 }), 9)
    for (const t of h.getState().teams) expect(t.hand).toHaveLength(1)
  })

  it('จั่วการ์ดอัตโนมัติเมื่อรอดจบ turn', () => {
    const settings = cardSettings({ teamNames: ['A', 'B', 'C', 'D'] })
    const h = createGame(settings, 3)
    const before = h.getState().teams[0].hand.length
    openSafeCell(h)
    expect(h.getState().teams[0].hand.length).toBe(before + 1)
  })

  it('glitch → จบ turn และไม่ได้จั่วการ์ด', () => {
    const settings = cardSettings({
      glitchEnabled: true,
      glitchRatio: 0.5,
      rangeMin: 1,
      rangeMax: 30,
    })
    const seed = findSeed(settings, (h) => Object.values(secretMap(h)).includes('glitch'))
    const h = createGame(settings, seed)
    const before = h.getState().teams[0].hand.length
    const glitchPos = Number(
      Object.entries(secretMap(h)).find(([, k]) => k === 'glitch')![0],
    )
    h.dispatch({ type: 'OPEN_CELL', cell: glitchPos })
    const s = h.getState()
    expect(s.teams[0].glitchTurnsLeft).toBe(2)
    expect(s.teams[0].hand.length).toBe(before) // ไม่จั่ว
    expect(s.currentTeamIndex).toBe(1)
  })

  it('มือเต็ม maxHandSize → จั่วไม่เข้า', () => {
    const settings = cardSettings({ teamNames: ['A', 'B', 'C', 'D'], maxHandSize: 5 })
    const h = createGame(settings, 5)
    for (let i = 0; i < 10; i++) {
      h.dispatch({ type: 'DRAW_CARD', teamId: '0' })
      if (h.getState().teams[0].hand.length >= 5) break
    }
    expect(h.getState().teams[0].hand.length).toBe(5)
    h.dispatch({ type: 'DRAW_CARD', teamId: '0' })
    expect(h.getState().teams[0].hand.length).toBe(5)
  })
})

describe('Scan', () => {
  it('ตอบแค่มี/ไม่มี และนับที่ขอบ range ไม่ index หลุด', () => {
    const settings = cardSettings()
    const seed = findSeed(settings, (h) => h.getState().teams[0].hand.includes('scan'))
    const h = createGame(settings, seed)
    // ขอบล่าง
    h.dispatch({ type: 'PLAY_CARD', card: 'scan', targetCell: 1 })
    const r = h.getState().lastCardResult
    expect(r?.card).toBe('scan')
    if (r && r.card === 'scan') {
      expect(typeof r.found).toBe('boolean')
    }
  })

  it('scan ที่ขอบบนก็ทำงาน (targetCell = rangeMax)', () => {
    const settings = cardSettings()
    const seed = findSeed(settings, (h) => h.getState().teams[0].hand.includes('scan'))
    const h = createGame(settings, seed)
    h.dispatch({ type: 'PLAY_CARD', card: 'scan', targetCell: 20 })
    const r = h.getState().lastCardResult
    expect(r?.card).toBe('scan')
    if (r && r.card === 'scan') {
      expect(typeof r.found).toBe('boolean')
    }
  })

  it('ผลตรงกับความเป็นจริง (เช็คจาก secret) และนับ glitch bomb ด้วย', () => {
    const settings = cardSettings({ glitchEnabled: true, glitchRatio: 0.5 })
    const seed = findSeed(
      settings,
      (h) =>
        h.getState().teams[0].hand.includes('scan') &&
        Object.values(secretMap(h)).includes('glitch'),
    )
    const h = createGame(settings, seed)
    const secret = secretMap(h)
    const glitchPos = Number(Object.entries(secret).find(([, k]) => k === 'glitch')![0])
    const radius = settings.scanRadius
    const lo = Math.max(1, glitchPos - radius)
    const hi = Math.min(20, glitchPos + radius)
    // ตรวจว่ามี glitch อยู่ในช่วงจริง (ต้องมีตัวมันเองเสมอ)
    h.dispatch({ type: 'PLAY_CARD', card: 'scan', targetCell: glitchPos })
    const r = h.getState().lastCardResult
    expect(r?.card).toBe('scan')
    if (r && r.card === 'scan') {
      expect(r.found).toBe(true)
    }
    void lo
    void hi
  })
})

describe('Skip', () => {
  it('จบ turn ทันที และไม่ได้จั่วการ์ด', () => {
    const settings = cardSettings({ teamNames: ['A', 'B', 'C', 'D'] })
    const seed = findSeed(settings, (h) => h.getState().teams[0].hand.includes('skip'))
    const h = createGame(settings, seed)
    const before = h.getState().teams[0].hand.length
    h.dispatch({ type: 'PLAY_CARD', card: 'skip' })
    const s = h.getState()
    expect(s.currentTeamIndex).toBe(1)
    expect(s.teams[0].hand.length).toBe(before - 1) // หัก skip แล้ว ไม่จั่วเพิ่ม
    expect(s.phase).toBe('cards')
  })
})

describe('Shield / Block (FIX #24, #25)', () => {
  it('Shield → กันระเบิดจริง 1 ครั้ง ไม่ต้องตัดสาย ระเบิดย้ายไปช่องอื่น', () => {
    const settings = cardSettings()
    const seed = findSeed(settings, (h) => h.getState().teams[0].hand.includes('shield'))
    const h = createGame(settings, seed)

    h.dispatch({ type: 'PLAY_CARD', card: 'shield' })
    expect(h.getState().teams[0].shieldCharges).toBe(1)

    // เปิดช่องที่เป็นระเบิดจริง → ต้องรอดทันที ไม่เข้า phase defusing
    const cell = bombCellOf(h, 'real')
    const before = h.getState().bombsRemaining
    const st = h.dispatch({ type: 'OPEN_CELL', cell })
    expect(st.phase).not.toBe('defusing')
    expect(st.teams[0].alive).toBe(true)
    expect(st.teams[0].shieldCharges).toBe(0)
    expect(st.cells[cell]).toBe('defused')
    // ระเบิดย้ายไปช่องอื่น ไม่หายจากระบบ
    expect(st.bombsRemaining).toBe(before)
  })

  it('Block ใช้เล่นตรง ๆ ไม่ได้ — ต้องมี effect ของทีมอื่นก่อน (การ์ดต้องอยู่มือ)', () => {
    const settings = cardSettings()
    const seed = findSeed(settings, (h) => h.getState().teams[0].hand.includes('block'))
    const h = createGame(settings, seed)
    const before = h.getState().teams[0].hand.length

    const st = h.dispatch({ type: 'PLAY_CARD', card: 'block' })
    expect(st.teams[0].hand.length).toBe(before) // การ์ดไม่หาย
    expect(st.phase).not.toBe('blocking') // ไม่เปิด phase ถาม
    expect(st.teams.every((t) => t.blockedTurnsLeft === 0)).toBe(true)
  })

  it('โดน Attack ตอนถือ Block → เข้า phase defending ตอนถึงตา กัน 1 ใบ (use:1) แล้วกันได้ (การ์ดหายจากมือ)', () => {
    const settings = cardSettings({ teamNames: ['A', 'B'] })
    // A ต้องมี attack, B ต้องมี block (ถือในมือ — ไม่ต้องกางล่วงหน้า)
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return st.teams[0].hand.includes('attack') && st.teams[1].hand.includes('block')
    })
    const h = createGame(settings, seed)

    // A โจมตี B — โดนคิวไว้ก่อน ยังไม่โดนจริง ไม่มี popup ตอนนี้
    const st = h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    expect(st.phase).not.toBe('blocking')
    expect(st.teams[1].pendingAttacks).toHaveLength(1)
    expect(st.teams[1].pendingOpens).toBe(1) // ยังไม่โดน
    expect(st.currentTeamIndex).toBe(1) // ถึงตา B
    // B ถือ Block → เข้า phase defending (ใช้ได้เฉพาะ Block ก่อนใช้ item อื่น)
    expect(st.phase).toBe('defending')

    const after = h.dispatch({ type: 'RESOLVE_ATTACK_DEFENSE', use: 1 })
    expect(after.phase).toBe('cards') // เข้า phase ใช้ item ตามปกติ
    expect(after.teams[1].hand).not.toContain('block') // ใช้แล้วหายจากมือ
    expect(after.teams[1].pendingAttacks).toHaveLength(0)
    // กันได้ → B ไม่ต้องเปิดเพิ่ม
    expect(after.teams[1].pendingOpens).toBe(1)
  })

  it('โดน Attack ตอนถือ Block แต่เลือกไม่กัน (use:0) → โดนโจมตี การ์ดยังอยู่มือ', () => {
    const settings = cardSettings({ teamNames: ['A', 'B'] })
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return st.teams[0].hand.includes('attack') && st.teams[1].hand.includes('block')
    })
    const h = createGame(settings, seed)

    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    expect(h.getState().phase).toBe('defending')
    const after = h.dispatch({ type: 'RESOLVE_ATTACK_DEFENSE', use: 0 })
    expect(after.phase).toBe('cards')
    // ไม่ได้ใช้ → การ์ดยังอยู่มือ และ B ต้องเปิดเพิ่ม 1
    expect(after.teams[1].hand).toContain('block')
    expect(after.teams[1].pendingOpens).toBe(2)
  })

  it('โดน Attack 2 ใบ มี Block 2 ใบ → กันทั้งหมด (use:2) เสร็จแล้วค่อยเข้า phase ใช้ item', () => {
    const settings = cardSettings({ teamNames: ['A', 'C', 'B'], startingHand: 3 })
    // A และ C ต้องมี attack, B ต้องมี block 2 ใบ
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return (
        st.teams[0].hand.includes('attack') &&
        st.teams[1].hand.includes('attack') &&
        st.teams[2].hand.filter((c) => c === 'block').length >= 2
      )
    })
    const h = createGame(settings, seed)

    // A โจมตี B → ไปตา C
    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '2' })
    expect(h.getState().currentTeamIndex).toBe(1)
    // C โจมตี B → ถึงตา B → defending (โจมตีค้าง 2 ใบ)
    const st = h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '2' })
    expect(st.currentTeamIndex).toBe(2)
    expect(st.teams[2].pendingAttacks).toHaveLength(2)
    expect(st.phase).toBe('defending')

    // กันทั้ง 2 ใบในครั้งเดียว → จบ เข้า phase ใช้ item ปกติ ไม่ต้องเปิดเพิ่ม
    const after = h.dispatch({ type: 'RESOLVE_ATTACK_DEFENSE', use: 2 })
    expect(after.phase).toBe('cards')
    expect(after.teams[2].pendingAttacks).toHaveLength(0)
    expect(after.teams[2].hand).not.toContain('block')
    expect(after.teams[2].pendingOpens).toBe(1)
  })

  it('โดน Attack 2 ใบ มี Block 2 ใบ → กันแค่ 1 (use:1) เพื่อเก็บ Block ไว้ → โดนไป 1', () => {
    const settings = cardSettings({ teamNames: ['A', 'C', 'B'], startingHand: 3 })
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return (
        st.teams[0].hand.includes('attack') &&
        st.teams[1].hand.includes('attack') &&
        st.teams[2].hand.filter((c) => c === 'block').length >= 2
      )
    })
    const h = createGame(settings, seed)

    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '2' })
    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '2' })
    expect(h.getState().phase).toBe('defending')

    // กันแค่ 1 ใบ → อีก 1 โดนไปโดยปริยาย (เก็บ Block ไว้ 1)
    const after = h.dispatch({ type: 'RESOLVE_ATTACK_DEFENSE', use: 1 })
    expect(after.phase).toBe('cards')
    expect(after.teams[2].pendingAttacks).toHaveLength(0)
    expect(after.teams[2].hand.filter((c) => c === 'block')).toHaveLength(1)
    expect(after.teams[2].pendingOpens).toBe(2) // โดนไป 1 ครั้ง → ต้องเปิดเพิ่ม 1
  })

  it('ส่ง use เกินจำนวนโจมตี/Block → กันได้เท่าที่มี (clamp)', () => {
    const settings = cardSettings({ teamNames: ['A', 'B'] })
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return st.teams[0].hand.includes('attack') && st.teams[1].hand.includes('block')
    })
    const h = createGame(settings, seed)

    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    expect(h.getState().phase).toBe('defending')
    const after = h.dispatch({ type: 'RESOLVE_ATTACK_DEFENSE', use: 99 })
    expect(after.phase).toBe('cards')
    expect(after.teams[1].pendingAttacks).toHaveLength(0)
    expect(after.teams[1].hand).not.toContain('block')
    expect(after.teams[1].pendingOpens).toBe(1)
  })

  it('โดน Attack แต่ไม่มี Block → โดนโจมตีไปโดยปริยายตอนถึงตา (ไม่เข้า defending)', () => {
    const settings = cardSettings({ teamNames: ['A', 'B'] })
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return st.teams[0].hand.includes('attack') && !st.teams[1].hand.includes('block')
    })
    const h = createGame(settings, seed)

    const st = h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    expect(st.currentTeamIndex).toBe(1)
    expect(st.phase).toBe('cards') // ไม่มี phase แก้โจมตี
    expect(st.teams[1].pendingAttacks).toHaveLength(0)
    expect(st.teams[1].pendingOpens).toBe(2) // โดนไปแล้ว ต้องเปิดเพิ่ม 1
  })

  it('FIX #23: Attack ใส่ทีมตัวเองไม่ได้ (การ์ดไม่หาย)', () => {
    const settings = cardSettings()
    const seed = findSeed(settings, (h) => h.getState().teams[0].hand.includes('attack'))
    const h = createGame(settings, seed)
    const before = h.getState().teams[0].hand.length
    const st = h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '0' })
    expect(st.teams[0].hand.length).toBe(before)
  })

  it('FIX #22: ติด glitch → ใช้การ์ดไม่ได้ (การ์ดไม่หาย)', () => {
    const settings = cardSettings({ glitchEnabled: true, glitchRatio: 0.5 })
    const seed = findSeed(settings, (h) => h.getState().teams[0].hand.length > 0)
    const h = createGame(settings, seed)
    const cell = bombCellOf(h, 'glitch')
    h.dispatch({ type: 'OPEN_CELL', cell })
    // วนกลับมาถึงตาทีม 0 อีกครั้ง — ยังติด glitch อยู่
    while (h.getState().currentTeamIndex !== 0 && h.getState().phase !== 'gameover') {
      endCurrentTurn(h)
    }
    const st = h.getState()
    if (st.currentGlitched && st.teams[0].hand.length > 0) {
      const before = st.teams[0].hand.length
      const after = h.dispatch({ type: 'PLAY_CARD', card: st.teams[0].hand[0] })
      expect(after.teams[0].hand.length).toBe(before)
    }
  })
})
describe('Reverse', () => {
  it('เหลือ 2 ทีม → สลับทิศ + จบ turn โดยไม่ทำให้ทีมเดิมเล่นซ้ำ', () => {
    const settings = cardSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    const seed = findSeed(settings, (h) => h.getState().teams[0].hand.includes('reverse'))
    const h = createGame(settings, seed)
    expect(h.getState().direction).toBe(1)
    h.dispatch({ type: 'PLAY_CARD', card: 'reverse' })
    const s = h.getState()
    expect(s.direction).toBe(-1)
    expect(s.currentTeamIndex).toBe(1) // ไปอีกทีม ไม่กลับมาทีมเดิม
    expect(s.phase).toBe('cards')
  })
})

describe('Shuffle', () => {
  // หมายเหตุ: เทสนี้เคย assert ว่า "ตำแหน่งเดิมทุกช่องต้องว่าง" ซึ่งบังคับให้ playShuffle
  // ตัดช่องที่ระเบิดอยู่ออกจาก pool — นั่นคือต้นเหตุที่ระเบิดหายตอนช่องเหลือน้อย
  // ตอนนี้ระเบิดสุ่มลงช่อง hidden ทั้งหมดได้ (อยู่ที่เดิมก็ได้) สิ่งที่ต้องรับประกันคือ "ไม่หาย"
  it('ย้ายระเบิดไปช่อง hidden ใหม่ ครบจำนวน ไม่ทับช่องที่เปิดแล้ว', () => {
    const settings = cardSettings()
    const seed = findSeed(settings, (h) => h.getState().teams[0].hand.includes('shuffle'))
    const h = createGame(settings, seed)
    const before = secretMap(h)
    h.dispatch({ type: 'PLAY_CARD', card: 'shuffle' })
    const after = secretMap(h)
    // จำนวนระเบิดคงเดิม
    expect(Object.keys(after)).toHaveLength(Object.keys(before).length)
    // ชนิดระเบิด (real/glitch) คงเดิม
    const kindCount = (m: Record<number, BombKind>) => {
      const c: Record<string, number> = {}
      for (const k of Object.values(m)) c[k] = (c[k] ?? 0) + 1
      return c
    }
    expect(kindCount(after)).toEqual(kindCount(before))
    // ตำแหน่งใหม่ต้องเป็น hidden (ยังไม่เปิด)
    const cells = h.getState().cells
    for (const n of Object.keys(after)) {
      expect(cells[Number(n)]).toBeUndefined()
    }
    // ไม่จบ turn (ยังอยู่ช่วงใช้การ์ด)
    expect(h.getState().phase).toBe('cards')
  })

  it('ช่องเหลือน้อย → ระเบิดไม่หาย (bombsRemaining คงเดิม)', () => {
    // บอร์ดเล็ก แล้วเปิดช่องปลอดภัยทิ้งจนช่อง hidden เหลือใกล้จำนวนระเบิด
    const settings = cardSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 6 })
    const seed = findSeed(settings, (h) => h.getState().teams[0].hand.includes('shuffle'))
    const h = createGame(settings, seed)
    // เปิดช่องปลอดภัยทุกช่องที่เปิดได้ — เหลือแต่ช่องที่มีระเบิด
    const secret = secretMap(h)
    for (let n = 1; n <= 6; n++) {
      if (h.getState().phase === 'gameover') break
      if (!(n in secret) && !(n in h.getState().cells)) h.dispatch({ type: 'OPEN_CELL', cell: n })
    }
    const st = h.getState()
    if (st.phase === 'gameover') return // เกมจบก่อน (ช่องหมด) — ไม่มีอะไรให้ทดสอบ
    const bombsBefore = st.bombsRemaining
    expect(bombsBefore).toBeGreaterThan(0)
    // หา turn ที่มี shuffle ในมือแล้วเล่น (PLAY_CARD รอบเดียว ไม่ผ่าน endTurn → เทียบสะอาด)
    const cur = h.getState().teams[h.getState().currentTeamIndex]
    if (!cur.hand.includes('shuffle')) return
    const after = h.dispatch({ type: 'PLAY_CARD', card: 'shuffle' })
    expect(after.bombsRemaining).toBe(bombsBefore)
    expect(Object.keys(secretMap(h))).toHaveLength(bombsBefore)
  })

  it('bombsRemaining ไม่เป็น 0 ทั้งที่ยังเหลือ >1 ทีมและยังมีช่อง hidden', () => {
    const settings = cardSettings({ teamNames: ['A', 'B'], rangeMin: 1, rangeMax: 8 })
    const seed = findSeed(settings, (h) => h.getState().teams[0].hand.includes('shuffle'))
    const h = createGame(settings, seed)
    // ใช้ shuffle ซ้ำ ๆ — ทุกครั้งระเบิดต้องยังอยู่ครบตราบใดที่เกมยังไม่จบ
    for (let round = 0; round < 5; round++) {
      const st = h.getState()
      if (st.phase === 'gameover') break
      const team = st.teams[st.currentTeamIndex]
      if (team.hand.includes('shuffle')) {
        const s = h.dispatch({ type: 'PLAY_CARD', card: 'shuffle' })
        const hidden = countHidden(s)
        if (s.teams.filter((t) => t.alive).length > 1 && hidden > 0) {
          expect(s.bombsRemaining).toBeGreaterThan(0)
        }
      }
      endCurrentTurn(h)
    }
  })
})

describe('Attack (7.3 transfer)', () => {
  it('A→B 2 ใบ แล้ว B ถ่ายโอน → C=4, B=1, turn จบทันที', () => {
    // ลำดับทีม A, C, B, D — ให้ B โดนโจมตี 2 ครั้งก่อนถึงตาตัวเอง
    // D ต้องไม่มี Block ด้วย ไม่งั้นถึงตาจะเข้า defending แทน
    const settings = cardSettings({ teamNames: ['A', 'C', 'B', 'D'] })
    const seed = findSeed(settings, (h) => {
      const hands = h.getState().teams.map((t) => t.hand)
      return (
        hands[0].includes('attack') &&
        hands[1].includes('attack') &&
        hands[2].includes('attack') &&
        !hands[3].includes('block')
      )
    })
    const h = createGame(settings, seed)

    // A(0) โจมตี B(2) — โดนคิวไว้ ยังไม่โดนจริง
    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '2' })
    expect(h.getState().teams[2].pendingAttacks).toHaveLength(1)
    expect(h.getState().teams[2].pendingOpens).toBe(1)
    expect(h.getState().currentTeamIndex).toBe(1) // ไป C

    // C(1) โจมตี B(2) → ถึงตา B ทันที — B ไม่มี Block (มือ 1 ใบ = attack) → โดนโดยปริยาย
    const st2 = h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '2' })
    expect(st2.currentTeamIndex).toBe(2) // ไป B
    expect(st2.phase).toBe('cards')
    expect(st2.teams[2].pendingAttacks).toHaveLength(0)
    expect(st2.teams[2].pendingOpens).toBe(3) // 1 + 2

    // B(2) ถ่ายโอนกองทั้งหมดใส่ D(3)
    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '3' })
    const s = h.getState()
    // D โดนคิวโจมตี (โอนกอง 3) แต่ D ไม่มี Block → โดนไปเลยตอนถึงตา
    expect(s.teams[3].pendingOpens).toBe(4) // 1 + 3
    expect(s.teams[2].pendingOpens).toBe(1) // กลับเป็นปกติ
    expect(s.currentTeamIndex).toBe(3) // turn จบทันที ไป D
    expect(s.phase).toBe('cards')
  })
})

describe('smoke', () => {
  it('เปิดการ์ดแล้วเล่นเกมจบได้จริง (สุ่มเล่นจน gameover ไม่ crash/loop)', () => {
    const settings = cardSettings({ teamNames: ['A', 'B', 'C', 'D'], rangeMin: 1, rangeMax: 12 })
    const h = createGame(settings, 7)
    let guard = 0
    while (h.getState().phase !== 'gameover' && guard < 10000) {
      guard++
      const s = h.getState()
      if (s.phase === 'defusing') {
        h.dispatch({ type: 'CHOOSE_WIRE', wire: Math.random() < 0.5 ? 'red' : 'blue' })
        h.dispatch({ type: 'ACK_DEFUSE' })
      } else if (s.phase === 'blocking') {
        // FIX #25: ถูกถามว่าจะใช้ Block กันไหม — ต้องตอบ ไม่งั้นเกมค้างที่ phase นี้
        h.dispatch({ type: 'RESOLVE_BLOCK', use: Math.random() < 0.5 })
      } else if (s.phase === 'defending') {
        // โดนโจมตีค้างอยู่ถึงตา — เลือกสุ่มว่าจะกันกี่ใบ (0..จำนวนที่กันได้)
        const cur = s.teams[s.currentTeamIndex]
        const max = Math.min(
          cur.pendingAttacks.length,
          cur.hand.filter((c) => c === 'block').length,
        )
        h.dispatch({ type: 'RESOLVE_ATTACK_DEFENSE', use: Math.floor(Math.random() * (max + 1)) })
      } else if (s.phase === 'cards') {
        const cur = s.teams[s.currentTeamIndex]
        if (cur.hand.length > 0 && !s.currentGlitched && !s.currentBlocked) {
          const card = cur.hand[0]
          if (card === 'block') {
            // Block ใช้เล่นตรง ๆ ไม่ได้ — ต้องรอ effect จากทีมอื่น เปิดป้ายแทน
            h.dispatch({ type: 'OPEN_CELL', cell: randomHidden(h) })
          } else if (card === 'attack') {
            const targets = s.teams.filter((t) => t.alive && t.id !== cur.id)
            h.dispatch({ type: 'PLAY_CARD', card, targetTeamId: targets[0]?.id })
          } else if (card === 'scan') {
            h.dispatch({ type: 'PLAY_CARD', card, targetCell: s.rangeMin })
          } else {
            h.dispatch({ type: 'PLAY_CARD', card })
          }
        } else {
          h.dispatch({ type: 'OPEN_CELL', cell: randomHidden(h) })
        }
      } else if (s.phase === 'opening') {
        h.dispatch({ type: 'OPEN_CELL', cell: randomHidden(h) })
      }
    }
    expect(h.getState().phase).toBe('gameover')
  })
})

function randomHidden(h: GameHandle): number {
  const s = h.getState()
  const hidden: number[] = []
  for (let n = s.rangeMin; n <= s.rangeMax; n++) {
    if (!(n in s.cells)) hidden.push(n)
  }
  return hidden[Math.floor(Math.random() * hidden.length)] ?? s.rangeMin
}
// FIX_LISTS #10: Reverse/Shuffle กระทบทั้งวง → เข้า phase 'blocking' ให้กันได้
// (Attack ไม่เข้าคิวนี้แล้ว — โดนคิวไว้แล้วแก้ตอนเริ่มตาตัวเองผ่าน phase 'defending')
// FIX_LISTS #15: Block ไม่ stack — กันได้ = จบเลย และใช้เล่นตรง ๆ ไม่ได้
// FIX_LISTS ชุดที่สาม #2: กันได้เฉพาะ effect ที่ลงกับทีมตัวเอง — คิวจึงมีได้ 1 ทีมเท่านั้น
describe('FIX_LISTS #10/#15: คิวถาม Block (Reverse/Shuffle)', () => {
  // A ใช้ shuffle → เป้าหมายคือ B (ทีมถัดไป) ซึ่งถือ Block อยู่ในมือ
  function setupThreeTeams() {
    const settings = cardSettings({ teamNames: ['A', 'B', 'C'] })
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return st.teams[0].hand.includes('shuffle') && st.teams[1].hand.includes('block')
    })
    return createGame(settings, seed)
  }

  it('ทีมเป้าหมายกัน Shuffle ได้ — คิวมีแค่ทีมเป้าหมายทีมเดียว', () => {
    const h = setupThreeTeams()
    const bombsBefore = secretMap(h)

    const st = h.dispatch({ type: 'PLAY_CARD', card: 'shuffle' })
    expect(st.phase).toBe('blocking')
    // FIX_LISTS ชุดที่สาม #2: ถามเฉพาะ B (ทีมที่ effect ลง) ไม่ลามไปทีมอื่น
    expect(st.pendingBlock?.askQueue).toEqual(['1'])

    const after = h.dispatch({ type: 'RESOLVE_BLOCK', use: true })
    expect(after.phase).not.toBe('blocking')
    expect(after.teams[1].hand).not.toContain('block') // B ใช้ Block ไปแล้ว
    // กันได้ → ระเบิดไม่ย้าย
    expect(secretMap(h)).toEqual(bombsBefore)
  })

  // FIX_LISTS ชุดที่สาม #2: ทีมที่ไม่ได้โดน effect เข้ามากันแทนไม่ได้อีกแล้ว
  it('ทีมที่ 3 ถือ Block แต่ effect ไม่ได้ลงที่ตัวเอง → ไม่ถูกถาม effect ทำงานเลย', () => {
    const settings = cardSettings({ teamNames: ['A', 'B', 'C'] })
    // A ใช้ shuffle (เป้าหมาย = B), มีแต่ C ที่ถือ Block และ B ไม่ถือ
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return (
        st.teams[0].hand.includes('shuffle') &&
        st.teams[2].hand.includes('block') &&
        !st.teams[1].hand.includes('block')
      )
    })
    const h = createGame(settings, seed)
    const bombsBefore = secretMap(h)

    const st = h.dispatch({ type: 'PLAY_CARD', card: 'shuffle' })
    expect(st.phase).not.toBe('blocking')
    expect(st.teams[2].hand).toContain('block') // C ไม่เสียการ์ด เพราะไม่ถูกถาม
    // ไม่มีใครกันได้ → ระเบิดย้ายจริง
    expect(secretMap(h)).not.toEqual(bombsBefore)
  })

  it('ทีมในคิวตอบไม่กัน → effect ทำงาน และการ์ดยังอยู่มือ', () => {
    const h = setupThreeTeams()
    const bombsBefore = secretMap(h)
    h.dispatch({ type: 'PLAY_CARD', card: 'shuffle' })
    const after = h.dispatch({ type: 'RESOLVE_BLOCK', use: false })
    expect(after.phase).not.toBe('blocking')
    expect(after.teams[1].hand).toContain('block')
    // กันไม่สำเร็จ → ระเบิดย้ายจริง
    expect(secretMap(h)).not.toEqual(bombsBefore)
  })

  it('ทีมที่ใช้การ์ดเอง กัน effect ของตัวเองไม่ได้ (ไม่เข้าคิว)', () => {
    // startingHand 3 เพราะต้องให้ A ถือ 2 ใบพร้อมกัน (shuffle + block)
    const settings = cardSettings({ teamNames: ['A', 'B'], startingHand: 3 })
    // A ถือทั้ง shuffle และ block → A ต้องไม่ถูกถามให้กันการ์ดตัวเอง
    const seed = findSeed(settings, (h) => {
      const hand = h.getState().teams[0].hand
      return hand.includes('shuffle') && hand.includes('block')
    })
    const h = createGame(settings, seed)

    const st = h.dispatch({ type: 'PLAY_CARD', card: 'shuffle' })
    // B ไม่มี Block และ A กันตัวเองไม่ได้ → ไม่เข้า phase blocking เลย
    expect(st.phase).not.toBe('blocking')
  })

  it('FIX_LISTS #15: Block ใช้เล่นตรง ๆ ไม่ได้ (กัน Block ด้วย Block ไม่ได้)', () => {
    const settings = cardSettings({ teamNames: ['A', 'B'] })
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return st.teams[0].hand.includes('block') && st.teams[1].hand.includes('block')
    })
    const h = createGame(settings, seed)

    // A พยายามใช้ Block ตรง ๆ — ใช้ไม่ได้ การ์ดไม่หาย และไม่เปิด phase ถาม
    const st = h.dispatch({ type: 'PLAY_CARD', card: 'block' })
    expect(st.phase).not.toBe('blocking')
    expect(st.teams[0].hand).toContain('block')
    expect(st.teams[1].hand).toContain('block')
  })
})

// FIX_LISTS ชุดใหม่: Skip กันด้วย Block ได้ — Skip เป็นการ์ดเชิงรุก (โยนเคราะห์
// ให้ทีมถัดไปเปิดป้ายแทน) จึงให้ "ทีมถัดไปในทิศ" มีสิทธิ์เอา Block มากันก่อน
describe('FIX_LISTS ชุดใหม่: Block กัน Skip ได้', () => {
  // A ใช้ skip → เป้าหมายคือ B (ทีมถัดไปในทิศ) ซึ่งถือ Block อยู่ในมือ
  function setupSkipVsBlock() {
    const settings = cardSettings({ teamNames: ['A', 'B', 'C'] })
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return st.teams[0].hand.includes('skip') && st.teams[1].hand.includes('block')
    })
    return createGame(settings, seed)
  }

  it('ใช้ Skip แล้วเข้า phase blocking — ถามทีมถัดไปที่ถือ Block', () => {
    const h = setupSkipVsBlock()
    const st = h.dispatch({ type: 'PLAY_CARD', card: 'skip' })
    expect(st.phase).toBe('blocking')
    expect(st.pendingBlock?.card).toBe('skip')
    // ทีมถัดไปในทิศ (B = index 1) เป็นเป้าหมายและเป็นคนเดียวในคิว
    expect(st.pendingBlock?.targetTeamId).toBe('1')
    expect(st.pendingBlock?.askQueue).toEqual(['1'])
  })

  it('กัน Skip สำเร็จ → คนใช้เสียการ์ดเปล่าและจบตา ทีมถัดไปได้เล่นตามคิวเดิม', () => {
    const h = setupSkipVsBlock()
    h.dispatch({ type: 'PLAY_CARD', card: 'skip' })
    const after = h.dispatch({ type: 'RESOLVE_BLOCK', use: true })

    expect(after.phase).not.toBe('blocking')
    expect(after.teams[1].hand).not.toContain('block') // B ใช้ Block ไปแล้ว
    expect(after.teams[0].hand).not.toContain('skip') // A เสีย Skip เปล่า
    // จบตาของ A ตามปกติ → ถึงตา B
    expect(after.currentTeamIndex).toBe(1)
  })

  it('ไม่กัน → Skip ทำงาน จบตาคนใช้และไม่ได้จั่วการ์ด', () => {
    const h = setupSkipVsBlock()
    const handBefore = h.getState().teams[0].hand.length
    h.dispatch({ type: 'PLAY_CARD', card: 'skip' })
    const after = h.dispatch({ type: 'RESOLVE_BLOCK', use: false })

    expect(after.phase).not.toBe('blocking')
    expect(after.teams[1].hand).toContain('block') // ไม่กัน → การ์ดยังอยู่มือ
    expect(after.currentTeamIndex).toBe(1)
    // Skip ไม่ได้จั่วชดเชย → มือลดลง 1 ใบเป๊ะ (เสียแค่ Skip ที่ใช้ไป)
    expect(after.teams[0].hand.length).toBe(handBefore - 1)
  })

  it('ทีมถัดไปไม่ถือ Block → Skip ทำงานทันที ไม่เข้า phase blocking', () => {
    const settings = cardSettings({ teamNames: ['A', 'B', 'C'] })
    // A ถือ skip, B (ทีมถัดไป) ไม่ถือ block — C ถืออยู่ก็ไม่เกี่ยว (effect ไม่ลงที่ C)
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return st.teams[0].hand.includes('skip') && !st.teams[1].hand.includes('block')
    })
    const h = createGame(settings, seed)
    const st = h.dispatch({ type: 'PLAY_CARD', card: 'skip' })
    expect(st.phase).not.toBe('blocking')
    expect(st.currentTeamIndex).toBe(1)
  })

  it('กัน Skip ด้วย Block แล้วถูก counter-block → Skip กลับมาทำงานตามปกติ', () => {
    const settings = cardSettings({ teamNames: ['A', 'B'], startingHand: 3 })
    // A ถือ skip + block (ไว้ counter ของ B), B ถือ block (กัน skip ชั้นแรก)
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return (
        st.teams[0].hand.includes('skip') &&
        st.teams[0].hand.includes('block') &&
        st.teams[1].hand.includes('block')
      )
    })
    const h = createGame(settings, seed)

    h.dispatch({ type: 'PLAY_CARD', card: 'skip' })
    // ชั้นที่ 1: B กัน Skip → ถาม A ว่าจะล้ม Block ของ B ไหม
    const counter = h.dispatch({ type: 'RESOLVE_BLOCK', use: true })
    expect(counter.phase).toBe('blocking')
    expect(counter.pendingBlock?.counter).toBe(true)
    expect(counter.pendingBlock?.askQueue).toEqual(['0'])

    // ชั้นที่ 2: A ล้ม Block ของ B → ชั้นคู่ = effect เดิม (Skip) ทำงาน
    const after = h.dispatch({ type: 'RESOLVE_BLOCK', use: true })
    expect(after.phase).not.toBe('blocking')
    expect(after.currentTeamIndex).toBe(1)
  })
})

// FIX_LISTS #16: โอกาสโดนระเบิดระหว่างเล่นต้องไม่รวม glitch (ระบบไม่เห็น glitch)
describe('FIX_LISTS #16: realBombsRemaining ไม่รวม glitch', () => {
  it('นับเฉพาะระเบิดจริง ไม่รวม glitch', () => {
    const settings = cardSettings({
      teamNames: ['A', 'B', 'C', 'D'],
      glitchEnabled: true,
      glitchMode: 'manual',
      glitchCount: 2,
      cardsEnabled: false,
    })
    const h = createGame(settings, 1)
    const st = h.getState()
    const secret = secretMap(h)
    const real = Object.values(secret).filter((k) => k === 'real').length
    const glitch = Object.values(secret).filter((k) => k === 'glitch').length

    expect(glitch).toBe(2)
    expect(st.realBombsRemaining).toBe(real)
    // ยอดรวมยังนับ glitch ด้วย — สองค่านี้ต้องต่างกันจริง ไม่งั้นเทสผ่านแบบว่างเปล่า
    expect(st.bombsRemaining).toBe(real + glitch)
    expect(st.realBombsRemaining).not.toBe(st.bombsRemaining)
  })
})

// FIX_LISTS ชุดที่สาม #2: กันได้เฉพาะ effect ที่จะเกิดกับทีมตัวเอง
// → ไม่มีคิวหลายทีมอีกแล้ว ถามทีมเป้าหมายทีมเดียวจบ (ชั้น counter ยังมีอยู่)
describe('FIX_LISTS ชุดที่สาม #2: ถามเฉพาะทีมที่ effect ลง', () => {
  it('ทีมเป้าหมายไม่กัน → จบทันที ไม่เด้งไปถามทีมอื่นที่ถือ Block', () => {
    const settings = cardSettings({ teamNames: ['A', 'B', 'C'], startingHand: 3 })
    // A ต้องมี shuffle, B และ C ต้องมี block คนละใบ
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return (
        st.teams[0].hand.includes('shuffle') &&
        st.teams[1].hand.includes('block') &&
        st.teams[2].hand.includes('block')
      )
    })
    const h = createGame(settings, seed)
    const bombsBefore = secretMap(h)

    const st = h.dispatch({ type: 'PLAY_CARD', card: 'shuffle' })
    expect(st.phase).toBe('blocking')
    // มีแต่ B (ทีมที่ effect ลง) ในคิว — C ถือ Block แต่ไม่เกี่ยวกับตัวเอง
    expect(st.pendingBlock?.askQueue).toEqual(['1'])

    // B ไม่กัน → จบเลย ไม่ถาม C ต่อ และ effect ทำงาน
    const after = h.dispatch({ type: 'RESOLVE_BLOCK', use: false })
    expect(after.phase).not.toBe('blocking')
    expect(after.pendingBlock).toBeNull()
    expect(after.teams[1].hand).toContain('block')
    expect(after.teams[2].hand).toContain('block')
    expect(secretMap(h)).not.toEqual(bombsBefore)
  })

  it('ทีมเป้าหมายกัน → คนใช้การ์ดที่ถือ Block ได้สิทธิ์ล้มต่อ (ชั้น counter)', () => {
    const settings = cardSettings({ teamNames: ['A', 'B', 'C'], startingHand: 3 })
    // A ถือทั้ง shuffle + block (เพื่อเป็นคนล้มชั้นถัดไป), B ถือ block
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return (
        st.teams[0].hand.includes('shuffle') &&
        st.teams[0].hand.includes('block') &&
        st.teams[1].hand.includes('block')
      )
    })
    const h = createGame(settings, seed)

    h.dispatch({ type: 'PLAY_CARD', card: 'shuffle' })
    // B กัน → A (ผู้เสียประโยชน์จาก Block ใบนี้) ถูกถามว่าจะล้มไหม
    const counter = h.dispatch({ type: 'RESOLVE_BLOCK', use: true })
    expect(counter.teams[1].hand).not.toContain('block')
    expect(counter.phase).toBe('blocking')
    expect(counter.pendingBlock?.counter).toBe(true)
    expect(counter.pendingBlock?.chain).toEqual(['1'])
    expect(counter.pendingBlock?.askQueue).toEqual(['0'])

    // A ไม่ล้มต่อ → ชั้นเหลือ 1 (คี่) = Shuffle ถูกกันสำเร็จ
    const after = h.dispatch({ type: 'RESOLVE_BLOCK', use: false })
    expect(after.phase).not.toBe('blocking')
    expect(after.pendingBlock).toBeNull()
  })
})

// FIX_LISTS ชุดใหม่ #1: ทิศของ Reverse + กัน Block ด้วย Block เป็นชั้น ๆ
describe('FIX_LISTS ชุดใหม่ #1: Reverse ถามทีมทางทิศที่จะย้อนไป + counter-block', () => {
  // ทีม 3 (index 2) ใช้ Reverse ระหว่างที่ทิศเดินหน้า (direction = 1)
  // ทิศจะพลิกกลับไปหาทีม 2 (index 1) → ทีม 2 ต้องเป็นคนถูกถามก่อน
  it('ทีมที่อยู่ในทิศที่จะย้อนไปได้ตอบก่อน (ไม่ใช่ทีมถัดไปในทิศเดิม)', () => {
    const settings = cardSettings({ teamNames: ['T1', 'T2', 'T3', 'T4'], startingHand: 3 })
    // T3 ถือ reverse, ทั้ง T2 และ T4 ถือ block → ถ้าเอาทิศผิดจะไปถาม T4 ก่อน
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return (
        st.teams[2].hand.includes('reverse') &&
        st.teams[1].hand.includes('block') &&
        st.teams[3].hand.includes('block')
      )
    })
    const h = createGame(settings, seed)

    // เดินให้ถึงตาทีม 3 (index 2) โดยทีม 1 กับ 2 กด skip ตา
    h.dispatch({ type: 'TIMEOUT' })
    h.dispatch({ type: 'TIMEOUT' })
    expect(h.getState().currentTeamIndex).toBe(2)
    expect(h.getState().direction).toBe(1)

    const st = h.dispatch({ type: 'PLAY_CARD', card: 'reverse' })
    expect(st.phase).toBe('blocking')
    // หัวคิวต้องเป็น T2 (index 1) — ทีมที่ทิศกำลังจะย้อนกลับไปหา
    expect(st.pendingBlock?.targetTeamId).toBe('1')
    expect(st.pendingBlock?.askQueue?.[0]).toBe('1')
  })

  // FIX_LISTS ชุดที่สาม #2: ชั้น counter ตกที่ "ผู้เสียประโยชน์" ของ Block ใบนั้น
  // = ทีม3 (คนใช้ Reverse) ไม่ใช่ทีม4 ที่ไม่เกี่ยวกับ effect นี้
  // ทีม3 ล้ม แล้วทีม2 ไม่มี Block เหลือ → ทีม2 โดน Reverse เต็ม ๆ
  it('ทีม2 กัน → ทีม3 (คนใช้การ์ด) ล้ม Block ของทีม2 → Reverse ทำงานจริง', () => {
    const settings = cardSettings({ teamNames: ['T1', 'T2', 'T3', 'T4'], startingHand: 3 })
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return (
        st.teams[2].hand.includes('reverse') &&
        // ทีม3 ต้องถือ block ไว้ล้มชั้นของทีม2 (ชั้นแรกกันตัวเองไม่ได้
        // แต่ชั้น counter ถือว่าเป็น "ผู้เสียประโยชน์" จึงมีสิทธิ์ล้ม)
        st.teams[2].hand.includes('block') &&
        st.teams[1].hand.filter((c) => c === 'block').length === 1
      )
    })
    const h = createGame(settings, seed)
    h.dispatch({ type: 'TIMEOUT' })
    h.dispatch({ type: 'TIMEOUT' })

    h.dispatch({ type: 'PLAY_CARD', card: 'reverse' })
    // ทีม2 กัน → เสียการ์ด แล้วเด้งไปถามทีม3 ว่าจะล้มไหม
    const afterT2 = h.dispatch({ type: 'RESOLVE_BLOCK', use: true })
    expect(afterT2.phase).toBe('blocking')
    expect(afterT2.pendingBlock?.counter).toBe(true)
    expect(afterT2.pendingBlock?.chain).toEqual(['1'])
    expect(afterT2.pendingBlock?.askQueue).toEqual(['2'])
    expect(afterT2.teams[1].hand).not.toContain('block') // ทีม2 หมด Block แล้ว

    // ทีม3 ล้ม Block ของทีม2 → ชั้นเป็น 2 (คู่) = Reverse ทำงานจริง
    const after = h.dispatch({ type: 'RESOLVE_BLOCK', use: true })
    expect(after.phase).not.toBe('blocking')
    expect(after.pendingBlock).toBeNull()
    expect(after.teams[2].hand).not.toContain('block') // ทีม3 เสียการ์ดไปด้วย
    // Reverse ติด → ทิศพลิก แล้วตาไปที่ทีม2 ตามทิศใหม่
    expect(after.direction).toBe(-1)
    expect(after.currentTeamIndex).toBe(1)
  })

  it('ชั้นคี่ (ไม่มีใครล้มต่อ) = effect ถูกกันสำเร็จ ทิศไม่เปลี่ยน', () => {
    const settings = cardSettings({ teamNames: ['T1', 'T2', 'T3', 'T4'], startingHand: 3 })
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return st.teams[2].hand.includes('reverse') && st.teams[1].hand.includes('block')
    })
    const h = createGame(settings, seed)
    h.dispatch({ type: 'TIMEOUT' })
    h.dispatch({ type: 'TIMEOUT' })

    h.dispatch({ type: 'PLAY_CARD', card: 'reverse' })
    let st = h.getState()
    // ไล่ตอบ "กัน" ที่ชั้นแรก แล้วตอบ "ไม่ล้ม" จนหมดคิว
    st = h.dispatch({ type: 'RESOLVE_BLOCK', use: true })
    while (st.phase === 'blocking') {
      st = h.dispatch({ type: 'RESOLVE_BLOCK', use: false })
    }
    expect(st.pendingBlock).toBeNull()
    expect(st.direction).toBe(1) // Reverse ถูกกัน — ทิศเดิม
  })

  it('ทีมที่กันไปแล้วไม่ถูกถามซ้ำในศึกเดียวกัน (กันชั้นตัวเองไม่ได้)', () => {
    const settings = cardSettings({ teamNames: ['T1', 'T2', 'T3', 'T4'], startingHand: 3 })
    // ทีม2 ถือ block 2 ใบ — ถ้าไม่กันการถามซ้ำ ทีม2 จะโผล่ในคิวชั้นถัดไปเอง
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return (
        st.teams[2].hand.includes('reverse') &&
        st.teams[1].hand.filter((c) => c === 'block').length >= 2
      )
    })
    const h = createGame(settings, seed)
    h.dispatch({ type: 'TIMEOUT' })
    h.dispatch({ type: 'TIMEOUT' })

    h.dispatch({ type: 'PLAY_CARD', card: 'reverse' })
    const after = h.dispatch({ type: 'RESOLVE_BLOCK', use: true })
    expect(after.pendingBlock?.askQueue ?? []).not.toContain('1')
  })
})

// FIX_LISTS ชุดใหม่ #1: chain ต้องจบเสมอ ห้ามวนไม่รู้จบ
// (ทุกชั้นตัดการ์ด Block ออกจากมือ 1 ใบ + ทีมที่กันแล้วไม่ถูกถามซ้ำ → คิวหดลงเรื่อย ๆ)
describe('FIX_LISTS ชุดใหม่ #1: counter-block chain จบเสมอ', () => {
  it('ทุกทีมถือ Block เต็มมือแล้วตอบ "กัน" ทุกชั้น → หลุดจาก phase blocking ได้', () => {
    const settings = cardSettings({ teamNames: ['A', 'B', 'C', 'D'], startingHand: 5 })
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return st.teams[0].hand.includes('shuffle') && st.teams.every((t) => t.hand.includes('block'))
    })
    const h = createGame(settings, seed)

    let st = h.dispatch({ type: 'PLAY_CARD', card: 'shuffle' })
    // ตอบ "กัน" รัวไปเรื่อย ๆ — ต้องจบภายในจำนวนชั้นที่จำกัด ไม่วนค้าง
    let guard = 0
    while (st.phase === 'blocking') {
      st = h.dispatch({ type: 'RESOLVE_BLOCK', use: true })
      guard += 1
      expect(guard).toBeLessThan(50) // กันเทสแขวนถ้า chain วนไม่จบ
    }
    expect(st.pendingBlock).toBeNull()
    expect(st.phase).not.toBe('blocking')
  })

  it('ตอบ "ไม่กัน" รัว ๆ ก็จบ และ effect ทำงาน', () => {
    const settings = cardSettings({ teamNames: ['A', 'B', 'C', 'D'], startingHand: 5 })
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return st.teams[0].hand.includes('shuffle') && st.teams.every((t) => t.hand.includes('block'))
    })
    const h = createGame(settings, seed)
    const before = secretMap(h)

    let st = h.dispatch({ type: 'PLAY_CARD', card: 'shuffle' })
    let guard = 0
    while (st.phase === 'blocking') {
      st = h.dispatch({ type: 'RESOLVE_BLOCK', use: false })
      guard += 1
      expect(guard).toBeLessThan(50)
    }
    // ไม่มีใครกันเลย → ชั้น 0 (คู่) = Shuffle ทำงาน ระเบิดย้ายจริง
    expect(secretMap(h)).not.toEqual(before)
  })
})

// FIX_LISTS ชุดที่สาม #3: ช่องที่สแกนแล้วถูก mark ไว้จนกว่าระเบิดจะย้ายที่
describe('FIX_LISTS ชุดที่สาม #3: scanMarks', () => {
  function scanGame() {
    const settings = cardSettings({ teamNames: ['A', 'B'], scanRadius: 2 })
    const seed = findSeed(settings, (h) => h.getState().teams[0].hand.includes('scan'))
    return createGame(settings, seed)
  }

  it('ยังไม่สแกน = ไม่มี mark', () => {
    expect(scanGame().getState().scanMarks).toEqual({})
  })

  it('สแกนแล้ว mark ทุกช่องในโซนที่ตรวจ ด้วยผลเดียวกันทั้งโซน', () => {
    const h = scanGame()
    const st = h.dispatch({ type: 'PLAY_CARD', card: 'scan', targetCell: 10 })
    const marks = st.scanMarks ?? {}
    // radius 2 รอบเลข 10 → 8..12
    expect(Object.keys(marks).map(Number).sort((a, b) => a - b)).toEqual([8, 9, 10, 11, 12])
    // ผลเป็นของทั้งโซน ทุกช่องต้องได้ค่าเดียวกัน (และตรงกับ lastCardResult)
    expect(st.lastCardResult?.card).toBe('scan')
    const found = st.lastCardResult?.card === 'scan' && st.lastCardResult.found
    for (const v of Object.values(marks)) expect(v).toBe(found)
  })

  it('mark ไม่ล้นออกนอกขอบกระดาน', () => {
    const h = scanGame()
    const st = h.dispatch({ type: 'PLAY_CARD', card: 'scan', targetCell: 1 })
    const cells = Object.keys(st.scanMarks ?? {}).map(Number)
    expect(Math.min(...cells)).toBe(st.rangeMin)
    expect(Math.max(...cells)).toBe(3)
  })

  it('Shuffle ย้ายระเบิด → mark ถูกล้างทิ้งทั้งหมด', () => {
    const settings = cardSettings({ teamNames: ['A', 'B'], scanRadius: 2, startingHand: 3 })
    // A ต้องถือทั้ง scan และ shuffle, และ B ต้องไม่มี block (ไม่งั้นค้างที่ phase blocking)
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return (
        st.teams[0].hand.includes('scan') &&
        st.teams[0].hand.includes('shuffle') &&
        !st.teams[1].hand.includes('block')
      )
    })
    const h = createGame(settings, seed)

    const scanned = h.dispatch({ type: 'PLAY_CARD', card: 'scan', targetCell: 10 })
    expect(Object.keys(scanned.scanMarks ?? {}).length).toBeGreaterThan(0)

    const shuffled = h.dispatch({ type: 'PLAY_CARD', card: 'shuffle' })
    expect(shuffled.scanMarks).toEqual({})
  })
})


// FIX_LISTS ชุดที่สิบเอ็ด #2: หมดเวลาระหว่างโดน Attack → ระบบสุ่มเปิดป้ายให้ทีละอัน
// (ปล่อยให้ timeout = เสีย turn เฉย ๆ จะทำให้การโดน Attack เป็นของฟรี)
describe('ชุดที่สิบเอ็ด #2: TIMEOUT ระหว่างโดน Attack', () => {
  // ตั้งสถานะ: B (index 1) โดน Attack ค้างอยู่ 1 ใบ และเป็นตาของ B แล้ว
  function attackedTeamB(): GameHandle {
    const settings = cardSettings({ teamNames: ['A', 'B'], startingHand: 1 })
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      // B ต้องไม่มี block ไม่งั้นจะค้างที่ phase 'defending' ให้ตอบก่อน
      return st.teams[0].hand.includes('attack') && !st.teams[1].hand.includes('block')
    })
    const h = createGame(settings, seed)
    const st = h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    expect(st.currentTeamIndex).toBe(1)
    expect(st.teams[1].pendingOpens).toBe(2)
    return h
  }

  it('หมดเวลาตอน pendingOpens > 1 → สุ่มเปิดให้ 1 ช่อง ไม่ใช่เสีย turn ทั้งก้อน', () => {
    const h = attackedTeamB()
    const before = h.getState()
    const openedBefore = Object.keys(before.cells).length

    const after = h.dispatch({ type: 'TIMEOUT' })
    // เปิดให้ "หนึ่งช่อง" — ไม่ใช่ศูนย์ (เสีย turn) และไม่ใช่รวดเดียวหลายช่อง
    expect(Object.keys(after.cells).length).toBe(openedBefore + 1)
    expect(after.log.some((l) => /ระบบสุ่มเปิด/.test(l.message))).toBe(true)
  })

  it('เปิดโดนช่องปลอดภัย → หนี้ลดลงทีละ 1 และยังเป็นตาเดิม', () => {
    const h = attackedTeamB()
    // ไล่หมดเวลาไปเรื่อย ๆ จนกว่าตาจะเปลี่ยน — แต่ละครั้งต้องเปิดเพิ่มทีละช่องเท่านั้น
    const startTurn = h.getState().turnNumber
    const s1 = h.dispatch({ type: 'TIMEOUT' })
    if (s1.phase === 'opening' && s1.turnNumber === startTurn) {
      // เปิดโดน safe → หนี้เหลือ 1 (ตาปกติ) ยังไม่เปลี่ยนทีม
      expect(s1.teams[1].pendingOpens).toBe(1)
      expect(s1.currentTeamIndex).toBe(1)
    } else {
      // เปิดโดนระเบิด/glitch → ไปตาม flow ปกติ (defusing หรือจบตา) ก็ถูกเช่นกัน
      expect(['defusing', 'cards', 'opening', 'gameover']).toContain(s1.phase)
    }
  })

  it('หนี้ก้อนสุดท้าย (pendingOpens === 1) → กลับไปใช้ FIX #18 เดิม เสีย turn ไม่เปิดให้', () => {
    const settings = cardSettings({ teamNames: ['A', 'B'] })
    const h = createGame(settings, 5)
    const before = h.getState()
    expect(before.teams[before.currentTeamIndex].pendingOpens).toBe(1)
    const openedBefore = Object.keys(before.cells).length

    const after = h.dispatch({ type: 'TIMEOUT' })
    expect(Object.keys(after.cells).length).toBe(openedBefore)
    expect(after.turnNumber).toBe(before.turnNumber + 1)
  })

  it('เปิดโดนระเบิด → เข้า flow กู้ปกติ และกู้สำเร็จแล้วจบตาเลย หนี้ที่เหลือไม่มีผล', () => {
    const settings = cardSettings({ teamNames: ['A', 'B'], startingHand: 1 })
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return st.teams[0].hand.includes('attack') && !st.teams[1].hand.includes('block')
    })
    const h = createGame(settings, seed)
    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    // โดนโจมตี 1 ใบ → ต้องเปิด 2 ช่อง
    expect(h.getState().teams[1].pendingOpens).toBe(2)

    // เปิดระเบิดจริงเองเพื่อคุมสถานการณ์ให้แน่นอน (จำลองผลของการสุ่ม)
    const bomb = bombCellOf(h, 'real')
    const st = h.dispatch({ type: 'OPEN_CELL', cell: bomb })
    expect(st.phase).toBe('defusing')

    // safeWire เป็นความลับ (ไม่อยู่ใน state สาธารณะ) และ createGameFromState สุ่มสายใหม่
    // → ถ้าสายแรกพลาด ให้เล่นสถานการณ์เดิมซ้ำจาก seed เดิมแล้วเลือกอีกสาย
    // (seed เดียวกัน + ลำดับ action เดียวกัน = safeWire เดิม) เพื่อให้ได้เคส "กู้สำเร็จ" แน่นอน
    const redFirst = h.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })
    let h2 = h
    if (redFirst.defuseResult?.survived !== true) {
      h2 = createGame(settings, seed)
      h2.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
      h2.dispatch({ type: 'OPEN_CELL', cell: bomb })
      const blue = h2.dispatch({ type: 'CHOOSE_WIRE', wire: 'blue' })
      expect(blue.defuseResult?.survived).toBe(true)
    }

    // กู้สำเร็จ → จบตาทันที (§3.4.2) แม้ pendingOpens จะยังเหลือ ไปทีมถัดไปเลย
    const done = h2.dispatch({ type: 'ACK_DEFUSE' })
    expect(done.currentTeamIndex).not.toBe(1)
    expect(done.teams[1].pendingOpens).toBe(1)
  })
})
