import { afterEach, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { VolumeControl } from './VolumeControl'
import { getSfxVolume, setSfxVolume } from '@/lib/audio/sfx'

afterEach(cleanup)

// FIX_LISTS ชุดใหม่ #5: ปรับระดับเสียงได้ขณะเล่น
test('ชุดใหม่ #5: กดปุ่มลำโพงแล้วมีแถบเลื่อนให้ปรับระดับเสียง', () => {
  render(<VolumeControl />)
  // ตอนแรกยังไม่บาน — ไม่มีแถบเลื่อน
  expect(screen.queryByLabelText('ระดับเสียง Effect')).toBeNull()
  fireEvent.click(screen.getByLabelText('ปรับระดับเสียง'))
  expect(screen.getByLabelText('ระดับเสียง Effect')).toBeDefined()
})

test('ชุดใหม่ #5: เลื่อนแถบแล้วระดับเสียงของเกมเปลี่ยนทันที', () => {
  setSfxVolume(0.8)
  render(<VolumeControl />)
  fireEvent.click(screen.getByLabelText('ปรับระดับเสียง'))
  const slider = screen.getByLabelText('ระดับเสียง Effect')
  fireEvent.change(slider, { target: { value: '35' } })
  // มีผลกับโมดูลเสียงจริง ไม่ใช่แค่ state ใน component
  expect(Math.round(getSfxVolume() * 100)).toBe(35)
  expect(screen.getByText('35%')).toBeDefined()
})

test('ชุดใหม่ #5: เริ่มต้นด้วยค่าระดับเสียงปัจจุบันของเกม ไม่ใช่ค่า default ซ้อน', () => {
  setSfxVolume(0.42)
  render(<VolumeControl />)
  fireEvent.click(screen.getByLabelText('ปรับระดับเสียง'))
  expect(screen.getByText('42%')).toBeDefined()
})
