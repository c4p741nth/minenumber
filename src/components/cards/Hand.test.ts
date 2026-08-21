import { describe, expect, test } from 'bun:test'
import { canKeepInHand, cardWidthFor, isFaceUpCard } from './Hand'
import { CARD_META } from '@/lib/game/cards'
import type { CardType } from '@/lib/game/types'

// B7: มือการ์ดถือได้ไม่จำกัด (default maxHandSize=0) พอถึง ~20 ใบ การ์ดเคยล้นออกนอกจอ
// ย่อขนาดตามจำนวนใบก่อน แล้วค่อยปล่อยให้ scroll แนวนอน — แถวต้องเป็นแถวเดียวเสมอ
// FIX_LISTS ชุดที่สาม #9: ขยายทุกขั้น (64/48/36 → 88/68/52) ช่องการ์ดเดิมแคบเกินไป
// FIX_LISTS ชุดที่หก #1: ยังเล็กไป — ขยายอีกรอบ (88/68/52 → 124/96/74)
// FIX_LISTS ชุดที่เจ็ด #1: ขอใหญ่กว่าเดิมอีก 50% — 124/96/74 → 186/144/111
describe('cardWidthFor', () => {
  test('มือปกติ (<=12 ใบ) ใช้ขนาดเต็ม 186px', () => {
    expect(cardWidthFor(0)).toBe(186)
    expect(cardWidthFor(3)).toBe(186)
    expect(cardWidthFor(12)).toBe(186)
  })

  test('มือเยอะ (13–20 ใบ) ย่อเหลือ 144px', () => {
    expect(cardWidthFor(13)).toBe(144)
    expect(cardWidthFor(20)).toBe(144)
  })

  test('มือเยอะมาก (>20 ใบ) ย่อเหลือ 111px', () => {
    expect(cardWidthFor(21)).toBe(111)
    expect(cardWidthFor(50)).toBe(111)
  })

  // ทุกขั้นต้องกว้างกว่าของเดิม — เป็นเจตนาของข้อนี้ ไม่ใช่ผลข้างเคียง
  test('ทุกขั้นกว้างกว่าขนาดเดิม (88/68/52)', () => {
    expect(cardWidthFor(5)).toBeGreaterThan(88)
    expect(cardWidthFor(15)).toBeGreaterThan(68)
    expect(cardWidthFor(30)).toBeGreaterThan(52)
  })

  // FIX_LISTS ชุดที่เจ็ด #1: "ใหญ่กว่าเดิม 50%" — เทียบกับขนาดของชุดที่หก (124/96/74)
  // เขียนเป็นอัตราส่วนแทนการ hardcode ซ้ำ เพื่อให้เจตนา "×1.5" อ่านออกจากเทสตรง ๆ
  test('ใหญ่กว่าขนาดของชุดที่หกพอดี 1.5 เท่า', () => {
    expect(cardWidthFor(5)).toBe(Math.round(124 * 1.5))
    expect(cardWidthFor(15)).toBe(Math.round(96 * 1.5))
    expect(cardWidthFor(30)).toBe(Math.round(74 * 1.5))
  })

  // FIX_LISTS ชุดที่หก #1: "ใหญ่ขึ้นทั้งสองโหมด" — โหมด TV ต้องโตกว่าของเดิมด้วย
  // (ของเดิม tv = round(88*0.75)=66 / round(68*0.75)=51 / round(52*0.75)=39)
  test('โหมด TV ก็ใหญ่ขึ้นกว่าเดิมทุกขั้น (66/51/39)', () => {
    expect(cardWidthFor(5, 'tv')).toBeGreaterThan(66)
    expect(cardWidthFor(15, 'tv')).toBeGreaterThan(51)
    expect(cardWidthFor(30, 'tv')).toBeGreaterThan(39)
  })

  // ตัวคูณ TV อยู่นอกวงเล็บ → โหมด TV ต้องโตขึ้น 1.5 เท่าตามไปด้วย
  test('โหมด TV โตขึ้น 1.5 เท่าตามโหมด laptop', () => {
    expect(cardWidthFor(5, 'tv')).toBe(Math.round(186 * 0.85))
    expect(cardWidthFor(15, 'tv')).toBe(Math.round(144 * 0.85))
    expect(cardWidthFor(30, 'tv')).toBe(Math.round(111 * 0.85))
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
