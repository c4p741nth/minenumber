import { afterEach, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { SetupScreen } from './SetupScreen'
import {
  autoCellsFor,
  bombQuota,
  defaultSettings,
  defaultTeamNames,
  glitchCountFor,
} from '@/lib/game/config'
import { CARD_DECK_SIZE } from '@/lib/game/cards'

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

// FIX_LISTS #1: ช่องตั้งต้น = ระเบิดจริง + glitch + การ์ดในสำรับ
// ตัวอย่างจากโจทย์: 8 ทีม → ระเบิดจริง 7 + glitch + การ์ด 10 ชนิด
// เช็คว่าเลขที่โชว์มาจากสูตร ไม่ใช่ค่า rangeMax ที่ส่งเข้ามา
function cellsInput(): HTMLInputElement {
  // ช่องกรอกอยู่ใน <label>ช่อง<input/></label> — หาจาก label ที่ข้อความขึ้นต้นว่า "ช่อง"
  const labels = Array.from(document.querySelectorAll('label'))
  const label = labels.find((l) => l.textContent?.trim().startsWith('ช่อง'))
  const input = label?.querySelector('input[type="number"]') as HTMLInputElement | null
  if (!input) throw new Error('หาช่องกรอกจำนวนช่องไม่เจอ')
  return input
}

test('FIX_LISTS #1: cells default to bombs + glitch + deck size', () => {
  const initial = {
    ...defaultSettings(),
    teamNames: defaultTeamNames(8),
    rangeMax: 60, // ค่าเก่าที่ควรถูกแทนที่ด้วยค่าอัตโนมัติ
  }
  render(<SetupScreen initial={initial} onStart={() => {}} onBack={() => {}} />)

  const quota = bombQuota(8)
  const glitch = glitchCountFor(quota, 9999, initial.glitchMode, initial.glitchRatio, 0)
  const expected = autoCellsFor(quota, glitch, CARD_DECK_SIZE)

  // ยืนยันว่าสูตรให้ค่าที่ต่างจาก rangeMax เดิมจริง ไม่งั้นเทสผ่านแบบว่างเปล่า
  expect(expected).not.toBe(60)
  expect(Number(cellsInput().value)).toBe(expected)
})

// FIX_LISTS #2/#15: ตั้งช่อง = จำนวนระเบิดจริงได้ (โอกาสโดน 100% → เข้า cut wire ทันที)
test('FIX_LISTS #2/#15: minimum cells equals the real bomb count', () => {
  const initial = { ...defaultSettings(), teamNames: defaultTeamNames(8) }
  render(<SetupScreen initial={initial} onStart={() => {}} onBack={() => {}} />)
  // 8 ทีม → ระเบิดจริง 7 → ตั้งได้ต่ำสุด 7 ช่อง (เดิมบังคับ 8 = จำนวนทีม)
  expect(cellsInput().min).toBe(String(bombQuota(8)))
})
