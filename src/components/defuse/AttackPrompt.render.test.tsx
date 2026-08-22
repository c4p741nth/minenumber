import { afterEach, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AttackPrompt } from './AttackPrompt'
import { BlockPrompt } from './BlockPrompt'
import { GameProvider } from '@/components/game/GameProvider'
import { createGame, createGameFromState, type GameHandle } from '@/lib/game/engine'
import { defaultSettings } from '@/lib/game/config'
import type { CardType, GameSettings } from '@/lib/game/types'

afterEach(cleanup)

function settingsFor(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    ...defaultSettings(),
    teamNames: ['ทีม 1', 'ทีม 2', 'ทีม 3', 'ทีม 4'],
    rangeMin: 1,
    rangeMax: 30,
    cardsEnabled: true,
    startingHand: 1,
    defendSeconds: 0, // ปิดจับเวลาในเทส — ไม่งั้น timer ยิง dispatch แทรกกลางทาง
    ...overrides,
  }
}

// หา seed ที่ทีมแรกได้การ์ดตามต้องการ (เหมือน findSeed ใน cards.test.ts)
function findSeed(settings: GameSettings, pred: (h: GameHandle) => boolean): number {
  for (let seed = 0; seed < 30000; seed++) {
    if (pred(createGame(settings, seed))) return seed
  }
  throw new Error('ไม่พบ seed ที่ตรงเงื่อนไข')
}

// พาเกมไปอยู่ใน phase 'defending' ของทีม 2 โดยให้ทีม 1 ใช้ Attack ใส่
function defendingGame(): GameHandle {
  const settings = settingsFor({ startingHand: 2 })
  const seed = findSeed(settings, (h) => {
    const st = h.getState()
    return (
      st.teams[0].hand.includes('attack') &&
      st.teams[1].hand.includes('block') &&
      // ไม่ให้ทีมอื่นถือ Block — จะได้ไม่เข้า phase 'blocking' ก่อนถึง 'defending'
      !st.teams[2].hand.includes('block') &&
      !st.teams[3].hand.includes('block')
    )
  })
  const h = createGame(settings, seed)
  h.dispatch({ type: 'PLAY_CARD', card: 'attack', targetTeamId: '1' })
  // ทีม 2 ถือ Block → เอนจินเข้า phase 'defending' ตอนเริ่มตาของทีม 2
  return h
}

// FIX_LISTS ชุดที่สิบสอง #3: อยู่ใน 'defending' โดยมีการ์ดโจมตีค้างหลายใบ
// ไล่เล่นจริงให้ครบ n ใบไม่ได้ — ต้องลุ้นว่าทุกทีมจะจั่ว attack ได้ต่อเนื่อง
// ซึ่งคุมไม่ได้ (ลูป while อาจวนไม่จบ) จึงต่อคิวลงบน snapshot ตรง ๆ
// แล้ว restore กลับเข้าเอนจิน — ได้คิว n ใบแน่นอน โดยไม่ผูกกับลำดับการจั่ว
function multiAttackGame(n: number): GameHandle {
  const settings = settingsFor({ startingHand: 4 })
  // ทีม 2 ต้องถือ Block ครบ n ใบ — เพดานที่ติ๊กป้องกันได้คือ Block ในมือ
  const seed = findSeed(
    settings,
    (h) => h.getState().teams[1].hand.filter((c) => c === 'block').length >= n,
  )
  const base = createGame(settings, seed)
  const st = base.getState()
  const next = {
    ...st,
    // เป็นตาของทีม 2 ที่มีคิวโจมตีค้าง — ตรงกับจังหวะที่ AttackPrompt โผล่
    currentTeamIndex: 1,
    phase: 'defending' as const,
    teams: st.teams.map((t, i) =>
      i === 1 ? { ...t, pendingAttacks: Array.from({ length: n }, () => ({ opens: 1 })) } : t,
    ),
  }
  return createGameFromState(next, base.serializeSecret(), seed)
}

function renderPrompt(h: GameHandle) {
  return render(
    <GameProvider handle={h}>
      <AttackPrompt />
    </GameProvider>,
  )
}

