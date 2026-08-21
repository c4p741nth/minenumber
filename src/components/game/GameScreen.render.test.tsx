import { afterEach, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { GameScreen } from './GameScreen'
import { GameProvider } from './GameProvider'
import { MainMenu } from '@/components/menu/MainMenu'
import { createGame } from '@/lib/game/engine'
import { defaultSettings } from '@/lib/game/config'
import type { GameSettings } from '@/lib/game/types'

afterEach(cleanup)

function renderGame(overrides: Partial<GameSettings> = {}) {
  const settings: GameSettings = {
    ...defaultSettings(),
    teamNames: ['ทีม 1', 'ทีม 2', 'ทีม 3'],
    rangeMin: 1,
    rangeMax: 20,
    ...overrides,
  }
  const handle = createGame(settings, 42)
  return render(
    <GameProvider handle={handle}>
      <GameScreen onExit={() => {}} />
    </GameProvider>,
  )
}

// เหมือน B1: layout ใหญ่ ๆ ที่ rewrite แล้ว crash ตอน render จะเห็นเป็น "จอว่างเปล่า"
// เทส logic ผ่านหมดแต่เล่นจริงไม่ได้ — เทสนี้คือด่านที่ต้องจับให้ได้
test('GameScreen renders without throwing', () => {
  expect(() => renderGame()).not.toThrow()
})

// FIX #19: ชื่อเกมอยู่หัวเว็บตอนเล่น
test('FIX #19: game title shows in the in-game header', () => {
  renderGame()
  expect(screen.getAllByText('Minenumber').length).toBeGreaterThan(0)
})

// FIX #17: ไม่มีเมนู "ตานี้จะทำอะไร?" แล้ว — แทนด้วยข้อความสั่งทีมตรง ๆ
test('FIX #17: turn prompt replaces the "what to do" menu', () => {
  renderGame()
  expect(screen.queryByText(/ตานี้จะทำอะไร/)).toBeNull()
  expect(screen.getByText(/กรุณาเลือกแผ่นป้ายหรือใช้ item/)).toBeDefined()
})

// FIX #28: แสดงโอกาสโดนระเบิดระหว่างเล่น
test('FIX #28: hit chance is shown during play', () => {
  renderGame()
  expect(screen.getByText(/โอกาสโดนระเบิด/)).toBeDefined()
})

// FIX #30: บอกทิศทางเกม + ทีมถัดไป
test('FIX #30: direction and next team are shown', () => {
  renderGame()
  expect(screen.getByText(/ตามลำดับ|ย้อนกลับ/)).toBeDefined()
  expect(screen.getByText(/ถัดไป:/)).toBeDefined()
})

// FIX #21: ปุ่มจบเกมเป็น icon ออกห้อง (ไม่ใช่ปุ่มข้อความ "จบเกมนี้")
test('FIX #21: exit control is an exit-room icon button', () => {
  renderGame()
  expect(screen.queryByText('จบเกมนี้')).toBeNull()
  expect(screen.getByLabelText(/ออกจากห้อง/)).toBeDefined()
})

// FIX #12: กฎกติกาเป็น modal ในหน้าแรก ไม่เปิดหน้าใหม่
test('FIX #12: MainMenu renders with a rules button (modal, not a new screen)', () => {
  expect(() =>
    render(
      <MainMenu
        hasSnapshot={false}
        onStart={() => {}}
        onResume={() => {}}
        onLeaderboard={() => {}}
      />,
    ),
  ).not.toThrow()
  expect(screen.getByText(/กฎกติกา/)).toBeDefined()
})

// FIX #38: TeamList คำนวณอันดับ + เหรียญทุกครั้งที่เรนเดอร์ — โค้ดนี้พังแล้วจอว่าง
// เกมเริ่มใหม่ทุกทีมยังรอด เหรียญจึงไม่โผล่ (เทสอื่นครอบเคสนั้นอยู่แล้ว 6 อัน)
// เทสนี้จับเคสที่โค้ดเหรียญทำงานจริง: 3 ทีม ตกรอบ 1 → ทีมที่ตกรอบได้ทองแดง
// seed 1 คือ seed ที่ตัดสายพลาดจริง (seed 42 ที่เทสอื่นใช้ "รอด" เทสจะผ่านแบบว่างเปล่า)
test('FIX #38: bronze medal shows mid-game for the team that placed 3rd', () => {
  const settings: GameSettings = {
    ...defaultSettings(),
    teamNames: ['ทีม 1', 'ทีม 2', 'ทีม 3'],
    rangeMin: 1,
    rangeMax: 20,
    cardsEnabled: false,
  }
  const handle = createGame(settings, 1)
  const secret = handle.serializeSecret()
  const bombCell = Number(Object.keys(secret).find((k) => secret[Number(k)] === 'real'))
  handle.dispatch({ type: 'OPEN_CELL', cell: bombCell })
  handle.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })

  // ยืนยันว่า setup ไปถึงสถานะที่ต้องการจริง ไม่ใช่เทสผ่านเพราะไม่มีอะไรเกิดขึ้น
  const st = handle.getState()
  expect(st.teams.filter((t) => !t.alive)).toHaveLength(1)
  expect(st.phase).not.toBe('gameover')

  expect(() =>
    render(
      <GameProvider handle={handle}>
        <GameScreen onExit={() => {}} />
      </GameProvider>,
    ),
  ).not.toThrow()

  // ทองแดงต้องโผล่ ส่วนทอง/เงินยังไม่รู้ผล ห้ามโผล่
  expect(screen.getAllByTitle('อันดับ 3').length).toBeGreaterThan(0)
  expect(screen.queryByTitle('อันดับ 1')).toBeNull()
  expect(screen.queryByTitle('อันดับ 2')).toBeNull()

  // ทีมที่ตกรอบต้องยังเห็นชื่อ (ได้เหรียญแล้วต้องไม่ถูกหรี่จนหาย)
  for (const t of st.teams) {
    expect(screen.getAllByText(t.name).length).toBeGreaterThan(0)
  }
})

