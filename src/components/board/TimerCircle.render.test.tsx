import { afterEach, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TimerCircle } from './TimerCircle'

afterEach(cleanup)

// FIX_LISTS ชุดที่สาม #14: กดที่วงนับถอยหลัง = เริ่มจับเวลาใหม่จากเต็ม
test('ชุดที่สาม #14: กดวงนับถอยหลังแล้วเวลากลับไปเต็ม', async () => {
  render(
    <TimerCircle duration={30} phase="cards" turnKey={1} onTimeout={() => {}} />,
  )
  const ring = screen.getByRole('button', { name: 'เริ่มจับเวลาใหม่' })
  expect(screen.getByText('30')).toBeDefined()

  // ปล่อยให้เดินไป 1 วินาที (setTimeout ภายในของ TimerCircle)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 1100))
  })
  expect(screen.getByText('29')).toBeDefined()

  fireEvent.click(ring)
  expect(screen.getByText('30')).toBeDefined()
})

// ไม่ได้จับเวลา (duration 0) → ไม่ต้องเป็นปุ่มให้กด
test('ชุดที่สาม #14: ไม่จับเวลา → วงนับถอยหลังไม่ใช่ปุ่ม', () => {
  render(<TimerCircle duration={0} phase="cards" turnKey={1} onTimeout={() => {}} />)
  expect(screen.queryByRole('button', { name: 'เริ่มจับเวลาใหม่' })).toBeNull()
})
