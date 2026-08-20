import { describe, expect, test } from 'bun:test'
import { canKeepInHand, cardWidthFor, isFaceUpCard } from './Hand'
import { CARD_META } from '@/lib/game/cards'
import type { CardType } from '@/lib/game/types'

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

// FIX #43: Block มองเห็นได้ (หงายหน้า) และเก็บไว้ในมือได้ ไม่ถูกบังคับใช้/ทิ้ง
describe('isFaceUpCard / canKeepInHand', () => {
  const ALL = Object.keys(CARD_META) as CardType[]

  test('Block หงายหน้าและเก็บไว้ได้', () => {
    expect(isFaceUpCard('block')).toBe(true)
    expect(canKeepInHand('block')).toBe(true)
  })

  // วน key จาก CARD_META เพื่อให้การ์ดชนิดใหม่ในอนาคตถูกบังคับให้ตัดสินใจโดย default
  // (ถ้าใครเพิ่มการ์ดแล้วอยากให้หงาย ต้องมาแก้เทสนี้ = ตั้งใจแล้ว)
  test('การ์ดอื่นทั้งหมดยังคว่ำและบังคับตัดสินใจ', () => {
    for (const c of ALL.filter((c) => c !== 'block')) {
      expect(isFaceUpCard(c)).toBe(false)
      expect(canKeepInHand(c)).toBe(false)
    }
  })

  test('ครอบทุกชนิดในสำรับ (ไม่มีชนิดไหนหลุด)', () => {
    expect(ALL.length).toBeGreaterThan(1)
    expect(ALL.filter(isFaceUpCard)).toEqual(['block'])
  })

  // คู่กันโดยเจตนา: หงายอยู่แล้ว = ไม่มีข้อมูลลับให้รั่ว = ไม่ต้องบังคับตัดสินใจ
  test('หงายหน้า ⇔ เก็บไว้ได้ (สองอย่างนี้ผูกกัน)', () => {
    for (const c of ALL) expect(canKeepInHand(c)).toBe(isFaceUpCard(c))
  })
})
