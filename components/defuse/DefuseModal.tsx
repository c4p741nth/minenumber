'use client'

import { useEffect, useRef, useState } from 'react'
import { useGame } from '@/components/game/GameProvider'
import { sfx } from '@/lib/audio/sfx'

type Stage = 'choosing' | 'cutting' | 'result'
type Wire = 'red' | 'blue'

const SUSPENSE_MS = 2500

// ผลถูกตัดสินไว้แล้วจาก engine ตอน OPEN_CELL (state.lastResult.survived)
// สีที่เลือกไม่มีผลต่อผลลัพธ์ — modal แค่แสดงผล ห้ามไปตัดสินใจเอง
export function DefuseModal() {
  const { state, dispatch } = useGame()
  const [chosen, setChosen] = useState<Wire | null>(null)
  const [stage, setStage] = useState<Stage>('choosing')
  const [reducedMotion, setReducedMotion] = useState(false)

  const current = state.teams[state.currentTeamIndex]
  const survived = state.lastResult?.kind === 'real' ? state.lastResult.survived : false

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // เสียง tick วนตอนช่วงลุ้น (ตัดสาย)
  useEffect(() => {
    if (stage !== 'cutting') return
    const t = window.setInterval(() => sfx.tick(), 1000)
    return () => window.clearInterval(t)
  }, [stage])

  // เฉลยผล
  useEffect(() => {
    if (stage !== 'result') return
    if (survived) sfx.defuseSuccess()
    else sfx.explosion()
  }, [stage, survived])

  function choose(color: Wire) {
    if (stage !== 'choosing') return
    setChosen(color)
    setStage('cutting')
    window.setTimeout(() => setStage('result'), SUSPENSE_MS)
  }

  function acknowledge() {
    dispatch({ type: 'CHOOSE_WIRE', wire: chosen ?? 'red' })
  }

  return (
    <div
      className={`defuse-vignette ${stage === 'result' && !survived ? 'defuse-shake' : ''}`}
      role="dialog"
      aria-modal="true"
    >
      {stage === 'result' && !survived && <div className="defuse-flash pointer-events-none fixed inset-0 bg-red-700" />}

      <div className="relative flex w-full max-w-3xl flex-col items-center gap-6 text-center text-white">
        {stage === 'result' && survived && <Confetti disabled={reducedMotion} />}

        {stage === 'choosing' && (
          <>
            <p className="section-label text-red-300">ระเบิดจริง!</p>
            <h2 className="font-serif text-6xl font-bold">ตัดสาย</h2>
            <p className="text-xl text-white/70">ทีม {current.name} เลือกสายหนึ่งเพื่อกู้ระเบิด</p>
          </>
        )}

        {stage === 'cutting' && (
          <>
            <h2 className="font-serif text-6xl font-bold">กำลังตัดสาย…</h2>
            <p className="text-xl text-white/70">ลุ้นเลย</p>
          </>
        )}

        {stage === 'result' && survived && (
          <>
            <h2 className="font-serif text-6xl font-bold text-emerald-300">กู้สำเร็จ!</h2>
            <p className="text-2xl">ระเบิดย้ายไปที่อื่นแล้ว</p>
          </>
        )}

        {stage === 'result' && !survived && (
          <>
            <h2 className="font-serif text-6xl font-bold text-red-400">ระเบิด!</h2>
            <p className="text-2xl">ทีม {current.name} ตกรอบ</p>
          </>
        )}

        <Wires chosen={chosen} stage={stage} onChoose={choose} />

        {stage === 'result' && (
          <button onClick={acknowledge} className="primary-button mt-2 text-2xl">
            รับทราบ
          </button>
        )}
      </div>
    </div>
  )
}

function Wires({
  chosen,
  stage,
  onChoose,
}: {
  chosen: Wire | null
  stage: Stage
  onChoose: (w: Wire) => void
}) {
  const wire = (color: Wire, d: string, stroke: string) => {
    const picked = chosen === color
    const disabled = stage !== 'choosing'
    return (
      <button
        onClick={() => onChoose(color)}
        disabled={disabled}
        className={`group relative flex flex-col items-center ${
          picked ? 'defuse-cut' : ''
        } ${disabled && !picked ? 'opacity-60' : ''}`}
        aria-label={`ตัดสาย${color === 'red' ? 'แดง' : 'น้ำเงิน'}`}
      >
        <svg viewBox="0 0 120 220" className="h-56 w-28">
          <path d={d} stroke={stroke} strokeWidth="10" fill="none" strokeLinecap="round" />
          {picked && stage === 'cutting' && (
            <text x="60" y="120" textAnchor="middle" className="text-3xl">
              ✂
            </text>
          )}
        </svg>
        <span
          className={`mt-2 grid h-16 w-16 place-items-center rounded-full text-3xl ${
            color === 'red' ? 'bg-red-600' : 'bg-blue-600'
          }`}
        >
          {color === 'red' ? '🔴' : '🔵'}
        </span>
      </button>
    )
  }

  return (
    <div className="flex items-end justify-center gap-16">
      {wire('red', 'M 30 10 C 30 90, 60 140, 60 200', '#dc2626')}
      {wire('blue', 'M 90 10 C 90 90, 60 140, 60 200', '#2563eb')}
    </div>
  )
}

function Confetti({ disabled }: { disabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (disabled) return
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const c = ctx
    const W = (canvas.width = window.innerWidth)
    const H = (canvas.height = window.innerHeight)
    const colors = ['#22c55e', '#16a34a', '#86efac', '#4ade80', '#facc15']
    const pieces = Array.from({ length: 140 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 260,
      y: H / 2 - 40,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 7 - 2,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 7 + Math.random() * 7,
    }))
    let raf = 0
    const draw = (g: CanvasRenderingContext2D) => {
      g.clearRect(0, 0, W, H)
      for (const p of pieces) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.16
        p.rot += p.vr
        g.save()
        g.translate(p.x, p.y)
        g.rotate(p.rot)
        g.fillStyle = p.color
        g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        g.restore()
      }
      raf = requestAnimationFrame(() => draw(g))
    }
    draw(c)
    return () => cancelAnimationFrame(raf)
  }, [disabled])

  if (disabled) return null
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-10" />
}