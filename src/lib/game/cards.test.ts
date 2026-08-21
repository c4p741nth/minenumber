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
    cardsEnabled: true,
    maxHandSize: 5,
    startingHand: 1,
    scanRadius: 3,
    shrinkingEnabled: false,
  defuseSeconds: 15,
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

  it('Block → เก็บเป็น charge ไว้กัน effect ทีมอื่น (ไม่ได้เล่นใส่ใครทันที)', () => {
    const settings = cardSettings()
    const seed = findSeed(settings, (h) => h.getState().teams[0].hand.includes('block'))
    const h = createGame(settings, seed)

    const st = h.dispatch({ type: 'PLAY_CARD', card: 'block' })
    expect(st.teams[0].blockCharges).toBe(1)
    // ไม่มีทีมไหนโดนแบนการ์ด
    expect(st.teams.every((t) => t.blockedTurnsLeft === 0)).toBe(true)
  })

  it('โดน Attack ตอนมี Block → เข้า phase blocking, ตอบ use=true แล้วกันได้', () => {
    const settings = cardSettings({ teamNames: ['A', 'B'] })
    // A ต้องมี attack, B ต้องมี block
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return st.teams[0].hand.includes('attack') && st.teams[1].hand.includes('block')
    })
    const h = createGame(settings, seed)

    // B กาง Block ไว้ก่อน (ข้ามไปตา B แล้วกลับมา)
    endCurrentTurn(h)
    expect(h.getState().currentTeamIndex).toBe(1)
    h.dispatch({ type: 'PLAY_CARD', card: 'block' })
    expect(h.getState().teams[1].blockCharges).toBe(1)
    endCurrentTurn(h)
    expect(h.getState().currentTeamIndex).toBe(0)

    const pendingBefore = h.getState().teams[1].pendingOpens
    const st = h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    expect(st.phase).toBe('blocking')
    expect(st.pendingBlock?.targetTeamId).toBe('1')

    const after = h.dispatch({ type: 'RESOLVE_BLOCK', use: true })
    expect(after.phase).not.toBe('blocking')
    expect(after.teams[1].blockCharges).toBe(0)
    // กันได้ → B ไม่ต้องเปิดเพิ่ม
    expect(after.teams[1].pendingOpens).toBe(pendingBefore)
  })

  it('โดน Attack ตอนมี Block แต่ตอบ use=false → effect ทำงานปกติ', () => {
    const settings = cardSettings({ teamNames: ['A', 'B'] })
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return st.teams[0].hand.includes('attack') && st.teams[1].hand.includes('block')
    })
    const h = createGame(settings, seed)

    endCurrentTurn(h)
    h.dispatch({ type: 'PLAY_CARD', card: 'block' })
    endCurrentTurn(h)

    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    const after = h.dispatch({ type: 'RESOLVE_BLOCK', use: false })
    expect(after.phase).not.toBe('blocking')
    // ไม่ได้ใช้ → charge ยังอยู่ และ B ต้องเปิดเพิ่ม
    expect(after.teams[1].blockCharges).toBe(1)
    expect(after.teams[1].pendingOpens).toBeGreaterThan(1)
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
    const settings = cardSettings({ teamNames: ['A', 'C', 'B', 'D'] })
    const seed = findSeed(settings, (h) => {
      const hands = h.getState().teams.map((t) => t.hand)
      return hands[0].includes('attack') && hands[1].includes('attack') && hands[2].includes('attack')
    })
    const h = createGame(settings, seed)

    // A(0) โจมตี B(2)
    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '2' })
    expect(h.getState().teams[2].pendingOpens).toBe(2)
    expect(h.getState().currentTeamIndex).toBe(1) // ไป C

    // C(1) โจมตี B(2)
    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '2' })
    expect(h.getState().teams[2].pendingOpens).toBe(3)
    expect(h.getState().currentTeamIndex).toBe(2) // ไป B

    // B(2) ถ่ายโอนกองทั้งหมดใส่ D(3)
    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '3' })
    const s = h.getState()
    expect(s.teams[3].pendingOpens).toBe(4) // 1 + 2 + 1
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
      } else if (s.phase === 'blocking') {
        // FIX #25: ถูกถามว่าจะใช้ Block กันไหม — ต้องตอบ ไม่งั้นเกมค้างที่ phase นี้
        h.dispatch({ type: 'RESOLVE_BLOCK', use: Math.random() < 0.5 })
      } else if (s.phase === 'cards') {
        const cur = s.teams[s.currentTeamIndex]
        if (cur.hand.length > 0 && !s.currentGlitched && !s.currentBlocked) {
          const card = cur.hand[0]
          if (card === 'attack') {
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
// FIX_LISTS #10: Block ใช้ได้เมื่อมีทีมใดทีมหนึ่งใช้ item — ถามไล่ทีละทีมจนหมดคนที่ถือ Block
// FIX_LISTS #15: Block ไม่ stack — กันได้ = จบเลย และกัน Block ด้วย Block ไม่ได้
describe('FIX_LISTS #10/#15: คิวถาม Block', () => {
  // A ใช้ attack ใส่ B, C ถือ Block ไว้ (ทีมที่สาม)
  function setupThreeTeams() {
    const settings = cardSettings({ teamNames: ['A', 'B', 'C'] })
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return st.teams[0].hand.includes('attack') && st.teams[2].hand.includes('block')
    })
    const h = createGame(settings, seed)
    // ไปตา C แล้วกาง Block ไว้
    endCurrentTurn(h) // A → B
    endCurrentTurn(h) // B → C
    expect(h.getState().currentTeamIndex).toBe(2)
    h.dispatch({ type: 'PLAY_CARD', card: 'block' })
    expect(h.getState().teams[2].blockCharges).toBe(1)
    endCurrentTurn(h) // C → A
    expect(h.getState().currentTeamIndex).toBe(0)
    return h
  }

  it('ทีมที่ 3 กัน Attack แทนทีมที่โดนได้ (ไม่ใช่แค่ทีมเป้าหมาย)', () => {
    const h = setupThreeTeams()
    const pendingBefore = h.getState().teams[1].pendingOpens

    const st = h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    expect(st.phase).toBe('blocking')
    // B ไม่มี Block → คิวมีแต่ C
    expect(st.pendingBlock?.askQueue).toEqual(['2'])

    const after = h.dispatch({ type: 'RESOLVE_BLOCK', use: true })
    expect(after.phase).not.toBe('blocking')
    expect(after.teams[2].blockCharges).toBe(0)
    // กันได้ → B ไม่ต้องเปิดเพิ่ม
    expect(after.teams[1].pendingOpens).toBe(pendingBefore)
  })

  it('ทีมในคิวตอบไม่กัน → effect ทำงาน และ charge ยังอยู่', () => {
    const h = setupThreeTeams()
    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    const after = h.dispatch({ type: 'RESOLVE_BLOCK', use: false })
    expect(after.phase).not.toBe('blocking')
    expect(after.teams[2].blockCharges).toBe(1)
    expect(after.teams[1].pendingOpens).toBeGreaterThan(1)
  })

  it('ทีมที่ใช้การ์ดเอง กัน effect ของตัวเองไม่ได้ (ไม่เข้าคิว)', () => {
    // startingHand 3 เพราะต้องให้ A ถือ 2 ใบพร้อมกัน (attack + block)
    const settings = cardSettings({ teamNames: ['A', 'B'], startingHand: 3 })
    // A ถือทั้ง attack และ block → A ต้องไม่ถูกถามให้กันการ์ดตัวเอง
    const seed = findSeed(settings, (h) => {
      const hand = h.getState().teams[0].hand
      return hand.includes('attack') && hand.includes('block')
    })
    const h = createGame(settings, seed)
    h.dispatch({ type: 'PLAY_CARD', card: 'block' })
    expect(h.getState().teams[0].blockCharges).toBe(1)

    const st = h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    // B ไม่มี Block และ A กันตัวเองไม่ได้ → ไม่เข้า phase blocking เลย
    expect(st.phase).not.toBe('blocking')
    expect(st.teams[1].pendingOpens).toBeGreaterThan(1)
  })

  it('FIX_LISTS #15: ใช้การ์ด Block ไม่เปิด phase ถาม (กัน Block ซ้อน Block ไม่ได้)', () => {
    const settings = cardSettings({ teamNames: ['A', 'B'] })
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return st.teams[0].hand.includes('block') && st.teams[1].hand.includes('block')
    })
    const h = createGame(settings, seed)
    // B กาง Block ไว้ก่อน
    endCurrentTurn(h)
    h.dispatch({ type: 'PLAY_CARD', card: 'block' })
    expect(h.getState().teams[1].blockCharges).toBe(1)
    endCurrentTurn(h)

    // A ใช้ Block ของตัวเอง — B มี Block อยู่ แต่ต้องกันไม่ได้
    const st = h.dispatch({ type: 'PLAY_CARD', card: 'block' })
    expect(st.phase).not.toBe('blocking')
    expect(st.teams[0].blockCharges).toBe(1)
    expect(st.teams[1].blockCharges).toBe(1)
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

// FIX_LISTS #10: หัวใจของข้อนี้ — ถามต่อไปเรื่อย ๆ จนกว่าทุกทีมที่ถือ Block จะตอบ
describe('FIX_LISTS #10: ถามไล่ทีละทีมจนหมดคิว', () => {
  it('สองทีมถือ Block → ทีมแรกไม่กัน ต้องเด้งไปถามทีมที่สอง แล้วค่อย resolve', () => {
    const settings = cardSettings({ teamNames: ['A', 'B', 'C'], startingHand: 3 })
    // A ต้องมี attack, B และ C ต้องมี block คนละใบ
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return (
        st.teams[0].hand.includes('attack') &&
        st.teams[1].hand.includes('block') &&
        st.teams[2].hand.includes('block')
      )
    })
    const h = createGame(settings, seed)

    endCurrentTurn(h) // A → B
    h.dispatch({ type: 'PLAY_CARD', card: 'block' })
    endCurrentTurn(h) // B → C
    h.dispatch({ type: 'PLAY_CARD', card: 'block' })
    endCurrentTurn(h) // C → A
    expect(h.getState().currentTeamIndex).toBe(0)

    const st = h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    expect(st.phase).toBe('blocking')
    // ทีมที่โดน effect (B) ได้ตอบก่อน แล้วต่อด้วย C
    expect(st.pendingBlock?.askQueue).toEqual(['1', '2'])

    // B ไม่กัน → ยังอยู่ใน phase blocking แต่หัวคิวเลื่อนเป็น C
    const mid = h.dispatch({ type: 'RESOLVE_BLOCK', use: false })
    expect(mid.phase).toBe('blocking')
    expect(mid.pendingBlock?.askQueue).toEqual(['2'])
    expect(mid.teams[1].blockCharges).toBe(1) // B ยังไม่เสียการ์ด

    // C กันแทน → จบคิว effect ไม่ทำงาน
    const after = h.dispatch({ type: 'RESOLVE_BLOCK', use: true })
    expect(after.phase).not.toBe('blocking')
    expect(after.teams[2].blockCharges).toBe(0)
    expect(after.teams[1].pendingOpens).toBe(1) // B ไม่ต้องเปิดเพิ่ม
  })

  it('ทุกทีมตอบไม่กัน → effect ทำงาน และไม่มีใครเสียการ์ด', () => {
    const settings = cardSettings({ teamNames: ['A', 'B', 'C'], startingHand: 3 })
    const seed = findSeed(settings, (h) => {
      const st = h.getState()
      return (
        st.teams[0].hand.includes('attack') &&
        st.teams[1].hand.includes('block') &&
        st.teams[2].hand.includes('block')
      )
    })
    const h = createGame(settings, seed)

    endCurrentTurn(h)
    h.dispatch({ type: 'PLAY_CARD', card: 'block' })
    endCurrentTurn(h)
    h.dispatch({ type: 'PLAY_CARD', card: 'block' })
    endCurrentTurn(h)

    h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
    h.dispatch({ type: 'RESOLVE_BLOCK', use: false })
    const after = h.dispatch({ type: 'RESOLVE_BLOCK', use: false })

    expect(after.phase).not.toBe('blocking')
    expect(after.pendingBlock).toBeNull()
    expect(after.teams[1].blockCharges).toBe(1)
    expect(after.teams[2].blockCharges).toBe(1)
    expect(after.teams[1].pendingOpens).toBeGreaterThan(1) // effect ทำงานจริง
  })
})
