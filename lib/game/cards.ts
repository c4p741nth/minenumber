import { CARD_WEIGHTS, LIMITS } from './config'
import { weightedPick } from './rng'
import type { CardType } from './types'

type Rng = () => number

// จั่วการ์ดสุ่ม 1 ใบ ตามน้ำหนัก (§7.2) — คืน null ถ้ามือเต็ม
export function drawRandomCard(hand: CardType[], rng: Rng): CardType | null {
  if (hand.length >= LIMITS.maxHandSize) return null
  const card = weightedPick(rng, CARD_WEIGHTS)
  hand.push(card)
  return card
}

// แยก emoji ออกจากชื่อการ์ด — ห้าม slice string เพื่อแยก emoji/ชื่อ
// (emoji บางตัวกิน 1 code unit บางตัว 2 — slicing พัง เช่น ⚔/⏭)
export const CARD_META: Record<CardType, { emoji: string; name: string; th: string }> = {
  scan: { emoji: '🔍', name: 'Scan', th: 'สแกน' },
  skip: { emoji: '⏭', name: 'Skip', th: 'ข้ามตา' },
  block: { emoji: '🛡', name: 'Block', th: 'บล็อก' },
  reverse: { emoji: '🔄', name: 'Reverse', th: 'ย้อนทิศ' },
  shuffle: { emoji: '🎲', name: 'Shuffle', th: 'สับระเบิด' },
  attack: { emoji: '⚔', name: 'Attack', th: 'โจมตี' },
}

// derived — เก็บไว้เพื่อไม่ให้ที่อื่นพัง (เดิมใช้ label แบบรวม)
export const CARD_LABELS: Record<CardType, string> = Object.fromEntries(
  (Object.keys(CARD_META) as CardType[]).map((c) => [c, `${CARD_META[c].emoji} ${CARD_META[c].name}`]),
) as Record<CardType, string>

export const CARD_DESCRIPTIONS: Record<CardType, string> = {
  scan: 'เลือกเลข → บอกว่ามีระเบิดในช่วง ±R หรือไม่ (มี/ไม่มี)',
  skip: 'จบ turn ทันที ไม่ต้องเปิดป้าย (ไม่ได้จั่วการ์ด)',
  block: 'ทีมเป้าหมายใช้การ์ดไม่ได้ใน turn ถัดไป',
  reverse: 'สลับทิศทาง + จบ turn ทันที',
  shuffle: 'สุ่มย้ายตำแหน่งระเบิดทั้งหมดใหม่',
  attack: 'ทีมเป้าหมายต้องเปิดเพิ่ม +1 (โอนกองต่อได้)',
}

export function cardNeedsTeamTarget(card: CardType): boolean {
  return card === 'block' || card === 'attack'
}

export function cardNeedsCellTarget(card: CardType): boolean {
  return card === 'scan'
}

export function cardEndsTurn(card: CardType): boolean {
  return card === 'skip' || card === 'reverse' || card === 'attack'
}