// ── FIX_LISTS ชุดใหม่ ────────────────────────────────────────────────────────
// ชุดใหม่ #8: ปุ่มปิดเสียงเคยวางทับปุ่มสลับธีม (ทั้งคู่ fixed มุมขวาบน)
// ทำให้หน้าเล่นเกมเห็นเป็นปุ่มซ้อนกัน — ตอนนี้ต้องคนละตำแหน่ง
test('ชุดใหม่ #8: ปุ่มปิดเสียงไม่ทับตำแหน่งปุ่มสลับธีม (มุมขวาบน)', () => {
  renderGame()
  const muteBtn = Array.from(document.querySelectorAll('button')).find((b) =>
    /ปิดเสียง|เปิดเสียง/.test(b.getAttribute('title') ?? ''),
  )
  expect(muteBtn).toBeDefined()
  const holder = muteBtn?.parentElement
  // ปุ่มธีมของ App อยู่ที่ right-3 top-3 — ปุ่มเสียงต้องไม่นั่งทับจุดเดียวกัน
  expect(holder?.className).not.toMatch(/(^| )top-4( |$)/)
  expect(holder?.className).toMatch(/(^| )top-16( |$)/)
})

// ชุดใหม่ #10: กดจบเกมเอง → ไม่ใช่ "เสมอกัน" และไม่โชว์กราฟโพเดียม
test('ชุดใหม่ #10: ยุติเกมเอง → ขึ้น "เกมถูกยุติโดยผู้ใช้" ไม่ใช่ "เสมอกัน!"', () => {
  const settings: GameSettings = {
    ...defaultSettings(),
    teamNames: ['ทีม 1', 'ทีม 2', 'ทีม 3'],
    rangeMin: 1,
    rangeMax: 20,
  }
  const handle = createGame(settings, 42)
  handle.dispatch({ type: 'END_GAME' })

  // ยืนยันว่าเข้าสถานะที่ทุกทีมยังรอด — สถานะที่เดิมจะถูกอ่านว่า "เสมอกัน"
  const st = handle.getState()
  expect(st.phase).toBe('gameover')
  expect(st.teams.every((t) => t.alive)).toBe(true)

  render(
    <GameProvider handle={handle}>
      <GameScreen onExit={() => {}} />
    </GameProvider>,
  )

  expect(screen.getByText('เกมถูกยุติโดยผู้ใช้')).toBeDefined()
  expect(screen.queryByText('เสมอกัน!')).toBeNull()
  expect(screen.queryByText(/ช่องหมด — ทุกทีมที่รอดเสมอกัน/)).toBeNull()
  // ไม่โชว์กราฟ (โพเดียม) — เหลือแต่ตารางคะแนน
  // ต้องดูเฉพาะในกล่องสรุปผล: เหรียญของ TeamList ข้างกระดานเป็นคนละชุด
  expect(podiumMedals()).toBe(0)
  // ตารางคะแนนยังอยู่ครบทุกทีม
  for (const t of st.teams) {
    expect(screen.getAllByText(t.name).length).toBeGreaterThan(0)
  }
})

