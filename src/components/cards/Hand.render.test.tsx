import { afterEach, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { cardWidthFor, Hand } from './Hand'
import { GameProvider } from '@/components/game/GameProvider'
import { createGame, type GameHandle } from '@/lib/game/engine'
import { defaultSettings } from '@/lib/game/config'
import { CARD_ART, CARD_BACK, CARD_META } from '@/lib/game/cards'
import type { CardType, GameSettings } from '@/lib/game/types'

afterEach(cleanup)

function settingsFor(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    ...defaultSettings(),
    teamNames: ['ทีม 1', 'ทีม 2', 'ทีม 3'],
    rangeMin: 1,
    rangeMax: 20,
    cardsEnabled: true,
    startingHand: 1,
    glitchEnabled: false,
    ...overrides,
  }
}

// หา seed ที่ทีมแรกได้การ์ดชนิดที่ต้องการ
function gameWith(card: CardType, overrides: Partial<GameSettings> = {}): GameHandle {
  const settings = settingsFor(overrides)
  for (let seed = 0; seed < 30000; seed++) {
    const h = createGame(settings, seed)
    if (h.getState().teams[0].hand.includes(card)) return h
  }
  throw new Error('no seed found')
}

function renderHand(h: GameHandle) {
  return render(
    <GameProvider handle={h}>
      <Hand />
    </GameProvider>,
  )
}

// FIX_LISTS ชุดที่สาม #10: การ์ดในมือเหลือแค่ icon — ไม่มีชื่อ/เลขใบกำกับ
test('ชุดที่สาม #10: การ์ดในมือไม่มีตัวหนังสือ (ชื่อ/เลขใบ) เหลือแค่ icon', () => {
  const h = gameWith('skip')
  renderHand(h)
  const card = screen.getByRole('button', { name: 'การ์ดใบที่ 1' })
  // FIX_LISTS ชุดที่ห้า #1: ใบคว่ำเป็นภาพหลังการ์ด ไม่ใช่ emoji แล้ว
  // จึงไม่มี text node ใด ๆ ในช่องการ์ด (เดิมเช็คว่าเป็น '🃏')
  expect(card.textContent).toBe('')
  expect(screen.queryByText('#1')).toBeNull()
})

// FIX_LISTS ชุดที่สาม #5: กดการ์ดแล้วไปแสดงที่แผงขวา (เหมือน phase บล็อกการโจมตี)
// FIX_LISTS ชุดที่สี่ #1: อยู่กลางจอแนวตั้ง ชิดขวา และไม่มีกรอบ/พื้นหลังแผงครอบการ์ด
test('ชุดที่สี่ #1: กดการ์ดแล้วเปิดกลางจอชิดขวา ไม่มีกรอบครอบการ์ด', () => {
  const h = gameWith('skip')
  renderHand(h)
  // ยังไม่กด = ยังไม่มีแผง
  expect(screen.queryByRole('dialog')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'การ์ดใบที่ 1' }))

  const panel = screen.getByRole('dialog')
  // ต้องเป็นแผงลอยชิดขวา จัดกลางแนวตั้ง (top-1/2 + -translate-y-1/2)
  expect(panel.className).toMatch(/(^| )fixed( |$)/)
  expect(panel.className).toMatch(/(^| )right-3( |$)/)
  expect(panel.className).toMatch(/(^| )top-1\/2( |$)/)
  expect(panel.className).toMatch(/(^| )-translate-y-1\/2( |$)/)
  // ไม่มีกรอบ/พื้นหลัง/เงาแบบแผงอีกแล้ว — ขึ้นแค่การ์ด
  expect(panel.className).not.toMatch(/(^| )border-2( |$)/)
  expect(panel.className).not.toMatch(/rounded-2xl/)
  // ไม่มีหัวข้อ "การ์ดที่เปิดอยู่" และไม่มีคำบรรยายใต้การ์ดแล้ว
  expect(panel.textContent).not.toContain('การ์ดที่เปิดอยู่')
  expect(panel.textContent).not.toContain('ชี้ที่การ์ดเพื่อดูคำอธิบาย')
})