test('AttackPrompt: ไม่ throw และขึ้นเฉพาะตอน phase defending', () => {
  const h = defendingGame()
  expect(h.getState().phase).toBe('defending')
  expect(() => renderPrompt(h)).not.toThrow()
})

// ---- FIX_LISTS ชุดที่สิบสอง #3: การ์ดที่โดนเรียงหงายในแนวนอน + ตัวนับ block ----

// modal เต็มจอ (จังหวะนี้ต้องตัดสินใจก่อนเล่นต่อ) ไม่ใช่แผงมุมขวาแบบเดิม
test('ชุดที่สิบสอง #3: เป็น modal เต็มจอ ไม่ใช่แผงมุมขวา', () => {
  const h = defendingGame()
  renderPrompt(h)
  const panel = screen.getByRole('dialog')
  expect(panel.getAttribute('aria-modal')).toBe('true')
  expect(panel.className).toContain('inset-0')
  expect(panel.className).not.toContain('right-3')
})

// เดิมดูได้ทีละใบ ต้องกดลูกศรไล่ — ตอนนี้เรียงให้เห็นครบทุกใบพร้อมกัน
test('ชุดที่สิบสอง #3: ไม่มีปุ่มลูกศรเลื่อนดูทีละใบแล้ว', () => {
  const h = defendingGame()
  renderPrompt(h)
  expect(screen.queryByLabelText('การ์ดก่อนหน้า')).toBeNull()
  expect(screen.queryByLabelText('การ์ดถัดไป')).toBeNull()
})

// ใจกลางของข้อนี้ — โดนหลายใบต้องเห็นการ์ด "ทุกใบ" เรียงกันในทีเดียว
test('ชุดที่สิบสอง #3: โดน 3 ใบ → เห็นการ์ดครบ 3 ใบเรียงกันพร้อมกัน', () => {
  const h = multiAttackGame(3)
  expect(h.getState().teams[1].pendingAttacks.length).toBe(3)
  renderPrompt(h)
  const cards = screen.getAllByRole('button', { name: /Attack/ })
  expect(cards.length).toBe(3)
  // เรียงในแถวแนวนอนเดียวกัน (พี่น้องใน list เดียว) ไม่ใช่ทีละใบซ้อนกัน
  const row = cards[0].closest('ul')
  expect(row).not.toBeNull()
  for (const c of cards) expect(c.closest('ul')).toBe(row)
  expect(row?.className).toContain('flex')
})

// ตัวนับ "Block N/M" — N ขยับตามที่เลือก, M = Block ที่มีในมือ
// FIX_LISTS ชุดที่สิบสาม #2: ป้ายเปลี่ยนข้อความเป็น "🚫 Block N/M" เพราะมีป้าย
// "⏭ Skip N/M" มาอยู่ข้าง ๆ (โควตาแยกกัน) — ชื่อเดิม "block ใช้ไป" ยาวเกินจนสองป้ายเบียด
test('ชุดที่สิบสอง #3: ตัวนับ "Block N/M" ขยับตามที่เลือก', () => {
  const h = multiAttackGame(3)
  const blocks = h.getState().teams[1].hand.filter((c) => c === 'block').length
  renderPrompt(h)
  expect(screen.getByText(new RegExp(`Block 0/${blocks}`))).toBeDefined()

  fireEvent.click(screen.getAllByRole('button', { name: /Attack/ })[0])
  expect(screen.getByText(new RegExp(`Block 1/${blocks}`))).toBeDefined()
})

// เลือกป้องกัน/ปล่อยผ่านได้รายใบ — กดใบไหนก็สลับเฉพาะใบนั้น
test('ชุดที่สิบสอง #3: กดการ์ดสลับป้องกัน/ปล่อยผ่านรายใบ', () => {
  const h = multiAttackGame(3)
  renderPrompt(h)
  const cards = screen.getAllByRole('button', { name: /Attack/ })
  // ตอนแรกทุกใบ "ปล่อยผ่าน"
  expect(screen.getAllByText(/ปล่อยผ่าน/).length).toBeGreaterThanOrEqual(3)

  fireEvent.click(cards[1])
  // ใบที่กดเปลี่ยนเป็น "ป้องกัน" ใบอื่นไม่ขยับ
  expect(cards[1].getAttribute('aria-pressed')).toBe('true')
  expect(cards[0].getAttribute('aria-pressed')).toBe('false')
  expect(cards[2].getAttribute('aria-pressed')).toBe('false')

  // กดซ้ำ = ปล่อยผ่านตามเดิม
  fireEvent.click(cards[1])
  expect(cards[1].getAttribute('aria-pressed')).toBe('false')
})

