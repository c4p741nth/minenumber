import { afterEach, expect, test } from 'bun:test'
import { cleanup, render } from '@testing-library/react'
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
test('Board scrolls within its own box instead of stretching the page (B8)', () => {
  const grid = renderBoard(200).querySelector('[style*="grid-template-columns"]')
  expect(grid?.className).toContain('overflow-y-auto')
  expect(grid?.className).toContain('max-h-[calc(100vh-20rem)]')
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