// นับเหรียญโพเดียมเฉพาะในกล่องสรุปผลจบเกม
// (TeamList ข้างกระดานก็โชว์เหรียญของตัวเอง — นับรวมจะได้เลขที่ไม่ได้แปลว่าอะไร)
// หา overlay จากปุ่ม "กลับไปหน้าหลัก" ซึ่งมีเฉพาะในกล่องสรุปผล
function gameOverBox(): HTMLElement {
  const btn = screen.getByText('กลับไปหน้าหลัก')
  const box = btn.closest('div.fixed') as HTMLElement | null
  if (!box) throw new Error('หากล่องสรุปผลจบเกมไม่เจอ')
  return box
}

function podiumMedals(): number {
  // ต้องมี flag u — emoji เหรียญเป็น surrogate pair ถ้าไม่มี u ตัว class จะถูกหั่นครึ่ง
  // แล้วไม่ match อะไรเลย (เทสจะผ่านแบบว่างเปล่าทั้งที่นับไม่ได้จริง)
  return Array.from(gameOverBox().querySelectorAll('span')).filter((el) =>
    /^[🥇🥈🥉]$/u.test(el.textContent ?? ''),
  ).length
}

// เกมจบตามกติกาจริง (ไม่ได้กดยุติ) ต้องยังโชว์โพเดียมเหมือนเดิม
test('ชุดใหม่ #10: เกมจบเองตามกติกา ยังโชว์โพเดียมตามปกติ', () => {
  const settings: GameSettings = {
    ...defaultSettings(),
    teamNames: ['ทีม 1', 'ทีม 2'],
    rangeMin: 1,
    rangeMax: 20,
    cardsEnabled: false,
  }
  const handle = createGame(settings, 1)
  const secret = handle.serializeSecret()
  const bombCell = Number(Object.keys(secret).find((k) => secret[Number(k)] === 'real'))
  handle.dispatch({ type: 'OPEN_CELL', cell: bombCell })
  handle.dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })

  const st = handle.getState()
  // 2 ทีม ตัดสายพลาด 1 → จบเกมโดยไม่ได้กดยุติ
  expect(st.phase).toBe('gameover')

  render(
    <GameProvider handle={handle}>
      <GameScreen onExit={() => {}} />
    </GameProvider>,
  )

  expect(screen.queryByText('เกมถูกยุติโดยผู้ใช้')).toBeNull()
  // จบตามกติกา → โพเดียมยังอยู่ในกล่องสรุปผล
  expect(podiumMedals()).toBeGreaterThan(0)
})