// ชี้ที่การ์ด → popup อธิบาย effect ของใบนั้น (ยังต้องมีเหมือนเดิม)
test('ชุดที่สิบสอง #3: hover การ์ดแล้วขึ้นคำอธิบาย effect', () => {
  const h = defendingGame()
  renderPrompt(h)
  expect(screen.queryByRole('tooltip')).toBeNull()

  const card = screen.getByRole('button', { pressed: false, name: /Attack/ })
  fireEvent.mouseEnter(card)
  const tip = screen.getByRole('tooltip')
  expect(tip).toBeDefined()
  expect(tip.textContent ?? '').toContain('ต้องเปิดเพิ่ม')

  fireEvent.mouseLeave(card)
  expect(screen.queryByRole('tooltip')).toBeNull()
})

// ปุ่มยืนยันบอกจำนวนที่จะป้องกัน / ปล่อยผ่านทั้งหมด
test('ชุดที่สิบสอง #3: ปุ่มยืนยันบอกจำนวนที่จะป้องกัน', () => {
  const h = defendingGame()
  renderPrompt(h)
  expect(screen.getByText(/ปล่อยผ่านทั้งหมด/)).toBeDefined()

  fireEvent.click(screen.getByRole('button', { pressed: false, name: /Attack/ }))
  expect(screen.getByText(/ป้องกัน 1 ใบ/)).toBeDefined()
})

// กดยืนยันแล้วต้องออกจาก phase defending จริง (ไม่ค้าง)
test('ชุดที่สิบสอง #3: ยืนยันแล้วออกจาก phase defending', () => {
  const h = defendingGame()
  renderPrompt(h)
  fireEvent.click(screen.getByRole('button', { pressed: false, name: /Attack/ }))
  fireEvent.click(screen.getByText(/ป้องกัน 1 ใบ/))
  expect(h.getState().phase).not.toBe('defending')
})

// มี Block น้อยกว่าการ์ดที่โดน → ติ๊กได้ไม่เกินจำนวน Block ที่มีจริง
test('ชุดที่สิบสอง #3: ติ๊กป้องกันได้ไม่เกินจำนวน Block ที่ถืออยู่', () => {
  const h = multiAttackGame(3)
  const blocks = h.getState().teams[1].hand.filter((c) => c === 'block').length
  renderPrompt(h)
  const cards = screen.getAllByRole('button', { name: /Attack/ })
  for (const c of cards) if (c.getAttribute('disabled') === null) fireEvent.click(c)

  const pressed = screen
    .getAllByRole('button', { name: /Attack/ })
    .filter((c) => c.getAttribute('aria-pressed') === 'true')
  expect(pressed.length).toBeLessThanOrEqual(blocks)
})

// ---- FIX_LISTS ชุดใหม่ #1: BlockPrompt ต้องบอกชั้น counter ให้ชัด ----

// ทีม 3 ใช้ Reverse ระหว่างทิศเดินหน้า → ทีม 2 (ทิศที่จะย้อนไป) ถูกถามก่อน
function reverseBlockGame(): GameHandle {
  const settings = settingsFor({ startingHand: 3 })
  const seed = findSeed(settings, (h) => {
    const st = h.getState()
    return (
      st.teams[2].hand.includes('reverse') &&
      st.teams[1].hand.includes('block') &&
      // FIX_LISTS ชุดที่สาม #2: ชั้น counter ถามเฉพาะ "ผู้เสียประโยชน์" = ทีม 3
      // (คนใช้ Reverse) จึงต้องให้ทีม 3 ถือ Block ไว้ ไม่ใช่ทีม 4 เหมือนเดิม
      st.teams[2].hand.includes('block')
    )
  })
  const h = createGame(settings, seed)
  h.dispatch({ type: 'TIMEOUT' })
  h.dispatch({ type: 'TIMEOUT' })
  h.dispatch({ type: 'PLAY_CARD', card: 'reverse' })
  return h
}

