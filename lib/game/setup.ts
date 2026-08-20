import type { BombKind, CellState, GameSettings } from './types'
import { bombQuota, glitchCountFor } from './config'
import { shuffle } from './rng'

type Rng = () => number

// สร้างแผนที่ระเบิดตอนเริ่มเกม
// ระเบิดจริง = ทีม − 1 (โควตา §2)
// glitch เป็นส่วนเกินตามสัดส่วน (§4.2)
export function setupBombs(settings: GameSettings, rng: Rng): Map<number, BombKind> {
  const { rangeMin, rangeMax, teamNames, glitchEnabled, glitchRatio } = settings
  const totalCells = rangeMax - rangeMin + 1
  const realCount = Math.min(bombQuota(teamNames.length), totalCells)
  let glitchCount = 0
  if (glitchEnabled) {
    // glitch นับเฉพาะโควตา real (ปัดลง) — ตัดถ้าช่องเหลือไม่พอ
    glitchCount = Math.min(glitchCountFor(realCount, glitchRatio), totalCells - realCount)
  }
  const count = realCount + glitchCount

  const pool: number[] = []
  for (let n = rangeMin; n <= rangeMax; n++) pool.push(n)
  const shuffled = shuffle(rng, pool)

  const bombs = new Map<number, BombKind>()
  for (let i = 0; i < count; i++) {
    bombs.set(shuffled[i], i < realCount ? 'real' : 'glitch')
  }
  return bombs
}

// Safety net (§8): เมื่อระเบิดหมดแต่ยังเหลือ >1 ทีม
// ให้เติมให้ครบ `ทีมที่รอด − 1` เป็น real bomb ล้วน (โควตา)
// ลงในช่อง hidden เท่านั้น
// หมายเหตุ: ตามกติกาจริง สถานะนี้เกิดไม่ได้
// (ระเบิดจริงหายได้เฉพาะตอนคัดทีมออก) แต่เก็บไว้กันการค้างเกม
// แยกเป็น pure function เพื่อให้ test ตรง ๆ ได้
export function refillBombs(
  bombs: Map<number, BombKind>,
  cells: Record<number, CellState>,
  rangeMin: number,
  rangeMax: number,
  aliveCount: number,
  rng: Rng,
): number {
  const target = Math.max(aliveCount - 1, 0)
  const hidden: number[] = []
  for (let n = rangeMin; n <= rangeMax; n++) {
    if (!(n in cells) && !bombs.has(n)) hidden.push(n)
  }
  const need = Math.min(target, hidden.length)
  const shuffled = shuffle(rng, hidden)
  for (let i = 0; i < need; i++) bombs.set(shuffled[i], 'real')
  return need
}