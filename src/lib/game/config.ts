import type { CardType, GameSettings } from './types'

// ค่า default และขอบเขตตาม GAME_SPEC §2
// ห้าม hardcode ตัวเลขพวกนี้กระจายในไฟล์อื่น

export const LIMITS = {
  minTeams: 2,
  // ไม่จำกัดจำนวนทีม (FIX #9) — cap ไว้สูง ๆ กัน input พังเท่านั้น
  maxTeams: 999,
  minRange: 1,
  // ไม่จำกัดจำนวนช่อง (FIX #2) — cap ไว้สูง ๆ กัน render ค้างเท่านั้น
  maxRange: 9999,
  minRangeSize: 10,
  maxTurnSeconds: 300,
  maxDefuseSeconds: 120,
  maxGlitchRatio: 0.5,
  minScanRadius: 1,
  maxScanRadiusCap: 20,
  minHandSize: 3,
  maxHandSizeCap: 7,
  maxStartingHand: 5,
  maxGlitchCount: 999,
} as const

// ช่องขั้นต่ำที่เล่นได้ = จำนวนระเบิดจริง (FIX_LISTS #2/#15)
// เดิมบังคับ ≥ จำนวนทีม ทำให้ตั้งช่อง = จำนวนระเบิดไม่ได้ ทั้งที่เป็นกรณีที่ต้องการจริง:
// ช่อง = ระเบิดจริง → โอกาสโดน 100% → บังคับเข้า cut wire ตั้งแต่ตาแรก
// ต่ำกว่านี้คือมีระเบิดมากกว่าช่อง วางไม่ลงจริง ๆ
export function minCellsFor(teamCount: number): number {
  return Math.max(bombQuota(teamCount), LIMITS.minRange)
}

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
  defuseSeconds: 15,
  sfxVolume: 80, // FIX_LISTS #9
} as const

// น้ำหนักสุ่มการ์ด — น้ำหนักรวม 100
// FIX #24/#25: เพิ่ม shield (กันระเบิดให้ตัวเอง) และ block เปลี่ยนเป็นการ์ดกัน effect
export const CARD_WEIGHTS: ReadonlyArray<readonly [CardType, number]> = [
  ['scan', 22],
  ['skip', 16],
  ['shield', 14],
  ['block', 13],
  ['reverse', 13],
  ['shuffle', 9],
  ['attack', 13],
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
    defuseSeconds: DEFAULTS.defuseSeconds,
    sfxVolume: DEFAULTS.sfxVolume,
  }
}

// FIX_LISTS #1: ช่องเริ่มต้นอัตโนมัติ = ระเบิดจริง + glitch bomb + การ์ดในสำรับ
// เช่น 8 ทีม (ระเบิดจริง 7) + glitch 1 + การ์ด 10 ใบ → 18 ช่อง
// ⚠️ ตัวเลขนี้เป็นแค่ "ค่าเริ่มต้น" — ผู้ใช้ลดลงเหลือเท่าจำนวนระเบิดจริงได้ (#2/#15)
export function autoCellsFor(realBombs: number, glitchBombs: number, deckSize: number): number {
  return Math.max(realBombs + glitchBombs + deckSize, 1)
}
