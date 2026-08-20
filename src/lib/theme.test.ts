import { beforeEach, describe, expect, it } from 'bun:test'
import { applyTheme, loadTheme, setTheme } from './theme'

function mockStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v)
    },
    removeItem: (k) => {
      map.delete(k)
    },
    clear: () => {
      map.clear()
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size
    },
  }
}

beforeEach(() => {
  // เหตุผลของ defineProperty เหมือน leaderboard.test.ts — localStorage ของ
  // happy-dom เป็น readonly accessor assign ตรง ๆ จะ throw
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage(),
    configurable: true,
    writable: true,
  })
  document.documentElement.classList.remove('dark')
})

describe('theme (FIX #41)', () => {
  it('loadTheme() อ่านค่าที่เก็บไว้', () => {
    localStorage.setItem('mn.theme', 'dark')
    expect(loadTheme()).toBe('dark')
    localStorage.setItem('mn.theme', 'light')
    expect(loadTheme()).toBe('light')
  })

  it('ค่าเสีย/ไม่มี → fallback ไม่ throw และได้ค่าที่ใช้ได้จริง', () => {
    // ไม่มีค่า
    expect(['light', 'dark']).toContain(loadTheme())
    // ค่าขยะ (เช่นผู้ใช้แก้มือ หรือ key ชนกับเวอร์ชันเก่า) ต้องไม่หลุดออกไปเป็น theme
    localStorage.setItem('mn.theme', 'tactical')
    expect(['light', 'dark']).toContain(loadTheme())
    expect(loadTheme()).not.toBe('tactical')
  })

  it("setTheme('dark') เขียน mn.theme และทาธีมทันที", () => {
    setTheme('dark')
    expect(localStorage.getItem('mn.theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    setTheme('light')
    expect(localStorage.getItem('mn.theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('applyTheme toggle class dark บน root ได้ทั้ง 2 ทาง', () => {
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    // เรียกซ้ำต้อง idempotent ไม่ใช่สลับกลับ (classList.toggle แบบไม่ส่ง force จะสลับ)
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('applyTheme อัปเดต <meta name="theme-color"> ทุกตัว และถอด media ทิ้ง', () => {
    // จำลอง index.html จริงที่มี meta คู่ media light/dark เป็นค่าตั้งต้น
    const metas = (['light', 'dark'] as const).map((mode) => {
      const m = document.createElement('meta')
      m.setAttribute('name', 'theme-color')
      m.setAttribute('media', `(prefers-color-scheme: ${mode})`)
      m.setAttribute('content', mode === 'light' ? '#f5f3ee' : '#0d1117')
      document.head.appendChild(m)
      return m
    })
    // เลือกสว่างบนเครื่องที่ตั้งมืดไว้: ถ้าอัปเดตแค่ตัวแรกหรือไม่ถอด media
    // ตัวที่ media ยัง match จะชนะ แถบ browser เข้มค้างไว้
    applyTheme('light')
    for (const m of metas) {
      expect(m.getAttribute('content')).toBe('#f5f3ee')
      expect(m.getAttribute('media')).toBeNull()
    }
    applyTheme('dark')
    for (const m of metas) expect(m.getAttribute('content')).toBe('#0d1117')
    for (const m of metas) m.remove()
  })
})
