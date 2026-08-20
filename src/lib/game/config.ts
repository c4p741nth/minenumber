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
  maxScanRadiusCap: 20,
  minHandSize: 3,
  maxHandSizeCap: 7,
  maxStartingHand: 5,
  maxGlitchCount: 50,
  // ช่องต้อง ≥ ทีม × 4 ไม่งั้นบล็อกปุ่มเริ่มเกม
  minCellsPerTeam: 4,
} as const

export const DEFAULTS = {
  teamCount: 6,
  rangeMin: 1,
  rangeMax: 60,
  turnSeconds: 60,
  glitchEnabled: true,
  glitchMode: 'auto' as const,
  glitchRatio: 0.3,
  glitchCount: 0,
  cardsEnabled: true,
  maxHandSize: 0, // 0 = ไม่จำกัด (W5.1)
  startingHand: 3, // แจกขั้นต่ำ 3 ใบ/ทีม (W5.2)
  scanRadius: 3,
  shrinkingEnabled: false,
  musicUrl: '',
  musicVolume: 30,
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

// glitch bomb จำนวนลูก — auto = ปัดลงของสัดส่วน × ระเบิดจริง
// manual = ใช้ค่าที่ตั้งไว้ ต่างก็ clamp ไม่เกินช่องว่าง (totalCells − realBombs)
export function glitchCountFor(
  realBombs: number,
  totalCells: number,
  mode: 'auto' | 'manual',
  ratio: number,
  count: number,
): number {
  const base = mode === 'auto' ? Math.floor(realBombs * Math.min(Math.max(ratio, 0), LIMITS.maxGlitchRatio)) : count
  return Math.min(Math.max(base, 0), Math.max(totalCells - realBombs, 0))
}

export function defaultTeamNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `ทีม ${i + 1}`)
}

// รัศมี scan สูงสุดที่มีความหมาย ≈ 10% ของกระดาน (clamp 1–20) — W6.2
export function maxScanRadiusFor(totalCells: number): number {
  return Math.min(
    Math.max(Math.round(totalCells * 0.1), LIMITS.minScanRadius),
    LIMITS.maxScanRadiusCap,
  )
}

// รัศมีแนะนำอัตโนมัติ ≈ 5% ของกระดาน (clamp 1–20) — W6.2
export function suggestedScanRadius(totalCells: number): number {
  return Math.min(
    Math.max(Math.round(totalCells * 0.05), LIMITS.minScanRadius),
    LIMITS.maxScanRadiusCap,
  )
}

export function defaultSettings(): GameSettings {
  return {
    teamNames: defaultTeamNames(DEFAULTS.teamCount),
    rangeMin: DEFAULTS.rangeMin,
    rangeMax: DEFAULTS.rangeMax,
    turnSeconds: DEFAULTS.turnSeconds,
    glitchEnabled: DEFAULTS.glitchEnabled,
    glitchMode: DEFAULTS.glitchMode,
    glitchRatio: DEFAULTS.glitchRatio,
    glitchCount: DEFAULTS.glitchCount,
    cardsEnabled: DEFAULTS.cardsEnabled,
    maxHandSize: DEFAULTS.maxHandSize,
    startingHand: DEFAULTS.startingHand,
    scanRadius: DEFAULTS.scanRadius,
    shrinkingEnabled: DEFAULTS.shrinkingEnabled,
    musicUrl: DEFAULTS.musicUrl,
    musicVolume: DEFAULTS.musicVolume,
  }
}