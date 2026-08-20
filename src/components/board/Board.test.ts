import { describe, expect, test } from 'bun:test'
import { cellSizeFor } from './Board'

// B8: กระดานช่องเยอะต้องย่อขนาดช่องลง เพื่อให้ได้คอลัมน์ต่อแถวมากขึ้น (หน้าไม่ยาวเกิน)
describe('cellSizeFor', () => {
  test('กระดานเล็ก (<=60 ช่อง) ใช้ขนาดเต็ม 56px', () => {
    expect(cellSizeFor(1)).toBe(56)
    expect(cellSizeFor(30)).toBe(56)
    expect(cellSizeFor(60)).toBe(56)
  })

  test('กระดานกลาง (61–120 ช่อง) ย่อเหลือ 48px', () => {
    expect(cellSizeFor(61)).toBe(48)
    expect(cellSizeFor(120)).toBe(48)
  })

  test('กระดานใหญ่ (>120 ช่อง) ย่อเหลือ 40px', () => {
    expect(cellSizeFor(121)).toBe(40)
    expect(cellSizeFor(200)).toBe(40)
  })

  test('ยิ่งช่องเยอะขนาดยิ่งไม่โตขึ้น (monotonic)', () => {
    let prev = cellSizeFor(1)
    for (let n = 2; n <= 200; n++) {
      const cur = cellSizeFor(n)
      expect(cur).toBeLessThanOrEqual(prev)
      prev = cur
    }
  })
})
