import { afterEach, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { VolumeControl } from './VolumeControl'
import { getSfxVolume, setSfxVolume } from '@/lib/audio/sfx'

afterEach(cleanup)

// FIX_LISTS ชุดใหม่ #5: ปรับระดับเสียงได้ขณะเล่น
// FIX_LISTS ชุดที่สาม #4: แถบเลื่อนกางอยู่ตลอด ไม่ต้องกดปุ่มให้บานก่อน
test('ชุดที่สาม #4: แถบเลื่อนโผล่มาเลย ไม่ต้องกดปุ่มลำโพงก่อน', () => {
  render(<VolumeControl />)
  expect(screen.getByLabelText('ระดับเสียง Effect')).toBeDefined()
})

test('ชุดใหม่ #5: เลื่อนแถบแล้วระดับเสียงของเกมเปลี่ยนทันที', () => {
  setSfxVolume(0.8)
  render(<VolumeControl />)
  const slider = screen.getByLabelText('ระดับเสียง Effect')
  fireEvent.change(slider, { target: { value: '35' } })
  // มีผลกับโมดูลเสียงจริง ไม่ใช่แค่ state ใน component
  expect(Math.round(getSfxVolume() * 100)).toBe(35)
  expect(screen.getByText('35%')).toBeDefined()
})

test('ชุดใหม่ #5: เริ่มต้นด้วยค่าระดับเสียงปัจจุบันของเกม ไม่ใช่ค่า default ซ้อน', () => {
  setSfxVolume(0.42)
  render(<VolumeControl />)
  expect(screen.getByText('42%')).toBeDefined()
})

// FIX_LISTS ชุดที่สาม #4: เลื่อนไป 0 = ปิดเสียง
test('ชุดที่สาม #4: เลื่อนไป 0 เท่ากับปิดเสียง และ icon เปลี่ยนเป็นเงียบ', () => {
  setSfxVolume(0.8)
  render(<VolumeControl />)
  fireEvent.change(screen.getByLabelText('ระดับเสียง Effect'), { target: { value: '0' } })
  expect(getSfxVolume()).toBe(0)
  expect(screen.getByText('🔇')).toBeDefined()
})

// ปุ่มลำโพง: กด mute เหลือ 0 ทันที กดอีกทีคืนค่าเดิม
test('กดลำโพงแล้วเสียงเหลือ 0 ทันที', () => {
  setSfxVolume(0.7)
  render(<VolumeControl />)
  fireEvent.click(screen.getByLabelText('ปิดเสียง'))
  expect(getSfxVolume()).toBe(0)
  expect(screen.getByText('0%')).toBeDefined()
  expect(screen.getByText('🔇')).toBeDefined()
})

test('กดลำโพงอีกทีคืนระดับเสียงเดิม', () => {
  setSfxVolume(0.65)
  render(<VolumeControl />)
  fireEvent.click(screen.getByLabelText('ปิดเสียง'))
  fireEvent.click(screen.getByLabelText('เปิดเสียง'))
  expect(Math.round(getSfxVolume() * 100)).toBe(65)
  expect(screen.getByText('65%')).toBeDefined()
  expect(screen.getByText('🔊')).toBeDefined()
})

test('เลื่อนแถบไป 0 เองแล้วกดลำโพง ต้องคืนค่าก่อนหน้านั้น', () => {
  setSfxVolume(0.9)
  render(<VolumeControl />)
  const slider = screen.getByLabelText('ระดับเสียง Effect')
  fireEvent.change(slider, { target: { value: '30' } })
  fireEvent.change(slider, { target: { value: '0' } })
  // เงียบอยู่แล้ว กดปุ่มต้องเปิดกลับเป็น 30 (ค่าล่าสุดที่ยังมีเสียง)
  fireEvent.click(screen.getByLabelText('เปิดเสียง'))
  expect(Math.round(getSfxVolume() * 100)).toBe(30)
})

test('เริ่มเกมมาตอนเสียงเป็น 0 อยู่แล้ว กดลำโพงต้องมีเสียงกลับมา', () => {
  setSfxVolume(0)
  render(<VolumeControl />)
  fireEvent.click(screen.getByLabelText('เปิดเสียง'))
  expect(getSfxVolume()).toBeGreaterThan(0)
})
