
import { useState } from 'react'
import { loadTheme, setTheme, type Theme } from '@/lib/theme'

// FIX #41: ปุ่มสลับสว่าง/มืด
// วางเป็น element fixed นอก switch ของ App เพื่อให้ปุ่มเดียวครอบทุกหน้า
// (เมนู/ตั้งค่า/เล่น/leaderboard) ไม่ต้องแก้ทั้ง 4 หน้า — คู่กับที่ GameScreen
// ทำกับ MuteButton
export function ThemeToggle() {
  // ค่าตั้งต้นอ่านจากที่ theme.ts ทาไว้แล้วตอน bootstrap — ไม่ทาซ้ำตอน mount
  const [theme, setLocal] = useState<Theme>(() => loadTheme())

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setLocal(next)
    setTheme(next)
  }

  return (
    <button
      onClick={toggle}
      className="theme-toggle fixed right-3 top-3 z-50"
      title={theme === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
      aria-label="สลับธีมสว่าง/มืด"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
