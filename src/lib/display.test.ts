import { beforeEach, describe, expect, it } from 'bun:test'
import {
  applyDisplayMode,
  DISPLAY_SCALE,
  loadDisplayMode,
  setDisplayMode,
} from './display'

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
  // เหตุผลของ defineProperty เหมือน theme.test.ts — localStorage ของ happy-dom
  // เป็น readonly accessor assign ตรง ๆ จะ throw
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage(),
    configurable: true,
    writable: true,
  })
  applyDisplayMode('laptop')
})

describe('display mode (FIX_LISTS ชุดใหม่ #2)', () => {
  it('โหมด laptop = ขนาดเดิมเป๊ะ (scale 1) — ของเดิมต้องไม่เปลี่ยนอะไรเลย', () => {
    expect(DISPLAY_SCALE.laptop).toBe(1)
  })

  it('โหมด tv ขยายจริง และใหญ่กว่า laptop', () => {
    expect(DISPLAY_SCALE.tv).toBeGreaterThan(DISPLAY_SCALE.laptop)
  })

  it('loadDisplayMode() อ่านค่าที่เก็บไว้', () => {
    localStorage.setItem('mn.display', 'tv')
    expect(loadDisplayMode()).toBe('tv')
    localStorage.setItem('mn.display', 'laptop')
    expect(loadDisplayMode()).toBe('laptop')
  })

  it('ค่าเสีย/ไม่มี → ตกกลับเป็น laptop ไม่ throw', () => {
    expect(loadDisplayMode()).toBe('laptop')
    // ค่าขยะ (ผู้ใช้แก้มือ / key ชนกับเวอร์ชันเก่า) ต้องไม่หลุดออกไปเป็นโหมด
    localStorage.setItem('mn.display', 'projector')
    expect(loadDisplayMode()).toBe('laptop')
  })

  it('applyDisplayMode ตั้ง --mn-scale + html font-size + data-display', () => {
    const root = document.documentElement
    applyDisplayMode('tv')
    expect(root.style.getPropertyValue('--mn-scale')).toBe(String(DISPLAY_SCALE.tv))
    expect(root.dataset.display).toBe('tv')
    // 16px คือฐาน rem ปกติ — โหมด TV ต้องได้ 16 * 1.5 = 24px
    expect(root.style.fontSize).toBe(`${16 * DISPLAY_SCALE.tv}px`)

    applyDisplayMode('laptop')
    expect(root.style.getPropertyValue('--mn-scale')).toBe('1')
    expect(root.dataset.display).toBe('laptop')
    expect(root.style.fontSize).toBe('16px')
  })

  it('applyDisplayMode เรียกซ้ำแล้ว idempotent (ไม่สะสมขนาดทบไปเรื่อย ๆ)', () => {
    const root = document.documentElement
    applyDisplayMode('tv')
    const once = root.style.fontSize
    applyDisplayMode('tv')
    expect(root.style.fontSize).toBe(once)
  })

  it("setDisplayMode('tv') เขียน mn.display และทาขนาดทันที", () => {
    setDisplayMode('tv')
    expect(localStorage.getItem('mn.display')).toBe('tv')
    expect(document.documentElement.dataset.display).toBe('tv')
    setDisplayMode('laptop')
    expect(localStorage.getItem('mn.display')).toBe('laptop')
    expect(document.documentElement.dataset.display).toBe('laptop')
  })
})