test('FIX_LISTS ชุดใหม่ #1: BlockPrompt ถามทีมทางทิศที่จะย้อนไปก่อน', () => {
  const h = reverseBlockGame()
  expect(h.getState().phase).toBe('blocking')
  render(
    <GameProvider handle={h}>
      <BlockPrompt />
    </GameProvider>,
  )
  // ทีม 2 (index 1) ต้องเป็นคนถูกถาม
  expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('ทีม 2')
})

test('FIX_LISTS ชุดใหม่ #1: ชั้น counter บอกว่ากำลังล้ม Block ของใคร', () => {
  const h = reverseBlockGame()
  h.dispatch({ type: 'RESOLVE_BLOCK', use: true }) // ทีม 2 กัน
  const st = h.getState()
  expect(st.phase).toBe('blocking')
  expect(st.pendingBlock?.counter).toBe(true)

  render(
    <GameProvider handle={h}>
      <BlockPrompt />
    </GameProvider>,
  )
  // ต้องบอกชั้น และบอกว่าจะ "ล้ม Block" ไม่ใช่กัน effect เดิม
  expect(screen.getByText(/ชั้นที่ 2/)).toBeDefined()
  expect(screen.getByText(/ล้ม Block ใบนั้น/)).toBeDefined()
  expect(screen.getByText(/ใช้ Block ล้ม/)).toBeDefined()
})

// ---- FIX_LISTS ชุดที่สิบสอง #4: BlockPrompt ต้องมีรูปการ์ด ไม่ใช่ text ล้วน ----

function renderBlock(h: GameHandle) {
  return render(
    <GameProvider handle={h}>
      <BlockPrompt />
    </GameProvider>,
  )
}

// ใจกลางของข้อนี้ — เดิมกล่องนี้ไม่มี <img> เลยแม้แต่ใบเดียว
test('ชุดที่สิบสอง #4: BlockPrompt โชว์การ์ดคู่ที่ปะทะกัน (2 ใบ)', () => {
  const h = reverseBlockGame()
  renderBlock(h)
  const imgs = screen.getAllByRole('img')
  expect(imgs.length).toBe(2)
})

// FIX_LISTS ชุดที่สิบสี่ #2: กลับกติกาเดิม — เดิมใบของอีกฝ่ายคว่ำไว้ (ห้ามสปอยล์)
//   ตอนนี้ต้อง "หงายให้เห็นว่าเป็นการ์ดอะไรและใครใช้" เพื่อให้ตัดสินใจทิ้ง Block ได้
test('ชุดที่สิบสี่ #2: ชั้นปกติ ใบของอีกฝ่ายต้องหงาย บอกว่าเป็นการ์ดอะไรและใครใช้', () => {
  const h = reverseBlockGame()
  const st = h.getState()
  expect(st.pendingBlock?.counter).not.toBe(true)
  expect(st.pendingBlock?.card).toBe('reverse')
  const sourceName = st.teams.find((t) => t.id === st.pendingBlock!.sourceTeamId)!.name

  renderBlock(h)
  // ไม่มีใบคว่ำอีกแล้ว
  expect(screen.queryByAltText(/ยังไม่เปิดเผย/)).toBeNull()
  // หงายเป็น Reverse จริง และบอกชื่อทีมที่ใช้
  expect(screen.getByAltText(new RegExp(`Reverse ที่ ${sourceName} ใช้ใส่คุณ`))).toBeDefined()
  expect(screen.getAllByText(new RegExp(`${sourceName} ใช้ Reverse`)).length).toBeGreaterThan(0)
})

// Block ของตัวเองหงายได้ตลอด — เป็นการ์ดในมือเราเอง พร้อมบอกจำนวนที่เหลือ
test('ชุดที่สิบสอง #4: ใบขวาคือ Block ของเราเอง พร้อมบอกจำนวนที่เหลือ', () => {
  const h = reverseBlockGame()
  const st = h.getState()
  const responderId = st.pendingBlock?.askQueue?.[0] ?? st.pendingBlock?.targetTeamId
  const responder = st.teams.find((t) => t.id === responderId)!
  const blocks = responder.hand.filter((c) => c === 'block').length

  renderBlock(h)
  expect(screen.getByAltText(new RegExp(`Block ในมือของ ${responder.name}`))).toBeDefined()
  expect(screen.getByText(new RegExp(`ของคุณ — เหลือ ${blocks} ใบ`))).toBeDefined()
})

