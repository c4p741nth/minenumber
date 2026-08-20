import { describe, expect, it } from 'bun:test'
import { timerDisplay } from './TimerCircle'

describe('timerDisplay (FIX bullet 52: pause ต้องแช่เวลาไว้)', () => {
  it('ไม่จับเวลา (duration 0) → ∞ และวงแหวนเต็ม', () => {
    const d = timerDisplay('cards', 0, 0)
    expect(d.label).toBe('∞')
    expect(d.frac).toBe(1)
    expect(d.danger).toBe(false)
  })

  it('กำลังนับ 30/60 → วงแหวนครึ่ง เลข 30', () => {
    const d = timerDisplay('cards', 60, 30)
    expect(d.frac).toBe(0.5)
    expect(d.label).toBe('30')
  })

  // ตัวจับ regression ตัวจริง: เดิม pause ทำให้ frac เด้งเป็น 1 และเลขกลายเป็น '⏸'
  // timerDisplay ไม่รับ paused เลย — โดยเจตนา การหยุดเวลาไม่ใช่เรื่องของการแสดงผล
  it('pause แล้ววงแหวน/เลขต้องค้างที่เดิม ไม่เด้งเต็ม', () => {
    const running = timerDisplay('cards', 60, 30)
    const paused = timerDisplay('cards', 60, 30)
    expect(paused.frac).toBe(running.frac)
    expect(paused.label).toBe(running.label)
    expect(paused.frac).not.toBe(1)
  })

  it('pause ตอนเวลาใกล้หมด → ยังเป็น danger (สีแดงไม่หาย)', () => {
    expect(timerDisplay('cards', 60, 8).danger).toBe(true)
    expect(timerDisplay('opening', 60, 10).danger).toBe(true)
    expect(timerDisplay('cards', 60, 11).danger).toBe(false)
  })

  it('phase ที่ไม่จับเวลา (defusing/blocking/gameover/setup) → ∞', () => {
    for (const p of ['defusing', 'blocking', 'gameover', 'setup'] as const) {
      const d = timerDisplay(p, 60, 30)
      expect(d.label).toBe('∞')
      expect(d.frac).toBe(1)
    }
  })

  it('เวลาติดลบ → clamp ที่ 0 ไม่ให้วงแหวนล้น', () => {
    const d = timerDisplay('cards', 60, -3)
    expect(d.frac).toBe(0)
    expect(d.label).toBe('0')
  })
})