// FIX_LISTS ชุดที่สี่ #1: ภาพการ์ดกว้างเต็มแผง (เท่า panel ขวา) ไม่ใช่ล็อกความสูงเล็ก ๆ
test('ชุดที่สี่ #1: ภาพการ์ดที่เปิดอยู่กว้างเต็มแผง', () => {
  const h = gameWith('skip')
  renderHand(h)
  fireEvent.click(screen.getByRole('button', { name: 'การ์ดใบที่ 1' }))

  const art = screen.getByAltText(CARD_META.skip.name)
  expect(art.className).toMatch(/(^| )w-full( |$)/)
  expect(art.className).not.toMatch(/(^| )h-44( |$)/)
})

// FIX_LISTS ชุดที่สี่ #3: ถังขยะเป็น SVG ขาว-ดำสลับตามธีม ไม่ใช่ emoji 🗑
test('ชุดที่สี่ #3: ปุ่มทิ้งเป็น icon ขาวดำสลับตามธีม', () => {
  const h = gameWith('skip')
  renderHand(h)
  fireEvent.click(screen.getByRole('button', { name: 'การ์ดใบที่ 1' }))

  const btn = screen.getByLabelText('ทิ้งการ์ดใบนี้')
  expect(btn.textContent).not.toContain('🗑')
  expect(btn.querySelector('svg')).not.toBeNull()
  // สว่าง = icon ดำพื้นขาว, มืด = icon ขาวพื้นดำ
  expect(btn.className).toMatch(/(^| )bg-white( |$)/)
  expect(btn.className).toMatch(/(^| )text-black( |$)/)
  expect(btn.className).toMatch(/(^| )dark:bg-black( |$)/)
  expect(btn.className).toMatch(/(^| )dark:text-white( |$)/)
})

// FIX_LISTS ชุดที่สี่ #2 + ชุดที่ห้า #1: การ์ดคว่ำในมือต้องเต็มกรอบ
// emoji เดิมมีขอบว่างในตัว (glyph เล็กกว่า em box) จึงเต็มกรอบไม่ได้ — ต้องเป็น <img>
test('ชุดที่ห้า #1: การ์ดคว่ำในมือเป็นภาพหลังการ์ดเต็มกรอบ ไม่ใช่ emoji', () => {
  const h = gameWith('skip')
  renderHand(h)
  const card = screen.getByRole('button', { name: 'การ์ดใบที่ 1' })
  // ไม่มี p-2 ครอบแล้ว
  expect(card.className).not.toMatch(/(^| )p-2( |$)/)

  // ไม่มี span emoji เหลืออยู่
  expect(card.querySelector('span[aria-hidden="true"]')).toBeNull()
  expect(card.textContent).not.toContain('🃏')

  const back = card.querySelector('img') as HTMLImageElement
  expect(back).not.toBeNull()
  // กว้างเต็มช่อง + สูงตามอัตราส่วนภาพ = เต็มกรอบจริง
  expect(back.className).toMatch(/(^| )w-full( |$)/)
  expect(back.className).toMatch(/(^| )h-auto( |$)/)
  // ใบคว่ำต้องไม่ใช่ภาพหน้าการ์ด (ไม่รั่วว่าเป็นการ์ดอะไร)
  expect(back.getAttribute('src')).not.toBe(CARD_ART.skip)
  expect(back.getAttribute('src')).toBe(CARD_BACK)
})

// FIX_LISTS ชุดที่ห้า #3: โหมด TV หดการ์ดในแถบมือลง กันแถบสูงจนล้นไปทับ header
test('ชุดที่ห้า #3: โหมด TV การ์ดในมือเล็กกว่าโหมด laptop', () => {
  expect(cardWidthFor(5, 'tv')).toBeLessThan(cardWidthFor(5, 'laptop'))
  expect(cardWidthFor(15, 'tv')).toBeLessThan(cardWidthFor(15, 'laptop'))
  expect(cardWidthFor(30, 'tv')).toBeLessThan(cardWidthFor(30, 'laptop'))
  // ไม่ส่ง mode = ขนาดเดิมเป๊ะ (ของเดิมต้องไม่เปลี่ยน)
  expect(cardWidthFor(5)).toBe(cardWidthFor(5, 'laptop'))
})

