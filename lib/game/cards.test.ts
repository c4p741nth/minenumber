import { describe, expect, it } from 'vitest'
import { createGame, type GameHandle } from './engine'
import type { BombKind, CardType, GameSettings } from './types'

function cardSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    teamNames: ['A', 'B', 'C', 'D'],
    rangeMin: 1,
    rangeMax: 20,
    turnSeconds: 60,
    glitchEnabled: false,
    glitchRatio: 0.3,
    cardsEnabled: true,
    scanRadius: 3,
    shrinkingEnabled: false,
    ...overrides,
  }
}

function secretMap(h: GameHandle): Record<number, BombKind> {
  return h.serializeSecret()
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
  for (let i = 0; i < maxDraws; i++) {
    const hand = h.getState().teams[Number(teamId)].hand
    if (pred(hand)) return true
    if (hand.length >= 5) return false
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
function endCurrentTurn(h: GameHandle): void {
  const s = h.getState()
  const turn = s.turnNumber
  while (h.getState().turnNumber === turn && h.getState().phase !== 'gameover') {
    openSafeCell(h)
  }
}

describe('card draw', () => {
  it('เริ่มเกมทุกทีมได้ 1 ใบสุ่ม', () => {
    const h = createGame(cardSettings(), 9)
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

  it('มือเต็ม 5 ใบ → จั่วไม่เข้า', () => {
    const settings = cardSettings({ teamNames: ['A', 'B', 'C', 'D'] })
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

describe('Block', () => {
  it('block ซ้อน 2 ชั้น = แบน 2 turn', () => {
    const settings = cardSettings()
    const seed = findSeed(settings, (h) => {
      if (!h.getState().teams[0].hand.includes('block')) return false
      return drawUntil(h, '0', (hand) => hand.filter((c) => c === 'block').length >= 2)
    })
    const h = createGame(settings, seed)
    drawUntil(h, '0', (hand) => hand.filter((c) => c === 'block').length >= 2)

    // A ใช้ block 2 ใบใส่ B
    h.dispatch({ type: 'PLAY_CARD', card: 'block', targetTeamId: '1' })
    h.dispatch({ type: 'PLAY_CARD', card: 'block', targetTeamId: '1' })
    expect(h.getState().teams[1].blockedTurnsLeft).toBe(2)

    // ถึงตา B ครั้งที่ 1 → blocked
    endCurrentTurn(h)
    expect(h.getState().currentTeamIndex).toBe(1)
    expect(h.getState().currentBlocked).toBe(true)
    expect(h.getState().teams[1].blockedTurnsLeft).toBe(1)

    // B ลองเล่นการ์ด → ไม่มีผล (มือไม่ลด)
    const handBefore = h.getState().teams[1].hand.length
    const anyCard = h.getState().teams[1].hand[0]
    h.dispatch({ type: 'PLAY_CARD', card: anyCard, targetTeamId: '2' })
    expect(h.getState().teams[1].hand.length).toBe(handBefore)

    // วนครบรอบ → ถึงตา B ครั้งที่ 2 → ยัง blocked (ชั้นที่ 2)
    const bTurn = h.getState().turnNumber
    endCurrentTurn(h)
    while (h.getState().currentTeamIndex !== 1 || h.getState().turnNumber <= bTurn) {
      endCurrentTurn(h)
    }
    expect(h.getState().currentBlocked).toBe(true)
    expect(h.getState().teams[1].blockedTurnsLeft).toBe(0)

    // วนอีกรอบ → ถึงตา B ครั้งที่ 3 → เล่นได้แล้ว
    const bTurn2 = h.getState().turnNumber
    endCurrentTurn(h)
    while (h.getState().currentTeamIndex !== 1 || h.getState().turnNumber <= bTurn2) {
      endCurrentTurn(h)
    }
    expect(h.getState().currentBlocked).toBe(false)
    expect(h.getState().teams[1].blockedTurnsLeft).toBe(0)
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
  it('ย้ายระเบิดทั้งหมดไปช่อง hidden ใหม่ ไม่ทับช่องที่เปิดแล้ว', () => {
    const settings = cardSettings()
    const seed = findSeed(settings, (h) => h.getState().teams[0].hand.includes('shuffle'))
    const h = createGame(settings, seed)
    const before = secretMap(h)
    h.dispatch({ type: 'PLAY_CARD', card: 'shuffle' })
    const after = secretMap(h)
    expect(Object.keys(after)).toHaveLength(Object.keys(before).length)
    // ตำแหน่งเดิมทั้งหมดต้องว่างแล้ว
    for (const n of Object.keys(before)) {
      expect(after[Number(n)]).toBeUndefined()
    }
    // ตำแหน่งใหม่ต้องเป็น hidden (ยังไม่เปิด)
    const cells = h.getState().cells
    for (const n of Object.keys(after)) {
      expect(cells[Number(n)]).toBeUndefined()
    }
    // ไม่จบ turn (ยังอยู่ช่วงใช้การ์ด)
    expect(h.getState().phase).toBe('cards')
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
      } else if (s.phase === 'cards') {
        const cur = s.teams[s.currentTeamIndex]
        if (cur.hand.length > 0 && !s.currentGlitched && !s.currentBlocked) {
          const card = cur.hand[0]
          if (card === 'block' || card === 'attack') {
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