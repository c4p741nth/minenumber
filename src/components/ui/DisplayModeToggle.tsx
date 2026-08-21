import { useEffect, useState } from 'react'
import {
  DISPLAY_LABELS,
  loadDisplayMode,
  setDisplayMode,
  type DisplayMode,
} from '@/lib/display'

// FIX_LISTS ชุดใหม่ #2: สลับ Laptop ↔ TV
// วางคู่กับ ThemeToggle (fixed มุมขวาบน) เพื่อให้ครอบทุกหน้าด้วย element เดียว
// เหมือนที่ FIX #41 ทำกับปุ่มธีม — ไม่ต้องไปแก้ทั้ง 4 หน้า
export function DisplayModeToggle() {
  // ค่าตั้งต้นอ่านจากที่ display.ts ทาไว้แล้วตอน bootstrap — ไม่ทาซ้ำตอน mount
  const [mode, setLocal] = useState<DisplayMode>(() => loadDisplayMode())
  const [fullscreen, setFullscreen] = useState(false)

  // ผู้ใช้กด F11/Esc เองได้ ปุ่มจึงต้องตามสถานะจริงของ browser ไม่ใช่จำเอง
  useEffect(() => {
    function sync() {
      setFullscreen(globalThis.document?.fullscreenElement != null)
    }
    sync()
    globalThis.document?.addEventListener('fullscreenchange', sync)
    return () => globalThis.document?.removeEventListener('fullscreenchange', sync)
  }, [])

  // FIX_LISTS ชุดที่เจ็ด #6: ปุ่มต้องโชว์ "โหมดที่จะได้ถ้ากด" ไม่ใช่โหมดที่อยู่ตอนนี้
  //   ให้ตรงกับ ThemeToggle ที่โหมดมืดโชว์ ☀️ (= กดแล้วสว่าง) ไม่ใช่ 🌙
  //   อยู่ Laptop → โชว์ 📺 TV, อยู่ TV → โชว์ 💻 Laptop
  const next: DisplayMode = mode === 'tv' ? 'laptop' : 'tv'
  const label = DISPLAY_LABELS[mode]
  const nextLabel = DISPLAY_LABELS[next]

  function toggle() {
    setLocal(next)
    setDisplayMode(next)
  }

  // requestFullscreen ต้องมาจาก user gesture — เรียกในปุ่มเท่านั้น
  // (F11 ของ browser ก็ยังใช้ได้เหมือนเดิม ปุ่มนี้แค่ทางลัดสำหรับ MC ที่ใช้เมาส์)
  function toggleFullscreen() {
    const doc = globalThis.document
    if (!doc) return
    if (doc.fullscreenElement) void doc.exitFullscreen?.()
    else void doc.documentElement.requestFullscreen?.()
  }

  // App วาง fixed bar ให้แล้ว — ที่นี่คืนแค่ปุ่มสองตัวเรียงกัน
  return (
    <>
      <button
        onClick={toggleFullscreen}
        className="theme-toggle"
        title={fullscreen ? 'ออกจากเต็มจอ' : 'เต็มจอ (เท่ากับกด F11)'}
        aria-label={fullscreen ? 'ออกจากเต็มจอ' : 'เต็มจอ'}
      >
        {fullscreen ? '🗗' : '⛶'}
      </button>
      <button
        onClick={toggle}
        className="theme-toggle"
        title={`กดเพื่อสลับเป็น${nextLabel.name} — ${nextLabel.hint} (ตอนนี้: ${label.name})`}
        aria-label={`สลับเป็น${nextLabel.name} — ตอนนี้ ${label.name}`}
      >
        <span aria-hidden="true">{nextLabel.icon}</span>
        {/* จอแคบไม่ต้องมีตัวหนังสือ ปุ่มจะได้ไม่เบียดปุ่มอื่น */}
        <span className="ml-1.5 hidden sm:inline">{next === 'tv' ? 'TV' : 'Laptop'}</span>
      </button>
    </>
  )
}