// #5: ชี้ที่การ์ดในแผง → popup อธิบาย effect
test('ชุดที่สาม #5: ชี้ที่การ์ดแล้วมี popup อธิบาย effect', () => {
  const h = gameWith('skip')
  renderHand(h)
  fireEvent.click(screen.getByRole('button', { name: 'การ์ดใบที่ 1' }))
  expect(screen.queryByRole('tooltip')).toBeNull()

  const art = screen.getByAltText(CARD_META.skip.name)
  fireEvent.mouseEnter(art.parentElement!)
  const tip = screen.getByRole('tooltip')
  expect(tip.textContent).toContain(CARD_META.skip.name)

  fireEvent.mouseLeave(art.parentElement!)
  expect(screen.queryByRole('tooltip')).toBeNull()
})

// #5: ปุ่มเลือกเป็น icon อยู่ใต้/ทับการ์ด — ใช้แล้วการ์ดถูกเล่นจริง
test('ชุดที่สาม #5: ปุ่ม icon "ใช้" เล่นการ์ดจริง', () => {
  const h = gameWith('skip')
  renderHand(h)
  fireEvent.click(screen.getByRole('button', { name: 'การ์ดใบที่ 1' }))

  const before = h.getState().teams[0].hand.length
  fireEvent.click(screen.getByLabelText(`ใช้ ${CARD_META.skip.name}`))
  // Skip จบตาทันที → การ์ดหายจากมือ และเปลี่ยนทีม
  expect(h.getState().teams[0].hand.length).toBe(before - 1)
  expect(h.getState().currentTeamIndex).toBe(1)
})

// #5: ปุ่ม icon "ทิ้ง" ทิ้งการ์ดจริง (ไม่จบตา)
test('ชุดที่สาม #5: ปุ่ม icon "ทิ้ง" ทิ้งการ์ดจริง', () => {
  const h = gameWith('skip')
  renderHand(h)
  fireEvent.click(screen.getByRole('button', { name: 'การ์ดใบที่ 1' }))

  const before = h.getState().teams[0].hand.length
  fireEvent.click(screen.getByLabelText('ทิ้งการ์ดใบนี้'))
  expect(h.getState().teams[0].hand.length).toBe(before - 1)
  expect(h.getState().currentTeamIndex).toBe(0) // ทิ้งแล้วไม่จบตา
})

// FIX #43 ยังต้องอยู่: Block เก็บกลับเข้ามือได้ และไม่มีปุ่ม "ใช้"
test('ชุดที่สาม #5: Block มีปุ่ม "เก็บไว้ก่อน" และไม่มีปุ่มใช้', () => {
  const h = gameWith('block')
  renderHand(h)
  fireEvent.click(screen.getByRole('button', { name: CARD_META.block.name }))

  expect(screen.getByLabelText('เก็บไว้ก่อน')).toBeDefined()
  expect(screen.queryByLabelText(`ใช้ ${CARD_META.block.name}`)).toBeNull()

  fireEvent.click(screen.getByLabelText('เก็บไว้ก่อน'))
  // เก็บกลับแล้วการ์ดยังอยู่ในมือ และแผงปิดไป
  expect(h.getState().teams[0].hand).toContain('block')
  expect(screen.queryByRole('dialog')).toBeNull()
})

// FIX_LISTS ชุดที่หก #2: เอาขอบใส ๆ รอบใบที่เลือกออก (เดิมคือ .card-picked)
// ใบที่เปิดอยู่ไปโชว์เต็มใบที่แผงขวาแล้ว จึงไม่ต้อง mark ซ้ำในแถบมือ
// แต่ aria-pressed ต้องยังบอกสถานะให้ screen reader เหมือนเดิม
test('ชุดที่หก #2: การ์ดที่เลือกไม่มีขอบใส ๆ (card-picked) แล้ว', () => {
  const h = gameWith('skip')
  renderHand(h)
  const card = screen.getByRole('button', { name: 'การ์ดใบที่ 1' })
  expect(card.className).not.toContain('card-picked')

  fireEvent.click(card)
  const after = screen.getByRole('button', { name: 'การ์ดใบที่ 1' })
  expect(after.className).not.toContain('card-picked')
  expect(after.getAttribute('aria-pressed')).toBe('true')
})