// ชั้น counter: Block ของอีกฝ่ายประกาศออกมาแล้ว จึงหงายได้ ไม่ใช่ความลับ
test('ชุดที่สิบสอง #4: ชั้น counter หงายการ์ด Block ของอีกฝ่ายได้', () => {
  const h = reverseBlockGame()
  h.dispatch({ type: 'RESOLVE_BLOCK', use: true })
  expect(h.getState().pendingBlock?.counter).toBe(true)

  renderBlock(h)
  // ไม่มีใบคว่ำแล้ว — ทั้งสองใบเป็น Block ที่ประกาศตัวแล้ว
  expect(screen.queryByAltText(/ยังไม่เปิดเผย/)).toBeNull()
  expect(screen.getAllByAltText(/Block/).length).toBe(2)
})

// FIX_LISTS ชุดที่สิบสาม #2: โควตา Skip แยกจาก Block + กด Skip ได้ในจังหวะตั้งรับ
// สร้างเกมที่ทีม 2 ถือ skip ครบตามต้องการ โดยยัดมือลง snapshot ตรง ๆ
// (คุมการจั่วให้ได้ skip พอดีไม่ได้ — เลี่ยงลูป findSeed ที่อาจวนไม่จบ)
function defendingWithHand(hand: CardType[], attacks = 1): GameHandle {
  const settings = settingsFor({ startingHand: 0 })
  const base = createGame(settings, 7)
  const st = base.getState()
  const next = {
    ...st,
    currentTeamIndex: 1,
    phase: 'defending' as const,
    teams: st.teams.map((t, i) =>
      i === 1
        ? { ...t, hand, pendingAttacks: Array.from({ length: attacks }, () => ({ opens: 1 })) }
        : { ...t, hand: [] },
    ),
  }
  return createGameFromState(next, base.serializeSecret(), 7)
}

test('ชุดที่สิบสาม #2: โควตา Skip โชว์แยกจาก Block', () => {
  const h = defendingWithHand(['block', 'skip', 'skip'])
  renderPrompt(h)
  // สองป้ายอยู่คู่กัน แต่นับแยกก้อน — Block 0/1 กับ Skip 0/2
  expect(screen.getByText(/Block 0\/1/)).toBeDefined()
  expect(screen.getByText(/Skip 0\/2/)).toBeDefined()
})

test('ชุดที่สิบสาม #2: ไม่มี Skip ในมือ → ไม่มีปุ่มใช้ Skip', () => {
  const h = defendingWithHand(['block'])
  renderPrompt(h)
  expect(screen.getByText(/Skip 0\/0/)).toBeDefined()
  expect(screen.queryByRole('button', { name: /ใช้ Skip/ })).toBeNull()
})

test('ชุดที่สิบสาม #2: กดปุ่ม Skip ในจังหวะตั้งรับ → ออกจาก phase defending', () => {
  const h = defendingWithHand(['block', 'skip'])
  renderPrompt(h)
  const btn = screen.getByRole('button', { name: /ใช้ Skip/ })
  fireEvent.click(btn)
  const st = h.getState()
  expect(st.phase).not.toBe('defending')
  // ใช้ Skip ไป แต่ Block ยังอยู่ในมือ — โควตาแยกกันจริง
  expect(st.teams[1].hand).not.toContain('skip')
  expect(st.teams[1].hand).toContain('block')
})

test('ชุดที่สิบสาม #3: ปุ่ม Skip บอกจำนวนป้ายที่ข้าม (รวมหนี้โจมตี)', () => {
  // โดนโจมตี 2 ใบ (+1 ป้ายต่อใบ) + ป้ายปกติ 1 = ข้าม 3 ป้าย
  const h = defendingWithHand(['skip'], 2)
  renderPrompt(h)
  expect(screen.getByRole('button', { name: /ข้ามการเปิด 3 ป้าย/ })).toBeDefined()
})
