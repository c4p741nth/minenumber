import { afterEach, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Board } from './Board'

afterEach(cleanup)

function renderBoard(rangeMax: number) {
  const { container } = render(
    <Board rangeMin={1} rangeMax={rangeMax} cells={{}} disabled={false} onOpen={() => {}} />,
  )
  return container
}

test('Board renders one button per cell', () => {
  const container = renderBoard(30)
  expect(container.querySelectorAll('button').length).toBe(30)
})

// B8: กระดาน 200 ช่องเคยดันหน้าให้ยาวมาก — ต้อง scroll ในกรอบตัวเอง ไม่ใช่ดันทั้งหน้า
// (Board ห่อด้วย wrapper flex อีกชั้นสำหรับแถบยืนยัน FIX #16 — grid คือ div ตัวใน)
// FIX_LISTS ชุดที่สิบ #1: เลิกล็อกด้วย max-h-[100vh-Xrem] (เดาความสูงหัวเว็บผิดได้)
//   เปลี่ยนเป็นยืดตามที่ว่างที่พ่อแม่เหลือให้ = flex-1 + min-h-0 แล้ว scroll ในนั้น
test('Board scrolls within its own box instead of stretching the page (B8)', () => {
  const grid = renderBoard(200).querySelector('[style*="grid-template-columns"]')
  expect(grid?.className).toContain('overflow-y-auto')
  expect(grid?.className).toContain('flex-1')
  expect(grid?.className).toContain('min-h-0')
  // ต้องไม่กลับไปล็อกความสูงตายตัวจาก viewport อีก
  expect(grid?.className).not.toContain('max-h-[calc(100vh')
})

// FIX_LISTS ชุดที่สิบ #1: ตัวที่ scroll ต้องเป็น "ตารางป้าย" เท่านั้น
//   wrapper ชั้นนอกของ Board ห้าม scroll — ไม่งั้นแถบ "ตาทีม X" ที่อยู่เหนือกระดาน
//   จะถูกเลื่อนหลุดจอไปพร้อมกับป้าย ซึ่งเป็นบั๊กที่แก้รอบนี้พอดี
test('only the tile grid scrolls, not the Board wrapper (FIX_LISTS 10 #1)', () => {
  const wrapper = renderBoard(200).firstElementChild
  expect(wrapper?.className).not.toContain('overflow-y-auto')
  expect(wrapper?.className).toContain('min-h-0')
})

// ขนาดช่องต้องถูกส่งผ่าน inline style จริง ๆ — Tailwind ไม่ generate class จากตัวแปร
// ถ้าใครเผลอย้ายกลับไปใช้ class เช่น min-h-[56px] เทสนี้จะแดง
test('Board cell size is applied via inline style and shrinks on big boards (B8)', () => {
  const small = renderBoard(30).querySelector('button')
  const big = renderBoard(200).querySelector('button')
  expect(small?.getAttribute('style')).toContain('56px')
  expect(big?.getAttribute('style')).toContain('40px')
})

test('Board grid template uses the computed cell size (B8)', () => {
  const grid = renderBoard(200).querySelector('[style*="grid-template-columns"]')
  expect(grid?.getAttribute('style')).toContain('40px')
})

// FIX_LISTS: ที่เผื่อให้แถบการ์ดในมือ (fixed ทับด้านล่าง) ต้องเป็น margin ไม่ใช่ padding
//   padding นับเป็นความสูง "เนื้อหา" ของกรอบที่ scroll → เนื้อหาสูงเกินกรอบเสมอ
//   ทำให้มีแถบเลื่อนโผล่ทั้งที่ป้ายยังไม่ล้นขอบ (บั๊กที่เจอในโหมด TV: ป้ายไม่กี่แถว
//   แต่ยังเห็นแถบเลื่อน) — margin อยู่นอกกล่อง จึงหดกรอบลงแทนที่จะดันเนื้อหา
//
//   และค่าต้องมาจาก --mn-hand-h ที่ Hand วัดความสูงจริง ไม่ใช่ px คงที่ (pb-84 = 336px)
//   เพราะโหมด TV แถบการ์ดโตตาม --mn-scale จนเลข 336px กันไม่พอ
test('board defers the hand-bar strip to .board-grid, never to a fixed pb-84', () => {
  const grid = renderBoard(200).querySelector('[style*="grid-template-columns"]')
  const style = grid?.getAttribute('style') ?? ''

  // ที่ว่างใต้กระดานถูกจัดการใน .board-grid (globals.css) ด้วย --mn-hand-h ที่ Hand
  // วัดความสูงจริงไว้ ไม่ใช่ตัวเลข px คงที่ใน JSX
  // เขียนเป็นคลาสเพราะ jsdom ทิ้งค่า var() ใน inline style — เทสจึงตรวจจาก class
  expect(grid?.className).toContain('board-grid')

  // ห้ามกลับไปดันเนื้อหาด้วย padding ล่างก้อนใหญ่ตายตัว ไม่ว่าจะเป็น class หรือ inline
  expect(grid?.className).not.toContain('pb-84')
  expect(style).not.toContain('padding-bottom')
})