// FIX_LISTS ชุดที่หก #3: เอาคำอธิบายใต้การ์ดออก — hover มี popup อธิบายอยู่แล้ว
test('ชุดที่หก #3: ไม่มีคำอธิบายใต้การ์ดในแผงที่เปิดอยู่', () => {
  const h = gameWith('block')
  renderHand(h)
  fireEvent.click(screen.getByRole('button', { name: CARD_META.block.name }))

  const panel = screen.getByRole('dialog')
  expect(panel.textContent).not.toContain('ใช้ตอนทีมอื่นใช้')
  // popup ตอน hover ยังต้องอธิบาย effect ได้เหมือนเดิม
  fireEvent.mouseEnter(screen.getByAltText(CARD_META.block.name).parentElement!)
  expect(screen.getByRole('tooltip').textContent).toContain(CARD_META.block.name)
})

// FIX_LISTS ชุดที่หก #5: ปุ่มหุบ = ปุ่ม minimize มุมขวาบนของขอบแถบ ไม่ใช่ปุ่มยาวในหัวข้อ
test('ชุดที่หก #5: ปุ่มหุบเป็นปุ่ม minimize มุมขวาบน และหุบ/กางได้จริง', () => {
  const h = gameWith('skip')
  renderHand(h)

  const btn = screen.getByLabelText('ย่อเก็บการ์ด')
  expect(btn.className).toMatch(/(^| )absolute( |$)/)
  expect(btn.className).toMatch(/(^| )right-1\.5( |$)/)
  expect(btn.className).toMatch(/(^| )top-1\.5( |$)/)
  // ไม่ใช่ปุ่มข้อความยาว ๆ แบบเดิมแล้ว
  expect(btn.textContent).not.toContain('หุบเก็บ')
  expect(btn.textContent).not.toContain('กางการ์ด')

  // หุบแล้วการ์ดในมือหายไป กดอีกทีกลับมา
  expect(screen.queryByRole('button', { name: 'การ์ดใบที่ 1' })).not.toBeNull()
  fireEvent.click(btn)
  expect(screen.queryByRole('button', { name: 'การ์ดใบที่ 1' })).toBeNull()
  fireEvent.click(screen.getByLabelText(/กางการ์ด/))
  expect(screen.queryByRole('button', { name: 'การ์ดใบที่ 1' })).not.toBeNull()
})

// FIX_LISTS ชุดที่หก #4: แถบการ์ดในมือโปร่งใส และไม่กว้างเต็มจอ
test('ชุดที่หก #4: แถบการ์ดในมือโปร่งใสและกว้างเท่าที่การ์ดต้องใช้', () => {
  const h = gameWith('skip')
  const { container } = renderHand(h)

  const dock = container.querySelector('.hand-dock') as HTMLElement
  expect(dock).not.toBeNull()
  // ไม่กว้างเต็มจอ (w-full) แล้ว — กว้างตามเนื้อหา แต่ไม่ล้นจอ
  expect(dock.className).not.toMatch(/(^| )w-full( |$)/)
  expect(dock.className).toMatch(/(^| )w-fit( |$)/)
  expect(dock.className).toMatch(/(^| )max-w-full( |$)/)
  // ไม่มีเงาแผงทึบ ๆ อีกแล้ว (ความโปร่งใสที่เหลืออยู่ใน .hand-dock ของ globals.css)
  expect(dock.className).not.toMatch(/shadow-2xl/)
})

// FIX_LISTS ชุดที่หก #6: การ์ดที่ต้องเลือกเป้าหมาย (Attack/Scan) แยกเป็น 2 จังหวะ
//   จังหวะ 1 กด ✓ ยืนยันใช้การ์ด → จังหวะ 2 ค่อยขึ้น modal เลือกเป้าหมาย
//   เดิมแผงเลือกทีมโผล่ใต้การ์ดทันทีตั้งแต่เปิดการ์ด และไม่มีปุ่ม ✓ เลย
test('ชุดที่หก #6: Attack ต้องกด ✓ ก่อน modal เลือกทีมถึงจะขึ้น', () => {
  const h = gameWith('attack')
  renderHand(h)
  fireEvent.click(screen.getByRole('button', { name: 'การ์ดใบที่ 1' }))

  // เปิดการ์ดแล้วยังไม่มีแผงเลือกทีม แต่ต้องมีปุ่ม ✓
  expect(screen.queryByText('เลือกทีมเป้าหมาย')).toBeNull()
  const confirm = screen.getByLabelText(`ใช้ ${CARD_META.attack.name}`)

  fireEvent.click(confirm)
  // กด ✓ แล้วยังไม่เล่นการ์ด — แค่เปิด modal ให้เลือกทีม
  expect(h.getState().teams[0].hand).toContain('attack')
  expect(screen.getByText('เลือกทีมเป้าหมาย')).toBeDefined()
})

