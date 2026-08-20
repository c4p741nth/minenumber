
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

  const frac = active ? Math.max(remaining, 0) / duration : 1
  const danger = active && remaining <= 10
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
        {paused && duration > 0 ? '⏸' : active ? remaining : '∞'}
      </span>
    </div>
  )
}