// ---- FIX_LISTS ชุดที่สาม ----

// #8: ไม่มีปุ่มยืนยันใต้กระดานแล้ว — กดช่องเดิมซ้ำ 2 ครั้งเพื่อเปิด
test('ชุดที่สาม #8: กดช่องเดิมซ้ำ 2 ครั้งเพื่อเปิด ไม่มีปุ่มยืนยัน', () => {
  const opened: number[] = []
  render(
    <Board rangeMin={1} rangeMax={9} cells={{}} disabled={false} onOpen={(c) => opened.push(c)} />,
  )
  const cell = screen.getByRole('button', { name: '5' })

  // กดครั้งแรก = เลือกไว้เฉย ๆ ยังไม่เปิด
  fireEvent.click(cell)
  expect(opened).toEqual([])
  expect(cell.getAttribute('aria-pressed')).toBe('true')
  // ต้องไม่มีปุ่มยืนยัน/ยกเลิกโผล่มาให้ต้องเลื่อนจอลงไปกด
  expect(screen.queryByText(/ยืนยันเปิด/)).toBeNull()
  expect(screen.queryByText(/^ยกเลิก$/)).toBeNull()

  // กดช่องเดิมซ้ำ = เปิดจริง
  fireEvent.click(cell)
  expect(opened).toEqual([5])
})

// #8: กดช่องอื่นระหว่างที่เลือกค้างอยู่ = ย้ายที่เลือก ไม่ใช่เปิดช่องนั้นทันที
test('ชุดที่สาม #8: กดช่องอื่นระหว่างเลือกค้าง = ย้ายที่เลือก ไม่เปิด', () => {
  const opened: number[] = []
  render(
    <Board rangeMin={1} rangeMax={9} cells={{}} disabled={false} onOpen={(c) => opened.push(c)} />,
  )
  fireEvent.click(screen.getByRole('button', { name: '3' }))
  fireEvent.click(screen.getByRole('button', { name: '7' }))
  expect(opened).toEqual([])
  expect(screen.getByRole('button', { name: '3' }).getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByRole('button', { name: '7' }).getAttribute('aria-pressed')).toBe('true')

  fireEvent.click(screen.getByRole('button', { name: '7' }))
  expect(opened).toEqual([7])
})

// #3: ช่องที่สแกนแล้วมีสีขอบบอกผลของโซน (แดง = อาจมีระเบิด, ฟ้า = ปลอดภัย)
// FIX_LISTS ชุดที่เจ็ด #4: ปลอดภัยเปลี่ยนจากเขียวเป็นฟ้า — เขียว neon สงวนให้ "กำลังสแกน"
test('ชุดที่สาม #3: ช่องที่สแกนแล้วได้ขอบสีตามผล และช่องที่ยังไม่สแกนไม่มี', () => {
  render(
    <Board
      rangeMin={1}
      rangeMax={9}
      cells={{}}
      disabled={false}
      onOpen={() => {}}
      scanMarks={{ 2: true, 3: false }}
    />,
  )
  const bomb = screen.getByRole('button', { name: '2' })
  const safe = screen.getByRole('button', { name: '3' })
  const none = screen.getByRole('button', { name: '9' })

  expect(bomb.className).toContain('border-red-500')
  expect(bomb.getAttribute('title')).toContain('มีระเบิด')
  expect(safe.className).toContain('border-sky-500')
  expect(safe.getAttribute('title')).toContain('ปลอดภัย')
  expect(none.className).toContain('border-border')
  expect(none.getAttribute('title')).toBeNull()
})

// FIX_LISTS ชุดที่เจ็ด #4: สีต้อง "สื่อ" และแยกความหมายกันจริง —
// เขียว = กำลังจะสแกน, แดง = มีระเบิดในโซน, ฟ้า = ปลอดภัย
// ช่องที่ปลอดภัยต้องไม่เขียวอีกแล้ว ไม่งั้นชนกับความหมายของ preview
test('ชุดที่เจ็ด #4: ช่องปลอดภัยไม่ใช้สีเขียวแล้ว (กันชนกับสีของ preview สแกน)', () => {
  render(
    <Board
      rangeMin={1}
      rangeMax={9}
      cells={{}}
      disabled={false}
      onOpen={() => {}}
      scanMarks={{ 3: false }}
    />,
  )
  const safe = screen.getByRole('button', { name: '3' })
  expect(safe.className).not.toContain('emerald')
  expect(safe.className).not.toContain('green')
})