// modal ต้องอยู่ "กลางซ้ายของการ์ด" — เกาะขอบซ้าย (right-full) และกึ่งกลางแนวตั้ง
test('ชุดที่หก #6: modal เลือกทีมอยู่กลางซ้ายของการ์ด', () => {
  const h = gameWith('attack')
  renderHand(h)
  fireEvent.click(screen.getByRole('button', { name: 'การ์ดใบที่ 1' }))
  fireEvent.click(screen.getByLabelText(`ใช้ ${CARD_META.attack.name}`))

  const modal = screen.getByRole('dialog', { name: 'เลือกทีมเป้าหมาย' })
  expect(modal.className).toMatch(/(^| )absolute( |$)/)
  expect(modal.className).toMatch(/(^| )right-full( |$)/)
  expect(modal.className).toMatch(/(^| )top-1\/2( |$)/)
  expect(modal.className).toMatch(/(^| )-translate-y-1\/2( |$)/)
})

// เลือกทีมแล้วต้องเล่นการ์ดจริง (ส่ง targetTeamId ไปที่ engine)
test('ชุดที่หก #6: เลือกทีมใน modal แล้วการ์ด Attack ถูกเล่นจริง', () => {
  const h = gameWith('attack')
  renderHand(h)
  fireEvent.click(screen.getByRole('button', { name: 'การ์ดใบที่ 1' }))
  fireEvent.click(screen.getByLabelText(`ใช้ ${CARD_META.attack.name}`))

  const before = h.getState().teams[0].hand.length
  // Attack ใช้กับทีมตัวเองไม่ได้ (FIX #23) — ปุ่มที่ขึ้นต้องไม่มีทีมตัวเอง
  expect(screen.queryByRole('button', { name: 'ทีม 1' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'ทีม 2' }))

  expect(h.getState().teams[0].hand.length).toBe(before - 1)
})

// ยกเลิกได้ — กลับไปจังหวะที่ยังเลือก ใช้/ทิ้ง ได้อยู่ ไม่ใช่เล่นการ์ดไปแล้ว
test('ชุดที่หก #6: กดยกเลิกใน modal แล้วกลับมาเลือกใช้/ทิ้งได้เหมือนเดิม', () => {
  const h = gameWith('attack')
  renderHand(h)
  fireEvent.click(screen.getByRole('button', { name: 'การ์ดใบที่ 1' }))
  fireEvent.click(screen.getByLabelText(`ใช้ ${CARD_META.attack.name}`))

  fireEvent.click(screen.getByLabelText('ยกเลิกการเลือกเป้าหมาย'))
  expect(screen.queryByText('เลือกทีมเป้าหมาย')).toBeNull()
  // การ์ดยังอยู่ในมือ และยังกดใช้/ทิ้งได้
  expect(h.getState().teams[0].hand).toContain('attack')
  expect(screen.getByLabelText(`ใช้ ${CARD_META.attack.name}`)).toBeDefined()
  expect(screen.getByLabelText('ทิ้งการ์ดใบนี้')).toBeDefined()
})

