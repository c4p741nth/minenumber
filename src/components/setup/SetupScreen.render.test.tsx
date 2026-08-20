import { afterEach, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { SetupScreen } from './SetupScreen'
import { defaultSettings } from '@/lib/game/config'

afterEach(cleanup)

// B1: <Dialog.Trigger> เคยอยู่นอก <Dialog.Root> → Base UI throw ตอน render
// → SetupScreen crash ทั้งหน้า เห็นเป็น "จอว่างเปล่า" แต่เทส logic 120 ตัวผ่านหมด
// เทสนี้คือด่านที่ควรจะจับบั๊กนั้นได้: แค่ render ได้โดยไม่ throw ก็พอ
test('SetupScreen renders without throwing (B1 regression)', () => {
  expect(() =>
    render(<SetupScreen initial={defaultSettings()} onStart={() => {}} onBack={() => {}} />),
  ).not.toThrow()
})

test('SetupScreen shows the start button and settings trigger', () => {
  render(<SetupScreen initial={defaultSettings()} onStart={() => {}} onBack={() => {}} />)
  // ถ้า component crash ตอน render ทั้งสองอันนี้จะหาไม่เจอ
  expect(screen.getByText(/ตั้งค่าเพิ่มเติม/)).toBeDefined()
  expect(document.querySelectorAll('button').length).toBeGreaterThan(0)
})