// ---- FIX_LISTS ชุดที่เจ็ด: โหมดเลือกช่องที่จะสแกน ----

function renderScanPicking(picked: number[], radius = 2) {
  return render(
    <Board
      rangeMin={1}
      rangeMax={9}
      cells={{}}
      disabled={false}
      onOpen={() => {}}
      scanPicking
      scanRadius={radius}
      onScanPick={(c) => picked.push(c)}
    />,
  )
}

// #3: hover แล้วต้องเห็น "ขอบเขตการสแกนถึงไหน" เป็นสีเขียว neon ทั้งโซน
test('ชุดที่เจ็ด #3: hover ตอนเลือกช่องสแกน → ทั้งโซนในรัศมีเรืองเขียว neon', () => {
  renderScanPicking([], 2)
  const center = screen.getByRole('button', { name: '5' })

  // ยังไม่ hover = ยังไม่มีช่องไหนเรือง
  expect(document.querySelectorAll('.cell-scan-preview').length).toBe(0)

  fireEvent.mouseEnter(center)
  // รัศมี 2 รอบเลข 5 = 3,4,5,6,7 รวม 5 ช่อง
  for (const n of [3, 4, 5, 6, 7]) {
    expect(screen.getByRole('button', { name: String(n) }).className).toContain('cell-scan-preview')
  }
  // ช่องนอกรัศมีต้องไม่เรือง
  for (const n of [1, 2, 8, 9]) {
    expect(screen.getByRole('button', { name: String(n) }).className).not.toContain(
      'cell-scan-preview',
    )
  }
  // สีเขียว neon (ไม่ใช่ primary/ฟ้า/แดง)
  expect(center.className).toContain('border-emerald-400')

  fireEvent.mouseLeave(center)
  expect(document.querySelectorAll('.cell-scan-preview').length).toBe(0)
})

// โซน preview ต้องถูกตัดที่ขอบกระดาน ไม่ล้นออกไปนอกช่วงเลข
test('ชุดที่เจ็ด #3: โซน preview ตัดที่ขอบกระดาน', () => {
  renderScanPicking([], 3)
  fireEvent.mouseEnter(screen.getByRole('button', { name: '2' }))
  // รัศมี 3 รอบเลข 2 = -1..5 แต่กระดานเริ่มที่ 1 → เรืองแค่ 1–5
  for (const n of [1, 2, 3, 4, 5]) {
    expect(screen.getByRole('button', { name: String(n) }).className).toContain('cell-scan-preview')
  }
  expect(screen.getByRole('button', { name: '6' }).className).not.toContain('cell-scan-preview')
})

// #2: คลิกครั้งเดียวเลือกช่องสแกนเลย — ไม่ใช่กดย้ำ 2 ครั้งเหมือนตอนเปิดป้าย
test('ชุดที่เจ็ด #2: ตอนเลือกช่องสแกน กดครั้งเดียวเลือกเลย ไม่ต้องกดย้ำ', () => {
  const picked: number[] = []
  renderScanPicking(picked)

  fireEvent.click(screen.getByRole('button', { name: '4' }))
  expect(picked).toEqual([4])
})

// #2: โหมดสแกนต้องไม่ไปเปิดป้ายโดยไม่ตั้งใจ (onOpen ห้ามถูกเรียก)
test('ชุดที่เจ็ด #2: ตอนเลือกช่องสแกน คลิกช่องไม่เปิดป้าย', () => {
  const opened: number[] = []
  const picked: number[] = []
  render(
    <Board
      rangeMin={1}
      rangeMax={9}
      cells={{}}
      disabled={false}
      onOpen={(c) => opened.push(c)}
      scanPicking
      scanRadius={1}
      onScanPick={(c) => picked.push(c)}
    />,
  )
  const cell = screen.getByRole('button', { name: '6' })
  fireEvent.click(cell)
  fireEvent.click(cell)
  expect(opened).toEqual([])
  expect(picked).toEqual([6, 6])
})

