import { CARD_WEIGHTS } from './config'
import { weightedPick } from './rng'
import type { CardType } from './types'

type Rng = () => number

// จั่วการ์ดสุ่ม 1 ใบ ตามน้ำหนัก (§7.2) — คืน null ถ้ามือเต็ม (maxHandSize = 0 = ไม่จำกัด)
// cardWeights (optional) เป็นการ override น้ำหนักเฉพาะบางชนิด
export function drawRandomCard(
  hand: CardType[],
  rng: Rng,
  maxHandSize: number,
  weights?: Partial<Record<CardType, number>>,
): CardType | null {
  // maxHandSize 0 = ไม่จำกัด — ห้ามใช้ Infinity (JSON.stringify → null ทำ snapshot พัง)
  if (maxHandSize > 0 && hand.length >= maxHandSize) return null
  const merged = weights
    ? CARD_WEIGHTS.map(([c, w]) => [c, weights[c] ?? w] as const)
    : CARD_WEIGHTS
  const card = weightedPick(rng, merged)
  hand.push(card)
  return card
}

// แยก emoji ออกจากชื่อการ์ด — ห้าม slice string เพื่อแยก emoji/ชื่อ
// (emoji บางตัวกิน 1 code unit บางตัว 2 — slicing พัง เช่น ⚔/⏭)
export const CARD_META: Record<CardType, { emoji: string; name: string; th: string }> = {
  scan: { emoji: '🔍', name: 'Scan', th: 'สแกน' },
  skip: { emoji: '⏭', name: 'Skip', th: 'ข้ามตา' },
  shield: { emoji: '🛡', name: 'Shield', th: 'โล่กันระเบิด' },
  block: { emoji: '🚫', name: 'Block', th: 'บล็อก' },
  reverse: { emoji: '🔄', name: 'Reverse', th: 'ย้อนทิศ' },
  shuffle: { emoji: '🎲', name: 'Shuffle', th: 'สับระเบิด' },
  attack: { emoji: '⚔', name: 'Attack', th: 'โจมตี' },
}

// derived — เก็บไว้เพื่อไม่ให้ที่อื่นพัง (เดิมใช้ label แบบรวม)
export const CARD_LABELS: Record<CardType, string> = Object.fromEntries(
  (Object.keys(CARD_META) as CardType[]).map((c) => [c, `${CARD_META[c].emoji} ${CARD_META[c].name}`]),
) as Record<CardType, string>

// สีของแต่ละการ์ด — ใช้ทั้งการ์ด (Hand) และ toast ตอนจั่ว (W5.4) → อยู่ที่นี่ไฟล์เดียว
// FIX #41: ตัวหนังสือเดิมเป็น -700 บนพื้น -500/15 ซึ่งตกเกณฑ์ contrast ในโหมดสว่าง
// ทุกสี (slate แย่สุด ~1.7:1) — ลึกลงเป็น -800/-900 ผ่านเกณฑ์และยังแยกสีออกจากกัน
// คู่ dark:text-*-300 เดิมถูกต้องแล้ว (พื้นมืด ต้องการตัวสว่าง) จึงไม่แตะ
export const CARD_COLORS: Record<CardType, string> = {
  scan: 'border-sky-500 bg-sky-500/15 text-sky-900 dark:text-sky-300',
  skip: 'border-emerald-500 bg-emerald-500/15 text-emerald-900 dark:text-emerald-300',
  shield: 'border-cyan-500 bg-cyan-500/15 text-cyan-900 dark:text-cyan-300',
  block: 'border-slate-500 bg-slate-500/15 text-slate-900 dark:text-slate-300',
  reverse: 'border-orange-500 bg-orange-500/15 text-orange-900 dark:text-orange-300',
  shuffle: 'border-purple-500 bg-purple-500/15 text-purple-900 dark:text-purple-300',
  attack: 'border-red-500 bg-red-500/15 text-red-800 dark:text-red-300',
}

export const CARD_DESCRIPTIONS: Record<CardType, string> = {
  scan: 'เลือกเลข → ตรวจช่วงเลขซ้าย–ขวารอบเลขนั้น (±R) เช่น เลือก 20 รัศมี 3 = ตรวจ 17–23 รวม 7 ช่อง บอกแค่มี/ไม่มีระเบิด',
  skip: 'จบ turn ทันที ไม่ต้องเปิดป้าย (ไม่ได้จั่วการ์ด)',
  shield: 'กางโล่ให้ทีมตัวเอง — ถ้าเหยียบระเบิดจะรอดทันที ไม่ต้องตัดสาย ระเบิดย้ายไปช่องอื่น (ใช้กับทีมตัวเองเท่านั้น กันได้เฉพาะระเบิด)',
  block: 'เก็บไว้กัน effect ที่ทีมอื่นจะใช้ใส่เรา (Attack/Block) — เมื่อโดนจะมี popup ถามว่าจะกันไหม',
  reverse: 'สลับทิศทาง + จบ turn ทันที',
  shuffle: 'สุ่มย้ายตำแหน่งระเบิดทั้งหมดใหม่',
  attack: 'ทีมเป้าหมายต้องเปิดเพิ่ม +1 (โอนกองต่อได้)',
}

// จำนวนชนิดการ์ดในสำรับ — ใช้แสดงที่หน้าตั้งค่า (FIX #11) ห้าม hardcode เลขที่อื่น
export const CARD_DECK_SIZE = Object.keys(CARD_META).length

// FIX #23: Attack เลือกเป้าได้เฉพาะทีมอื่น (ห้ามใส่ตัวเอง) — ดู aliveOpponents ใน engine
// FIX #24/#25: Shield ใช้กับตัวเองเสมอ, Block เป็นการ์ดตั้งรับ — ทั้งคู่ไม่ต้องเลือกเป้า
export function cardNeedsTeamTarget(card: CardType): boolean {
  return card === 'attack'
}

export function cardNeedsCellTarget(card: CardType): boolean {
  return card === 'scan'
}

export function cardEndsTurn(card: CardType): boolean {
  return card === 'skip' || card === 'reverse' || card === 'attack'
}