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
// FIX_LISTS #3: "ระเบิดจริงอย่างเดียว" คือกรณีที่ปิด option อื่นหมด
test('FIX_LISTS #2/#15: minimum cells equals the real bomb count (no other options on)', () => {
  const initial = {
    ...defaultSettings(),
    teamNames: defaultTeamNames(8),
    cardsEnabled: false,
    glitchEnabled: false,
  }
  render(<SetupScreen initial={initial} onStart={() => {}} onBack={() => {}} />)
  // 8 ทีม → ระเบิดจริง 7 → ตั้งได้ต่ำสุด 7 ช่อง (เดิมบังคับ 8 = จำนวนทีม)
  expect(cellsInput().min).toBe(String(bombQuota(8)))
})

// FIX_LISTS #3: เปิดการ์ดด้วย → ขั้นต่ำต้องเผื่อที่ให้การ์ดในสำรับด้วย
// ไม่งั้นพอลดช่องลงชนขั้นต่ำ ของที่ตั้งไว้จะถูก clamp หายไปเงียบ ๆ
test('FIX_LISTS #3: minimum cells grows with the options that are switched on', () => {
  const initial = {
    ...defaultSettings(),
    teamNames: defaultTeamNames(8),
    cardsEnabled: true,
    glitchEnabled: false,
  }
  render(<SetupScreen initial={initial} onStart={() => {}} onBack={() => {}} />)
  expect(cellsInput().min).toBe(String(bombQuota(8) + CARD_DECK_SIZE))
})

// ── FIX_LISTS ชุดใหม่ ────────────────────────────────────────────────────────
test('ชุดใหม่ #1/#2: มีหัวข้อ "ตั้งค่าทีม" และ "ตั้งค่าเกม" (เดิมคือ "จำนวนช่องทั้งหมด")', () => {
  render(<SetupScreen initial={defaultSettings()} onStart={() => {}} onBack={() => {}} />)
  expect(screen.getByText('ตั้งค่าทีม')).toBeDefined()
  expect(screen.getByText('ตั้งค่าเกม')).toBeDefined()
  expect(screen.queryByText('จำนวนช่องทั้งหมด')).toBeNull()
})

function buttonByText(re: RegExp): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find((b) =>
    re.test(b.textContent ?? ''),
  ) as HTMLButtonElement | undefined
}

test('ชุดใหม่ #3: ปุ่มชื่อ "ขั้นต่ำ"/"แนะนำ" และไม่มีปุ่ม Auto อีกแล้ว', () => {
  render(<SetupScreen initial={defaultSettings()} onStart={() => {}} onBack={() => {}} />)
  expect(buttonByText(/^ขั้นต่ำ \d+$/)).toBeDefined()
  expect(buttonByText(/^แนะนำ \d+$/)).toBeDefined()
  // ปุ่ม auto / "ใช้ค่า…" ชุดเดิมต้องหายไปหมด
  expect(buttonByText(/ค่าอัตโนมัติ/)).toBeUndefined()
  expect(buttonByText(/ใช้ค่าแนะนำ \d/)).toBeUndefined()
  expect(buttonByText(/ใช้ค่าขั้นต่ำ/)).toBeUndefined()
})

test('ชุดใหม่ #3: ปุ่มที่กดแล้วไม่เปลี่ยนอะไร ถูก disable ไม่ใช่หายไป', () => {
  // ตั้งช่องให้เท่าค่าขั้นต่ำพอดี → ปุ่ม "ขั้นต่ำ" ต้องยังอยู่ แต่กดไม่ได้
  const initial = {
    ...defaultSettings(),
    teamNames: defaultTeamNames(8),
    cardsEnabled: false,
    glitchEnabled: false,
  }
  render(<SetupScreen initial={initial} onStart={() => {}} onBack={() => {}} />)
  const minBtn = buttonByText(/^ขั้นต่ำ \d+$/)
  expect(minBtn).toBeDefined()
  // ค่าตั้งต้น (auto) = ระเบิดจริงล้วน = ขั้นต่ำพอดี
  expect(Number(cellsInput().value)).toBe(bombQuota(8))
  expect(minBtn?.disabled).toBe(true)
})

// ชุดใหม่ #4: ระเบิดจริง 5 + glitch auto 1 + การ์ด 7 → ขั้นต่ำต้องเป็น 13 ไม่ใช่ 12
test('ชุดใหม่ #4: ขั้นต่ำนับ glitch โหมด auto ด้วย', () => {
  const initial = {
    ...defaultSettings(),
    teamNames: defaultTeamNames(6), // ระเบิดจริง 5
    glitchEnabled: true,
    glitchMode: 'auto' as const,
    glitchRatio: 0.3, // → floor(5 × 0.3) = 1 ลูก
    cardsEnabled: true,
  }
  render(<SetupScreen initial={initial} onStart={() => {}} onBack={() => {}} />)
  const quota = bombQuota(6)
  const autoGlitch = glitchCountFor(quota, 9999, 'auto', 0.3, 0)
  expect(autoGlitch).toBe(1)
  // ขั้นต่ำ = 5 + 1 + จำนวนการ์ดในสำรับ (เดิมลืมบวก glitch → ต่ำไป 1)
  expect(cellsInput().min).toBe(String(quota + autoGlitch + CARD_DECK_SIZE))
})

test('ชุดใหม่ #12: คำบอกความยากง่ายอยู่ติดกับ % และไม่มีบรรทัด "สมดุล" แยกอีก', () => {
  render(<SetupScreen initial={defaultSettings()} onStart={() => {}} onBack={() => {}} />)
  // ป้าย "สมดุล" ที่เคยเป็นบรรทัดของตัวเองต้องหายไป
  expect(screen.queryByText('สมดุล')).toBeNull()
  // เหลือรูปแบบเดียว "(คำบอกความยาก NN%)" ก้อนเดียวกัน
  expect(screen.getByText(/^\((ง่ายเกินไป|สมดุล|เสี่ยง|โหดมาก) \d+%\)$/)).toBeDefined()
})