// ออกจากโหมดสแกนแล้วต้องกลับไปเป็นกดย้ำ 2 ครั้งเหมือนเดิม (ไม่มีสถานะค้าง)
test('ชุดที่เจ็ด #2: ออกจากโหมดสแกนแล้วกลับไปกดย้ำ 2 ครั้งเหมือนเดิม', () => {
  const opened: number[] = []
  const { rerender } = render(
    <Board
      rangeMin={1}
      rangeMax={9}
      cells={{}}
      disabled={false}
      onOpen={(c) => opened.push(c)}
      scanPicking
      scanRadius={1}
      onScanPick={() => {}}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '5' }))

  rerender(
    <Board rangeMin={1} rangeMax={9} cells={{}} disabled={false} onOpen={(c) => opened.push(c)} />,
  )
  // ช่องที่เคยคลิกตอนโหมดสแกนต้องไม่ถูกจำไว้เป็น "เลือกรอเปิด"
  expect(screen.getByRole('button', { name: '5' }).getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(screen.getByRole('button', { name: '5' }))
  expect(opened).toEqual([])
  fireEvent.click(screen.getByRole('button', { name: '5' }))
  expect(opened).toEqual([5])
})

// ---- FIX_LISTS ชุดที่สิบสอง #1: ข้อความ "เลือกช่อง X" ย้ายไปแถบบน ----

// บรรทัดสถานะใต้กระดานต้องหายไป — ย้ายขึ้นไปอยู่ในแถบ TurnPrompt แล้ว
test('ชุดที่สิบสอง #1: ไม่มีบรรทัด "กดช่องเดิมอีกครั้งเพื่อเปิด" ใต้กระดานแล้ว', () => {
  render(<Board rangeMin={1} rangeMax={9} cells={{}} disabled={false} onOpen={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '4' }))
  // ช่องยังถูกเลือก (ไฮไลต์อยู่ในกระดาน) แต่ข้อความไม่ได้อยู่ใน Board อีกแล้ว
  expect(screen.getByRole('button', { name: '4' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByText(/กดช่องเดิมอีกครั้งเพื่อเปิด/)).toBeNull()
})

// ช่องที่เลือกต้องรายงานขึ้นไปให้ตัวแม่ (GameScreen) เอาไปแสดงบนแถบด้านบน
test('ชุดที่สิบสอง #1: onPickedChange รายงานช่องที่เลือก/ยกเลิกขึ้นไปให้ตัวแม่', () => {
  const seen: (number | null)[] = []
  render(
    <Board
      rangeMin={1}
      rangeMax={9}
      cells={{}}
      disabled={false}
      onOpen={() => {}}
      onPickedChange={(c) => seen.push(c)}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '4' }))
  expect(seen.at(-1)).toBe(4)

  // ย้ายไปช่องอื่น → รายงานช่องใหม่
  fireEvent.click(screen.getByRole('button', { name: '6' }))
  expect(seen.at(-1)).toBe(6)

  // กดย้ำเพื่อเปิด → ล้างค่า (ข้อความบนแถบต้องหายพร้อมกัน)
  fireEvent.click(screen.getByRole('button', { name: '6' }))
  expect(seen.at(-1)).toBeNull()
})

// ---- FIX_LISTS ชุดที่สิบสอง #2: ระเบิดถูกสุ่มใหม่ → ขอบช่องที่สแกนแล้วต้องหายไป ----

// เอนจินล้าง scanMarks ให้แล้วตอน Shuffle (ดู cards.test.ts) — ที่นี่ยืนยันฝั่งหน้าจอว่า
// พอ scanMarks ว่าง ขอบสีบนกระดานหายจริง ไม่ค้างเป็นข้อมูลเก่าที่หลอกผู้เล่น
test('ชุดที่สิบสอง #2: scanMarks ถูกล้าง → ขอบสีของช่องที่เคยสแกนหายไปหมด', () => {
  const { rerender } = render(
    <Board
      rangeMin={1}
      rangeMax={9}
      cells={{}}
      disabled={false}
      onOpen={() => {}}
      scanMarks={{ 2: true, 3: true, 4: false }}
    />,
  )
  expect(screen.getByRole('button', { name: '2' }).className).toContain('border-red-500')
  expect(screen.getByRole('button', { name: '4' }).className).toContain('border-sky-500')

  // ระเบิดย้ายที่ (Shuffle) → เอนจินส่ง scanMarks ว่างกลับมา
  rerender(
    <Board rangeMin={1} rangeMax={9} cells={{}} disabled={false} onOpen={() => {}} scanMarks={{}} />,
  )
  for (const n of ['2', '3', '4']) {
    const cell = screen.getByRole('button', { name: n })
    expect(cell.className).toContain('border-border')
    expect(cell.className).not.toContain('border-red-500')
    expect(cell.className).not.toContain('border-sky-500')
    // title ที่บอกว่า "เคยสแกนแล้ว" ต้องหายไปด้วย
    expect(cell.getAttribute('title')).toBeNull()
  }
})
