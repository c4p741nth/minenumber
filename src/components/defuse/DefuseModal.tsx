
import { useEffect, useRef, useState } from 'react'
import { useGame } from '@/components/game/GameProvider'
import { sfx } from '@/lib/audio/sfx'

// FIX_LISTS #3: 'exploded' = ตัดไม่ทันเวลา → ระเบิดทันที (ข้าม stage 'cutting')
// FIX_LISTS ชุดที่สาม #15: ตัด stage 'cutting' ออก — กดสายแล้วรู้ผลทันที ไม่มีช่วงลุ้น
// (ผู้เล่นรออยู่แล้วตอนเลือกสี การหน่วงอีก 2.5 วิ ทำให้จังหวะเกมสะดุด)
type Stage = 'choosing' | 'result' | 'exploded'
type Wire = 'red' | 'blue'

// FIX: สายปลอดภัยถูกสุ่มตอนเข้าเซสชัน (engine) — สีที่เลือกมีผลจริง
// CHOOSE_WIRE ส่งตอนเลือกสี → เอนจินคำนวณผล (defuseResult) แต่ยังไม่จบ turn
// โหมดนี้แค่แสดงผล — ห้ามไปตัดสินใจเอง ผลมาจากเอนจินเท่านั้น
export function DefuseModal() {
  const { state, dispatch } = useGame()
  const [chosen, setChosen] = useState<Wire | null>(null)
  const [stage, setStage] = useState<Stage>('choosing')
  const [reducedMotion, setReducedMotion] = useState(false)

  const current = state.teams[state.currentTeamIndex]
  const survived = state.defuseResult?.survived ?? false
  // FIX_LISTS #3: จอแดง/สั่น ทั้งตอนตัดพลาดและตอนตัดไม่ทันเวลา
  const boom = stage === 'exploded' || (stage === 'result' && !survived)

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

  // FIX #29: ห้ามดัง 2 ครั้ง — เสียงต้องมาจากที่เดียว
  // FIX_LISTS #11: ตอนพลาดต้องดัง "ตอนเฉลยผล" ที่นี่ ไม่ใช่รอ GameEffects
  // ซึ่งยิงตอน state ทีมตกรอบ = ตอนกด "รับทราบ" (ช้ากว่าภาพระเบิดหลายวินาที
  // จนฟังดูเหมือนเสียงลั่นตอนกดปุ่ม) — GameEffects กันเล่นซ้ำผ่าน DEFUSE_FAILED_LOG
  useEffect(() => {
    if (stage !== 'result') return
    if (survived) sfx.defuseSuccess()
    else sfx.explosion()
  }, [stage, survived])

  // FIX_LISTS #3/#4: หมดเวลา = ระเบิดทันที และเสียงระเบิดต้องมาตอนตัวนับเวลาหมด
  // (ไม่รอ GameEffects ที่ยิงตอน state ทีมตกรอบ ซึ่งช้ากว่าเพราะรอ dispatch)
  useEffect(() => {
    if (stage !== 'exploded') return
    sfx.explosion()
  }, [stage])

  function choose(color: Wire) {
    if (stage !== 'choosing') return
    setChosen(color)
    sfx.wireCut() // FIX_LISTS #6
    // FIX: ส่งสีทันทีที่เลือก — ผลถูกผูกกับสายปลอดภัยของเซสชันนี้
    dispatch({ type: 'CHOOSE_WIRE', wire: color })
    // FIX_LISTS ชุดที่สาม #15: เฉลยผลทันที ไม่หน่วงรอ animation
    setStage('result')
  }

  // FIX #27 + FIX_LISTS #3/#5: นับถอยหลัง + เสียง bomb timer ทุกวินาทีระหว่างเลือกสาย
  // หมดเวลา → ระเบิดทันที (เดิมตัดสายให้อัตโนมัติ ทำให้ยังมีโอกาสรอด 50%)
  // ถ้าเลือกสีไปแล้ว (defuseResult ถูกตั้ง) → ผลถูกผูกแล้ว ไม่มี timeout อีก
  useEffect(() => {
    if (stage !== 'choosing' || limit <= 0 || state.defuseResult) return
    if (left <= 0) {
      setStage('exploded')
      return
    }
    sfx.bombTimer()
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => window.clearTimeout(t)
  }, [stage, left, limit, state.defuseResult])

  function acknowledge() {
    // FIX_LISTS #3: ตัดไม่ทัน → ระเบิดทันที ไม่ใช่ผลที่เลือกสีไว้
    if (stage === 'exploded') {
      dispatch({ type: 'DEFUSE_TIMEOUT' })
      return
    }
    dispatch({ type: 'ACK_DEFUSE' })
  }

  // Space ยืนยันตอนเฉลยผล
  useEffect(() => {
    if (stage !== 'result' && stage !== 'exploded') return
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
      className={`defuse-vignette ${boom ? 'defuse-shake' : ''}`}
      role="dialog"
      aria-modal="true"
    >
      {boom && <div className="defuse-flash pointer-events-none fixed inset-0 bg-red-700" />}

      <div className="relative flex w-full max-w-3xl flex-col items-center gap-4 px-4 text-center text-white sm:gap-6">
        {stage === 'result' && survived && <Confetti disabled={reducedMotion} />}

        {stage === 'choosing' && (
          <>
            <p className="section-label text-red-300">ระเบิดจริง!</p>
            <h2 className="font-serif text-4xl font-bold sm:text-6xl">ตัดสาย</h2>
            <p className="text-base text-white/70 sm:text-xl">{current.name} เลือกสายหนึ่งเพื่อกู้ระเบิด</p>
            {/* FIX #27: นับถอยหลัง */}
            {limit > 0 && (
              <p
                className={`font-mono text-5xl font-black sm:text-6xl ${
                  left <= 5 ? 'text-red-400 timer-urgent' : 'text-white'
                }`}
                aria-live="polite"
              >
                {Math.max(left, 0)}
              </p>
            )}
          </>
        )}

        {stage === 'result' && survived && (
          <>
            <h2 className="font-serif text-4xl font-bold text-emerald-300 sm:text-6xl">กู้สำเร็จ!</h2>
            <p className="text-lg sm:text-2xl">ระเบิดย้ายไปที่อื่นแล้ว</p>
          </>
        )}

        {stage === 'result' && !survived && (
          <>
            <h2 className="font-serif text-4xl font-bold text-red-400 sm:text-6xl">ระเบิด!</h2>
            <p className="text-lg sm:text-2xl">{current.name} ตกรอบ</p>
          </>
        )}

        {/* FIX_LISTS #3: ตัดสายไม่ทันเวลา */}
        {stage === 'exploded' && (
          <>
            <h2 className="font-serif text-4xl font-bold text-red-400 sm:text-6xl">หมดเวลา — ระเบิด!</h2>
            <p className="text-lg sm:text-2xl">{current.name} ตัดสายไม่ทัน ตกรอบ</p>
          </>
        )}

        <Wires chosen={chosen} stage={stage} onChoose={choose} />

        {(stage === 'result' || stage === 'exploded') && (
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
        <svg viewBox="0 0 120 220" className="h-36 w-20 sm:h-56 sm:w-28">
          <path d={d} stroke={stroke} strokeWidth="10" fill="none" strokeLinecap="round" />
          {/* FIX_LISTS ชุดที่สาม #15: กรรไกรค้างอยู่บนสายที่ตัด — เห็นว่าตัดสายไหนไปแล้ว
              (เดิมโชว์เฉพาะช่วง 'cutting' ที่ถูกตัดออกไปแล้ว) */}
          {picked && (
            <text x="60" y="120" textAnchor="middle" className="text-3xl">
              ✂
            </text>
          )}
        </svg>
        <span
          className={`mt-2 grid h-12 w-12 place-items-center rounded-full text-2xl sm:h-16 sm:w-16 sm:text-3xl ${
            color === 'red' ? 'bg-red-600' : 'bg-blue-600'
          }`}
        >
          {color === 'red' ? '🔴' : '🔵'}
        </span>
      </button>
    )
  }

  return (
    <div className="flex items-end justify-center gap-8 sm:gap-16">
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