// FIX_LISTS ชุดที่เจ็ด #2: Scan ไม่มีช่องกรอกเลขแล้ว — กด ✓ แล้วการ์ดหายไปจากจอ
//   แล้วส่งต่อให้ GameScreen เปิดโหมดเลือกช่องบนกระดาน
test('ชุดที่เจ็ด #2: Scan กด ✓ แล้วการ์ดหายจากจอ และแจ้ง onPickCell แทนช่องกรอกเลข', () => {
  const h = gameWith('scan')
  const picks: { card: CardType; index: number }[] = []
  render(
    <GameProvider handle={h}>
      <Hand onPickCell={(card, index) => picks.push({ card, index })} />
    </GameProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'การ์ดใบที่ 1' }))

  // ไม่มีช่องกรอกเลขให้พิมพ์อีกแล้ว ทั้งก่อนและหลังกด ✓
  expect(screen.queryByPlaceholderText('เลขเป้า')).toBeNull()
  fireEvent.click(screen.getByLabelText(`ใช้ ${CARD_META.scan.name}`))
  expect(screen.queryByPlaceholderText('เลขเป้า')).toBeNull()

  // การ์ดหายจากจอ (แผงขวาปิด) แต่ยังอยู่ในมือ — ยังไม่ถูกเล่นจนกว่าจะเลือกช่อง
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(h.getState().teams[0].hand).toContain('scan')

  // ส่ง index ที่ถูกต้องออกไปให้ GameScreen ใช้ตอน PLAY_CARD
  const idx = h.getState().teams[0].hand.indexOf('scan')
  expect(picks).toEqual([{ card: 'scan', index: idx }])
})

// FIX_LISTS ชุดที่เจ็ด #5: การ์ดเคยล้นไปทับช่องริมขวาของกระดานจนกดไม่ได้
//   ต้นเหตุคือความกว้างล็อกเป็น 18.75rem (คอลัมน์ขวาของโหมด Laptop) แต่โหมด TV
//   คอลัมน์ขวาแคบเป็น 13rem — การ์ดจึงกินเข้ามาในคอลัมน์กลาง
//   ความกว้างต้องผูกกับ --mn-card-col ที่ GameScreen ประกาศตามโหมด ไม่ใช่ค่าคงที่
test('ชุดที่เจ็ด #5: ความกว้างการ์ดผูกกับ --mn-card-col ไม่ใช่ค่าคงที่', () => {
  const h = gameWith('skip')
  renderHand(h)
  fireEvent.click(screen.getByRole('button', { name: 'การ์ดใบที่ 1' }))

  const panel = screen.getByRole('dialog')
  expect(panel.className).toContain('var(--mn-card-col')
  // ต้องไม่มี w-[...] ที่ขึ้นต้นด้วย 18.75rem ตรง ๆ อีกแล้ว
  expect(panel.className).not.toMatch(/w-\[min\(18\.75rem/)
})

// FIX_LISTS ชุดที่แปด #4: ปุ่มที่ใช้งานเกี่ยวกับการ์ด (ใช้/ทิ้ง/เก็บ) ต้อง "คร่อมการ์ด
//   ไปครึ่งปุ่ม" — ครึ่งบนทับภาพการ์ด ครึ่งล่างพ้นออกมาใต้ภาพ
//   ทำด้วย bottom-6 (= ความสูงแถบ pb-6 ที่เผื่อไว้) + translate-y-1/2 (เลื่อนลงครึ่งปุ่ม)
test('ชุดที่แปด #4: แถวปุ่มของการ์ดคร่อมขอบล่างของภาพครึ่งปุ่ม', () => {
  const h = gameWith('skip')
  renderHand(h)
  fireEvent.click(screen.getByRole('button', { name: 'การ์ดใบที่ 1' }))

  const useBtn = screen.getByLabelText(/^ใช้ /)
  const row = useBtn.parentElement!
  // เลื่อนลงครึ่งความสูงปุ่ม = ครึ่งปุ่มพ้นขอบล่างภาพ
  expect(row.className).toContain('translate-y-1/2')
  // ยึดกับขอบล่างของภาพ (bottom-6 = แถบ pb-6 ที่เผื่อไว้ใต้ภาพ) ไม่ใช่ bottom-0
  expect(row.className).toContain('bottom-6')
  expect(row.className).not.toMatch(/\bbottom-0\b/)

  // ปุ่มยังเป็นขนาดเดิม (h-12) — ครึ่งปุ่ม = 24px = ความสูงของ pb-6 พอดี
  expect(useBtn.className).toContain('h-12')
  expect(row.parentElement!.className).toContain('pb-6')
})
