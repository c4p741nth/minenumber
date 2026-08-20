import type { CardType, GameSettings } from './types'

// ค่า default และขอบเขตตาม GAME_SPEC §2
// ห้าม hardcode ตัวเลขพวกนี้กระจายในไฟล์อื่น

export const LIMITS = {
  minTeams: 2,
  maxTeams: 12,
  minRange: 1,
  maxRange: 200,
  minRangeSize: 10,
  maxTurnSeconds: 300,
  maxGlitchRatio: 0.5,
  minScanRadius: 1,
  maxScanRadius: 5,
  maxHandSize: 5,
  // ช่องต้อง ≥ ทีม × 4 ไม่งั้นบล็อกปุ่มเริ่มเกม
  minCellsPerTeam: 4,
} as const

export const DEFAULTS = {
  teamCount: 6,
  rangeMin: 1,
  rangeMax: 60,
  turnSeconds: 60,
  glitchEnabled: true,
  glitchRatio: 0.3,
  cardsEnabled: true,
  scanRadius: 3,
  shrinkingEnabled: false,
} as const

// น้ำหนักสุ่มการ์ดตาม §7.2 — น้ำหนักรวม 100
export const CARD_WEIGHTS: ReadonlyArray<readonly [CardType, number]> = [
  ['scan', 25],
  ['skip', 20],
  ['block', 15],
  ['reverse', 15],
  ['shuffle', 10],
  ['attack', 15],
]

// จำนวนระเบิดจริง = ทีม − 1 (ล็อกตาม §2)
export function bombQuota(teamCount: number): number {
  return Math.max(teamCount - 1, 0)
}

// glitch bomb = ปัดลงของสัดส่วน × ระเบิดจริง
// เป็นระเบิดส่วนเกิน (§4.2)
export function glitchCountFor(realBombs: number, ratio: number): number {
  const clamped = Math.min(Math.max(ratio, 0), LIMITS.maxGlitchRatio)
  return Math.floor(realBombs * clamped)
}

export function defaultTeamNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `ทีม ${String.fromCharCode(65 + i)}`)
}

export function defaultSettings(): GameSettings {
  return {
    teamNames: defaultTeamNames(DEFAULTS.teamCount),
    rangeMin: DEFAULTS.rangeMin,
    rangeMax: DEFAULTS.rangeMax,
    turnSeconds: DEFAULTS.turnSeconds,
    glitchEnabled: DEFAULTS.glitchEnabled,
    glitchRatio: DEFAULTS.glitchRatio,
    cardsEnabled: DEFAULTS.cardsEnabled,
    scanRadius: DEFAULTS.scanRadius,
    shrinkingEnabled: DEFAULTS.shrinkingEnabled,
  }
}