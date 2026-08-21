import { useRef, useState } from 'react'
import { getSfxVolume, setSfxVolume } from '@/lib/audio/sfx'

// FIX_LISTS ชุดใหม่ #5: ปรับระดับเสียงได้ "ขณะเล่น" ไม่ต้องออกไปหน้าตั้งค่า
// FIX_LISTS ชุดที่สาม #4: แถบเลื่อนกางอยู่ตลอด ไม่ต้องกดปุ่มลำโพงให้บานออกมาก่อน
//   วางไว้บนสุดของแถบมุมขวาบน ถัดจากปุ่ม Light/Dark (App เป็นคนวางแถบให้)
// รอบนี้: ปุ่มลำโพงกดได้ — กดครั้งแรก mute (เหลือ 0 ทันที) กดอีกทีคืนค่าเดิม
export function VolumeControl() {
  // อ่านค่าจริงจากโมดูลเสียง (โหลดมาจาก localStorage ตอน import) ไม่ตั้ง default ซ้อน
  const [volume, setVolume] = useState(() => Math.round(getSfxVolume() * 100))
  // จำระดับเสียงก่อน mute ไว้คืนตอนกดปุ่มซ้ำ — ใช้ ref เพราะไม่ต้อง re-render
  const lastVolume = useRef(volume || 80)

  function apply(v: number) {
    const clamped = Math.min(Math.max(v, 0), 100)
    // จำค่าล่าสุดที่ยัง "มีเสียง" ไว้ทุกครั้ง ไม่ว่าจะมาจากแถบเลื่อนหรือลูกกลิ้ง
    // (ถ้าจำแต่ตอนกดปุ่ม เลื่อนแถบลง 0 เองแล้วกดปุ่มจะคืนค่าเก่าผิด)
    if (clamped > 0) lastVolume.current = clamped
    setVolume(clamped)
    setSfxVolume(clamped / 100)
  }

  // กดลำโพง: มีเสียงอยู่ → ลงไป 0 ทันที / เงียบอยู่ → คืนค่าล่าสุดที่มีเสียง
  function toggleMute() {
    apply(volume > 0 ? 0 : lastVolume.current)
  }

  const muted = volume === 0

  return (
    <div
      className={
        'flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow'
      }
    >
      {/* ปุ่มลำโพง = mute/unmute (0 = เงียบ) icon บอกสถานะไปด้วย */}
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
        aria-pressed={muted}
        className="cursor-pointer text-lg leading-none transition-transform hover:scale-110 active:scale-95"
      >
        <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
      </button>
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
        className="h-2 w-24 accent-primary"
      />
      <span className="w-9 shrink-0 text-right font-mono text-xs font-bold">{volume}%</span>
    </div>
  )
}
