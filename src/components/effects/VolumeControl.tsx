import { useEffect, useRef, useState } from 'react'
import { getSfxVolume, setSfxVolume } from '@/lib/audio/sfx'

// FIX_LISTS ชุดใหม่ #5: ปรับระดับเสียงได้ "ขณะเล่น" ไม่ต้องออกไปหน้าตั้งค่า
// กดปุ่มลำโพง → บานแถบเลื่อนออกมา ปรับแล้วมีผลทันที (sfx.ts เก็บลง localStorage ให้เอง)
export function VolumeControl() {
  // อ่านค่าจริงจากโมดูลเสียง (โหลดมาจาก localStorage ตอน import) ไม่ตั้ง default ซ้อน
  const [volume, setVolume] = useState(() => Math.round(getSfxVolume() * 100))
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  function apply(v: number) {
    const clamped = Math.min(Math.max(v, 0), 100)
    setVolume(clamped)
    setSfxVolume(clamped / 100)
  }

  // คลิกนอกกล่อง / กด Esc → หุบแถบเลื่อน (กันบังกระดานค้างไว้)
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="grid h-12 w-12 place-items-center rounded-full border border-border bg-card text-2xl shadow"
        title="ปรับระดับเสียง"
        aria-label="ปรับระดับเสียง"
        aria-expanded={open}
      >
        🎚
      </button>
      {open && (
        <div
          className={
            'absolute right-0 top-14 flex w-56 items-center gap-3 rounded-xl border border-border ' +
            'bg-card p-3 shadow-2xl'
          }
        >
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => apply(Number(e.target.value))}
            // ลูกกลิ้งเมาส์ปรับได้ — preventDefault กันหน้า scroll ตาม (เหมือนหน้าตั้งค่า)
            onWheel={(e) => {
              e.preventDefault()
              apply(volume + (e.deltaY < 0 ? 5 : -5))
            }}
            aria-label="ระดับเสียง Effect"
            className="h-2 min-w-0 flex-1 accent-[var(--primary)]"
          />
          <span className="w-12 shrink-0 text-right font-mono text-sm font-bold">{volume}%</span>
        </div>
      )}
    </div>
  )
}
