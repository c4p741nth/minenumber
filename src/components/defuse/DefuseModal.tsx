
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

  // FIX #27: นับถอยหลังตอนเลือกสาย (ตั้งค่าได้ 0 = ไม่จับเวลา)
  const limit = state.settings.defuseSeconds
  const [left, setLeft] = useState(limit)

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

  // FIX #29: เดิมพลาดแล้วดัง 2 ครั้ง — defuseFailed ที่นี่ + explosion จาก GameEffects
  // ตอนทีมตกรอบ ตอนนี้ให้ที่นี่เล่นเฉพาะตอนกู้สำเร็จ ส่วนตอนพลาดปล่อยให้
  // GameEffects เล่น explosion ครั้งเดียวตอนทีมตกรอบจริง
  useEffect(() => {
    if (stage !== 'result') return
    if (survived) sfx.defuseSuccess()
  }, [stage, survived])

  function choose(color: Wire) {
    if (stage !== 'choosing') return
    setChosen(color)
    setStage('cutting')
    window.setTimeout(() => setStage('result'), SUSPENSE_MS)
  }

  // FIX #27: นับถอยหลัง + เสียง tick ทุกวินาทีระหว่างเลือกสาย
  // หมดเวลา → ถือว่าตัดสายที่ระบบสุ่มให้ (ผลถูกตัดสินไว้แล้วตั้งแต่ OPEN_CELL อยู่ดี)
  useEffect(() => {
    if (stage !== 'choosing' || limit <= 0) return
    if (left <= 0) {
      choose('red')
      return
    }
    sfx.tick()
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => window.clearTimeout(t)
  }, [stage, left, limit])

  function acknowledge() {
    dispatch({ type: 'CHOOSE_WIRE', wire: chosen ?? 'red' })
  }

  // Space ยืนยันตอนเฉลยผล
  useEffect(() => {
    if (stage !== 'result') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        acknowledge()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage, chosen, acknowledge])

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
            <p className="text-xl text-white/70">{current.name} เลือกสายหนึ่งเพื่อกู้ระเบิด</p>
            {/* FIX #27: นับถอยหลัง */}
            {limit > 0 && (
              <p
                className={`font-mono text-6xl font-black ${
                  left <= 5 ? 'text-red-400 timer-urgent' : 'text-white'
                }`}
                aria-live="polite"
              >
                {Math.max(left, 0)}
              </p>
            )}
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
            <p className="text-2xl">{current.name} ตกรอบ</p>
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
