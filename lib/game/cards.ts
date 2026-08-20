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

export const CARD_LABELS: Record<CardType, string> = {
  scan: '🔍 Scan',
  skip: '⏭ Skip',
  block: '🛡 Block',
  reverse: '🔄 Reverse',
  shuffle: '🎲 Shuffle',
  attack: '⚔ Attack',
}

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