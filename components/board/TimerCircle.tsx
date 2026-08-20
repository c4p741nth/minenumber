'use client'

import { useEffect, useState } from 'react'
import type { Phase } from '@/lib/game/types'

interface Props {
  duration: number // วินาทีต่อ turn, 0 = ไม่จับเวลา
  phase: Phase
  turnKey: number // เปลี่ยนเมื่อขึ้น turn ใหม่ → รีเซ็ตจับเวลา
  onTimeout: () => void
}

const R = 28
const CIRC = 2 * Math.PI * R

export function TimerCircle({ duration, phase, turnKey, onTimeout }: Props) {
  const [remaining, setRemaining] = useState(duration)
  const active = phase === 'opening' && duration > 0

  useEffect(() => {
    setRemaining(duration)
  }, [duration, turnKey])

  useEffect(() => {
    if (!active) return
    if (remaining <= 0) {
      setRemaining(duration)
      onTimeout()
      return
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(t)
  }, [active, remaining, duration, onTimeout])

  const frac = active ? Math.max(remaining, 0) / duration : 1
  const danger = active && remaining <= 10
  const color = danger ? '#dc2626' : 'var(--primary)'

  return (
    <div className="relative h-20 w-20">
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
        }`}
      >
        {active ? remaining : '∞'}
      </span>
    </div>
  )
}