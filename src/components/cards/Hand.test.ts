import { describe, expect, test } from 'bun:test'
import { cardWidthFor } from './Hand'

// B7: มือการ์ดถือได้ไม่จำกัด (default maxHandSize=0) พอถึง ~20 ใบ การ์ดเคยล้นออกนอกจอ
// ย่อขนาดตามจำนวนใบก่อน แล้วค่อยปล่อยให้ scroll แนวนอน — แถวต้องเป็นแถวเดียวเสมอ
describe('cardWidthFor', () => {
  test('มือปกติ (<=12 ใบ) ใช้ขนาดเต็ม 64px', () => {
    expect(cardWidthFor(0)).toBe(64)
    expect(cardWidthFor(3)).toBe(64)
    expect(cardWidthFor(12)).toBe(64)
  })

  test('มือเยอะ (13–20 ใบ) ย่อเหลือ 48px', () => {
    expect(cardWidthFor(13)).toBe(48)
    expect(cardWidthFor(20)).toBe(48)
  })

  test('มือเยอะมาก (>20 ใบ) ย่อเหลือ 36px', () => {
    expect(cardWidthFor(21)).toBe(36)
    expect(cardWidthFor(50)).toBe(36)
  })

  test('ยิ่งใบเยอะขนาดยิ่งไม่โตขึ้น (monotonic)', () => {
    let prev = cardWidthFor(0)
    for (let n = 1; n <= 60; n++) {
      const cur = cardWidthFor(n)
      expect(cur).toBeLessThanOrEqual(prev)
      prev = cur
    }
  })
})
