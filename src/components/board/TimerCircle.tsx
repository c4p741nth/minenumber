
import { useEffect, useState } from 'react'
import { sfx } from '@/lib/audio/sfx'
import type { Phase } from '@/lib/game/types'

interface Props {
  duration: number // วินาทีต่อ turn, 0 = ไม่จับเวลา
  phase: Phase
  turnKey: number // เปลี่ยนเมื่อขึ้น turn ใหม่ → รีเซ็ตจับเวลา
  paused?: boolean // FIX #18: กรรมการหยุดเวลาชั่วคราว
  onTimeout: () => void
}

const R = 28
const CIRC = 2 * Math.PI * R

// FIX bullet 52: pause ต้อง "แช่" เวลาไว้ ไม่ใช่รีเซ็ตหน้าจอ
// เดิมใช้ตัวแปร active ตัวเดียวคุมทั้ง "นับอยู่ไหม" และ "แสดงอะไร" พอ pause แล้ว
// active = false → วงแหวนเด้งกลับเต็ม (frac 1) และตัวเลขถูกแทนด้วย '⏸'
// แยกเป็น showTime = "มีเวลาให้แสดงไหม" ซึ่งไม่สนใจ paused
// แยกเป็น pure function เพื่อให้มีเทสคุม (เหมือน cellSizeFor / cardWidthFor)
export function timerDisplay(
  phase: Phase,
  duration: number,
  remaining: number,
): { frac: number; label: string; danger: boolean } {
  const showTime = (phase === 'cards' || phase === 'opening') && duration > 0
  if (!showTime) return { frac: 1, label: '∞', danger: false }
  const clamped = Math.max(remaining, 0)
  return {
    frac: clamped / duration,
    label: String(clamped),
    // pause ตอนเวลาใกล้หมดต้องยังเป็นสีแดง — สถานะอันตรายไม่ได้หายไปเพราะกดหยุด
    danger: clamped <= 10,
  }
}

export function TimerCircle({ duration, phase, turnKey, paused = false, onTimeout }: Props) {
  const [remaining, setRemaining] = useState(duration)
  // นับถอยหลังตั้งแต่ช่วงใช้การ์ด ('cards') จนถึงช่วงเปิดป้าย ('opening')
  // อย่าจับเวลาช่วง 'defusing' (modal ตัดสายมีจังหวะของตัวเอง) และ 'gameover'
  // FIX #18: pause → เวลาหยุดเดิน แต่ยังโชว์เลขเดิมไว้
  const active = (phase === 'cards' || phase === 'opening') && duration > 0 && !paused

  useEffect(() => {
    setRemaining(duration)
  }, [duration, turnKey])

  useEffect(() => {
    if (!active) return
    if (remaining <= 0) {
      sfx.timeout()
      setRemaining(duration)
      onTimeout()
      return
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(t)
  }, [active, remaining, duration, onTimeout])

  const { frac, label, danger } = timerDisplay(phase, duration, remaining)
  // urgent (กระพริบ) + เสียง tick ผูกกับ active ไม่ใช่ showTime — หยุดเวลาแล้ว
  // ไม่ต้องกระพริบและไม่ต้องมีเสียง แต่เลข/วงแหวน/สีแดงยังค้างอยู่
  const urgent = active && remaining <= 5
  const color = danger ? '#dc2626' : 'var(--primary)'

  // ≤ 5 วิ → เสียง tick ทุกวินาที
  useEffect(() => {
    if (active && remaining <= 5 && remaining > 0) sfx.tick()
  }, [active, remaining])

  return (
    <div className={`relative h-20 w-20 ${danger ? 'timer-pulse' : ''}`}>
      <svg viewBox="0 0 64 64" className="h-full w-full">
        <circle cx="32" cy="32" r={R} stroke="var(--secondary)" strokeWidth="7" fill="none" />
        <circle
          cx="32"
          cy="32"
          r={R}
          stroke={color}
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - frac)}
          transform="rotate(-90 32 32)"
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
        />
      </svg>
      <span
        className={`absolute inset-0 grid place-items-center font-mono text-2xl font-black ${
          danger ? 'text-red-600' : ''
        } ${urgent ? 'timer-urgent' : ''}`}
      >
        {label}
      </span>
    </div>
  )
}
