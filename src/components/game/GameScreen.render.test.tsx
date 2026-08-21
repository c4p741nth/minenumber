import { afterEach, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { GameScreen, TurnPrompt } from './GameScreen'
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
// FIX_LISTS ชุดที่สาม #12: ทิศทางย้ายไปอยู่ใน panel ทีมแล้ว (เทสตำแหน่งอยู่ท้ายไฟล์)
// FIX_LISTS ชุดที่สี่ #5: ป้ายเหลือแค่ "ทิศ" + ลูกศร ไม่มีคำว่า ตามลำดับ/ย้อนกลับ แล้ว
test('FIX #30: direction and next team are shown', () => {
  renderGame()
  const badge = screen.getByLabelText(/ทิศทางเกม/)
  expect(badge.textContent).toContain('ทิศ')
  expect(badge.textContent).toMatch(/↓|↑/)
  expect(badge.textContent).not.toContain('ตามลำดับ')
  expect(badge.textContent).not.toContain('ย้อนกลับ')
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
  handle.dispatch({ type: 'ACK_DEFUSE' })

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
// ชุดใหม่ #8: ปุ่มเสียงเคยวางทับปุ่มสลับธีม (ทั้งคู่ fixed มุมขวาบน)
// ทำให้หน้าเล่นเกมเห็นเป็นปุ่มซ้อนกัน — ตอนนี้ต้องคนละตำแหน่ง
// FIX_LISTS ชุดที่สาม #4: ไม่มีปุ่ม mute แล้ว เหลือแถบเลื่อนเสียงที่กางอยู่ตลอด
test('ชุดที่สาม #4: แถบเสียงกางอยู่ตลอด และไม่ทับตำแหน่งปุ่มสลับธีม', () => {
  renderGame()
  const slider = screen.getByLabelText('ระดับเสียง Effect')
  expect(slider).toBeDefined()
  // ไม่มีปุ่ม mute เหลืออยู่แล้ว — เลื่อนไป 0 คือปิดเสียง
  const muteBtn = Array.from(document.querySelectorAll('button')).find((b) =>
    /ปิดเสียง|เปิดเสียง/.test(b.getAttribute('title') ?? ''),
  )
  expect(muteBtn).toBeUndefined()

  // FIX_LISTS ชุดที่สี่ #4: แถบเสียงไม่ลอย fixed แล้ว — อยู่ในบรรทัดหัวเว็บ
  // ถัดจากปุ่ม "ออกจากห้อง" (element ก่อนหน้าใน header เดียวกัน)
  const header = slider.closest('header')
  expect(header).not.toBeNull()
  const exitBtn = screen.getByLabelText(/ออกจากห้อง/)
  const volumeBox = slider.closest('div')!
  expect(volumeBox.previousElementSibling).toBe(exitBtn)
  expect(volumeBox.className).not.toMatch(/(^| )fixed( |$)/)
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
  handle.dispatch({ type: 'ACK_DEFUSE' })

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

// ── FIX_LISTS ชุดที่สาม ─────────────────────────────────────────────────────

// FIX_LISTS ชุดที่สี่ #6: ไม่มีแถบคำอธิบายตอนกดช่องแล้ว และกระดานต้องชิดแถบ
// "ทีม X กรุณาเลือกแผ่นป้าย…" (ไม่มี element คั่นกลางอีก)
test('ชุดที่สี่ #6: ไม่มีแถบคำอธิบายเลือกช่อง และกระดานชิดแถบ "กรุณาเลือกแผ่นป้าย"', () => {
  renderGame()
  expect(screen.queryByText(/กด Enter เพื่อเปิด/)).toBeNull()

  const banner = screen.getByText(/กรุณาเลือกแผ่นป้ายหรือใช้ item/).closest('div')!
  // ตัวถัดไปใน main ต้องเป็นกระดานเลย ไม่มีแถบคีย์เลขคั่น
  const nextEl = banner.nextElementSibling as HTMLElement
  expect(nextEl).not.toBeNull()
  expect(nextEl.textContent).not.toContain('เลือกช่อง')
})

// #7: ไม่มีบรรทัดสอน "พิมพ์เลขช่องแล้วกด Enter" ค้างอยู่บนจอแล้ว
test('ชุดที่สาม #7: ไม่มีข้อความ "พิมพ์เลขช่องแล้วกด Enter"', () => {
  renderGame()
  expect(screen.queryByText(/พิมพ์เลขช่องแล้วกด Enter/)).toBeNull()
})

// #12: ทิศทางการเดินเกมย้ายไปอยู่มุมขวาบนของ panel ทีม เป็นลูกศรขึ้น/ลง
test('ชุดที่สาม #12: ทิศทางเกมอยู่ใน panel ทีม และเป็นลูกศรขึ้น/ลง', () => {
  renderGame()
  const badge = screen.getByLabelText(/ทิศทางเกม/)
  expect(badge.textContent).toContain('↓')
  // ต้องอยู่ใน panel เดียวกับหัวข้อ "ทีม" ไม่ใช่แถบตาปัจจุบัน
  const panel = badge.closest('aside')
  expect(panel?.textContent).toContain('ทีม')
  // ป้ายลูกศรซ้าย/ขวาแบบเดิมต้องหายไปแล้ว
  expect(screen.queryByText(/→ ตามลำดับ/)).toBeNull()
})

// #13: จำนวนระเบิดที่เหลืออยู่ข้าง ๆ ตัวนับถอยหลัง
test('ชุดที่สาม #13: "ระเบิดเหลือ" อยู่ในแถบเดียวกับตัวนับถอยหลัง', () => {
  renderGame()
  const timer = screen.getByRole('button', { name: 'เริ่มจับเวลาใหม่' })
  // พี่น้องใน flex row เดียวกับวงนับเวลา
  expect(timer.parentElement?.textContent).toContain('ระเบิดเหลือ')
})

// ── FIX_LISTS ชุดที่แปด ─────────────────────────────────────────────────────

// #1: คำสั่งสแกนและผลสแกนต้องมาแทนที่ข้อความในแถบ "ทีม X กรุณาเลือกแผ่นป้าย…"
//     ไม่ใช่แถบใหม่ที่มาดันกระดาน และไม่ใช่ modal ที่ต้องกดปิด
test('ชุดที่แปด #1: โหมดเลือกช่องสแกนแทนที่ข้อความ "กรุณาเลือกแผ่นป้าย" ในช่องเดิม', () => {
  render(
    <TurnPrompt
      teamName="ทีม 1"
      handCount={2}
      cardMode={true}
      onBackToCards={() => {}}
      scanPicking={true}
      scanRadius={2}
      onCancelScan={() => {}}
      scanResult={null}
      onDismissScanResult={() => {}}
    />,
  )
  expect(screen.getByText(/เลือกช่องที่จะสแกน/)).toBeDefined()
  // ข้อความปกติต้องถูกแทนที่ ไม่ใช่แสดงคู่กัน
  expect(screen.queryByText(/กรุณาเลือกแผ่นป้ายหรือใช้ item/)).toBeNull()
})

test('ชุดที่แปด #1: ผลสแกน "เจอระเบิด" แสดงในช่องเดิม ไม่ใช่ modal', () => {
  render(
    <TurnPrompt
      teamName="ทีม 1"
      handCount={0}
      cardMode={true}
      onBackToCards={() => {}}
      scanPicking={false}
      scanRadius={2}
      onCancelScan={() => {}}
      scanResult={{ center: 10, lo: 8, hi: 12, found: true }}
      onDismissScanResult={() => {}}
    />,
  )
  expect(screen.getByText(/มีระเบิดอยู่ใกล้ ๆ/)).toBeDefined()
  expect(screen.getByText(/ตรวจช่วง 8–12/)).toBeDefined()
  expect(screen.queryByText(/กรุณาเลือกแผ่นป้ายหรือใช้ item/)).toBeNull()
  // เป็นข้อความในแถบ (role=status) ไม่ใช่ dialog ที่ต้องกดปิดก่อนเล่นต่อ
  expect(screen.getByRole('status')).toBeDefined()
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('ชุดที่แปด #1: ผลสแกน "ไม่เจอระเบิด" ก็แสดงในช่องเดิมเหมือนกัน', () => {
  render(
    <TurnPrompt
      teamName="ทีม 1"
      handCount={0}
      cardMode={true}
      onBackToCards={() => {}}
      scanPicking={false}
      scanRadius={2}
      onCancelScan={() => {}}
      scanResult={{ center: 5, lo: 3, hi: 7, found: false }}
      onDismissScanResult={() => {}}
    />,
  )
  expect(screen.getByText(/ไม่มีระเบิดอยู่ใกล้ ๆ/)).toBeDefined()
  expect(screen.queryByRole('dialog')).toBeNull()
})

// ไม่มีสถานะสแกน → กลับไปเป็นข้อความปกติของตา
test('ชุดที่แปด #1: ไม่มีสถานะสแกน → แสดงข้อความปกติของตา', () => {
  render(
    <TurnPrompt
      teamName="ทีม 7"
      handCount={3}
      cardMode={true}
      onBackToCards={() => {}}
      scanPicking={false}
      scanRadius={2}
      onCancelScan={() => {}}
      scanResult={null}
      onDismissScanResult={() => {}}
    />,
  )
  expect(screen.getByText(/ทีม 7 กรุณาเลือกแผ่นป้ายหรือใช้ item/)).toBeDefined()
})

// #2: สาม menu (ธีม/เต็มจอ/โหมดจอ) อยู่บน top nav bar เดียวกับระดับเสียง+ปุ่มออกห้อง
test('ชุดที่แปด #2: ปุ่มธีม/เต็มจอ/โหมดจอ อยู่บนแถบเดียวกับระดับเสียงและปุ่มออกห้อง', () => {
  renderGame()
  const exitBtn = screen.getByLabelText('จบเกมนี้ / ออกจากห้อง')
  const header = exitBtn.closest('header')!
  expect(header.textContent).toBeDefined()
  // ทั้งสามปุ่มต้องอยู่ใน header เดียวกับปุ่มออกห้อง
  expect(header.contains(screen.getByLabelText('สลับธีมสว่าง/มืด'))).toBe(true)
  expect(header.contains(screen.getByLabelText(/เต็มจอ/))).toBe(true)
  expect(header.contains(screen.getByLabelText(/สลับเป็น/))).toBe(true)
  // ระดับเสียงอยู่แถบเดียวกันด้วย (ของเดิม ไม่ควรหลุดออกไป)
  expect(header.contains(screen.getByLabelText('ระดับเสียง Effect'))).toBe(true)
})

// #3: ปุ่ม pause ย้ายมาอยู่ติดซ้ายของวงนับถอยหลัง
test('ชุดที่แปด #3: ปุ่ม pause อยู่ติดซ้ายของวงนับถอยหลัง', () => {
  renderGame({ turnSeconds: 60 })
  const timer = screen.getByRole('button', { name: 'เริ่มจับเวลาใหม่' })
  const pause = screen.getByLabelText('หยุดเวลาชั่วคราว')
  // พี่น้องกันโดยตรง และ pause ต้องมาก่อน timer
  expect(pause.nextElementSibling).toBe(timer)
})


// FIX_LISTS ชุดที่สิบเอ็ด #1: ป้าย "ทีม X ต้องเปิดอีก N ป้าย" ต้องอยู่ใน "ช่องเดียวกัน"
// กับข้อความ "กรุณาเลือกแผ่นป้ายหรือใช้ item" ไม่ใช่แถบแยกใต้กระดานเหมือนเดิม
test('ชุดที่สิบเอ็ด #1: "ต้องเปิดอีก N ป้าย" อยู่แถบเดียวกับ "กรุณาเลือกแผ่นป้าย"', () => {
  render(
    <TurnPrompt
      teamName="ทีม 3"
      handCount={0}
      cardMode={true}
      onBackToCards={() => {}}
      scanPicking={false}
      scanRadius={2}
      onCancelScan={() => {}}
      scanResult={null}
      onDismissScanResult={() => {}}
      pendingOpens={3}
    />,
  )
  const attacked = screen.getByText(/ต้องเปิดอีก 3 ป้าย/)
  const prompt = screen.getByText(/กรุณาเลือกแผ่นป้ายหรือใช้ item/)
  // ทั้งสองข้อความอยู่ในกล่องเดียวกัน (parent เดียวกัน)
  expect(attacked.parentElement).toBe(prompt.parentElement)
})

// ไม่ได้โดนโจมตี (pendingOpens = 1) → ไม่มีข้อความ "ต้องเปิดอีก"
test('ชุดที่สิบเอ็ด #1: pendingOpens = 1 → ไม่มีข้อความ "ต้องเปิดอีก"', () => {
  render(
    <TurnPrompt
      teamName="ทีม 3"
      handCount={0}
      cardMode={true}
      onBackToCards={() => {}}
      scanPicking={false}
      scanRadius={2}
      onCancelScan={() => {}}
      scanResult={null}
      onDismissScanResult={() => {}}
      pendingOpens={1}
    />,
  )
  expect(screen.queryByText(/ต้องเปิดอีก/)).toBeNull()
  expect(screen.getByText(/ทีม 3 กรุณาเลือกแผ่นป้ายหรือใช้ item/)).toBeDefined()
})

// ── FIX_LISTS ชุดที่สิบสอง ───────────────────────────────────────────────────

// #1: ข้อความ "เลือกช่อง X — กดช่องเดิมอีกครั้งเพื่อเปิด" ย้ายจากใต้กระดาน
//     ขึ้นมาอยู่ในแถบเดียวกับ "ทีม X กรุณาเลือกแผ่นป้าย…" (แทนที่ข้อความนั้น)
test('ชุดที่สิบสอง #1: เลือกช่องแล้วคำสั่ง "กดช่องเดิมอีกครั้ง" มาแทนข้อความปกติ', () => {
  render(
    <TurnPrompt
      teamName="ทีม 1"
      handCount={2}
      cardMode={true}
      onBackToCards={() => {}}
      scanPicking={false}
      scanRadius={2}
      onCancelScan={() => {}}
      scanResult={null}
      onDismissScanResult={() => {}}
      pickedCell={17}
    />,
  )
  expect(screen.getByText(/กดช่องเดิมอีกครั้งเพื่อเปิด/)).toBeDefined()
  expect(screen.getByText('17')).toBeDefined()
  // แทนที่ข้อความปกติ ไม่ใช่แสดงคู่กัน (แถบเดียว ช่องเดียว)
  expect(screen.queryByText(/กรุณาเลือกแผ่นป้ายหรือใช้ item/)).toBeNull()
  // ระหว่างเลือกช่องไม่ต้องชวนไปดูการ์ดในมือ
  expect(screen.queryByText(/ใบในมือ/)).toBeNull()
})

// ยังไม่เลือกช่อง → ข้อความปกติเหมือนเดิม
test('ชุดที่สิบสอง #1: ยังไม่เลือกช่อง → ข้อความปกติไม่เปลี่ยน', () => {
  render(
    <TurnPrompt
      teamName="ทีม 1"
      handCount={2}
      cardMode={true}
      onBackToCards={() => {}}
      scanPicking={false}
      scanRadius={2}
      onCancelScan={() => {}}
      scanResult={null}
      onDismissScanResult={() => {}}
      pickedCell={null}
    />,
  )
  expect(screen.getByText(/ทีม 1 กรุณาเลือกแผ่นป้ายหรือใช้ item/)).toBeDefined()
  expect(screen.queryByText(/กดช่องเดิมอีกครั้งเพื่อเปิด/)).toBeNull()
})

// โดน Attack ค้างอยู่ด้วย → ต้องเห็นทั้ง "ต้องเปิดอีก N ป้าย" และคำสั่งกดย้ำ
// (ระหว่างโดนโจมตี กรรมการยังต้องรู้ว่าเหลือกี่ป้าย)
test('ชุดที่สิบสอง #1: โดน Attack อยู่ → เห็นทั้งจำนวนป้ายที่เหลือและคำสั่งกดย้ำ', () => {
  render(
    <TurnPrompt
      teamName="ทีม 2"
      handCount={0}
      cardMode={true}
      onBackToCards={() => {}}
      scanPicking={false}
      scanRadius={2}
      onCancelScan={() => {}}
      scanResult={null}
      onDismissScanResult={() => {}}
      pendingOpens={3}
      pickedCell={8}
    />,
  )
  expect(screen.getByText(/ต้องเปิดอีก 3 ป้าย/)).toBeDefined()
  expect(screen.getByText(/กดช่องเดิมอีกครั้งเพื่อเปิด/)).toBeDefined()
})

// โหมดเลือกช่องสแกนต้องมาก่อน — กระดานเปลี่ยนหน้าที่ทั้งใบ ไม่ใช่จังหวะกดย้ำเปิดป้าย
test('ชุดที่สิบสอง #1: โหมดสแกนมาก่อนคำสั่งกดย้ำเปิดป้าย', () => {
  render(
    <TurnPrompt
      teamName="ทีม 1"
      handCount={1}
      cardMode={true}
      onBackToCards={() => {}}
      scanPicking={true}
      scanRadius={2}
      onCancelScan={() => {}}
      scanResult={null}
      onDismissScanResult={() => {}}
      pickedCell={5}
    />,
  )
  expect(screen.getByText(/เลือกช่องที่จะสแกน/)).toBeDefined()
  expect(screen.queryByText(/กดช่องเดิมอีกครั้งเพื่อเปิด/)).toBeNull()
})
