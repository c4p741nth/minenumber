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
  maxDefendSeconds: 120,
  maxGlitchRatio: 0.5,
  minScanRadius: 1,
  maxScanRadiusCap: 20,
  minHandSize: 3,
  maxHandSizeCap: 7,
  maxStartingHand: 5,
  maxGlitchCount: 999,
  // FIX_LISTS #5: ช่วง turn ที่ glitch bomb ล็อกการใช้ item ได้
  // 0 = โดนแล้วไม่ล็อกเลย (เหลือแค่เสียเวลาเปิดช่อง)
  minGlitchLockTurns: 0,
  maxGlitchLockTurns: 10,
} as const

// ของที่ต้อง "มีที่ยืน" บนกระดาน — ใช้คิดช่องขั้นต่ำ (FIX_LISTS #3)
export interface MinCellsOptions {
  // glitch bomb ที่จะลงกระดานจริง — นับทั้งโหมด manual และ auto (FIX_LISTS ชุดใหม่ #4)
  // เดิมนับเฉพาะ manual ทำให้โหมด auto ลดช่องต่ำกว่าที่ glitch ยืนได้ แล้วโดน clamp หายเงียบ ๆ
  // เช่น ระเบิดจริง 5 + glitch(auto 30% → 1) + การ์ด 7 ต้องได้ขั้นต่ำ 13 ไม่ใช่ 12
  glitchCount?: number
  // การ์ดในสำรับ — เปิดระบบการ์ดแล้วต้องมีช่องให้การ์ดโผล่
  deckSize?: number
}

// ช่องขั้นต่ำที่เล่นได้ = ระเบิดจริง + ของที่เปิดใช้งานอยู่ (FIX_LISTS #3)
// เดิมคืนแค่ระเบิดจริงเสมอ พอผู้ใช้ลดช่องลงชนขั้นต่ำ glitch bomb ที่ตั้งไว้เลย
// ถูก clamp หายไปเงียบ ๆ (glitchCountFor clamp กับ totalCells − realBombs = 0)
// ตอนนี้ minimum ขยับตาม option ที่เปิด: มีแต่ระเบิดจริง → เท่าระเบิดจริง,
// เปิด glitch แบบกำหนดเอง/เปิดการ์ดด้วย → บวกเพิ่มตามจำนวนที่กรอกไว้
export function minCellsFor(teamCount: number, opts: MinCellsOptions = {}): number {
  const extras = Math.max(opts.glitchCount ?? 0, 0) + Math.max(opts.deckSize ?? 0, 0)
  return Math.max(bombQuota(teamCount) + extras, LIMITS.minRange)
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
  // FIX_LISTS #5: โดน glitch แล้วใช้ item ไม่ได้กี่ turn — เดิม hardcode 2 ในเอนจิน
  glitchLockTurns: 2,
  // FIX_LISTS ชุดที่สิบสี่ #3: เหยียบ glitch ซ้ำ = รีเซ็ตเป็นค่าที่ตั้งไว้ (พฤติกรรมเดิม)
  //   เปิด glitchStack ในหน้าตั้งค่าถ้าต้องการให้สะสมทับกันแทน
  glitchStack: false,
  cardsEnabled: true,
  maxHandSize: 0, // 0 = ไม่จำกัด (W5.1)
  startingHand: 3, // แจกขั้นต่ำ 3 ใบ/ทีม (W5.2)
  scanRadius: 3,
  shrinkingEnabled: false,
  defuseSeconds: 15,
  // เวลาตัดสินใจเลือกการ์ดที่จะ Block ตอนโดนโจมตี (0 = ไม่จับเวลา)
  defendSeconds: 30,
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
    glitchLockTurns: DEFAULTS.glitchLockTurns,
    glitchStack: DEFAULTS.glitchStack,
    cardsEnabled: DEFAULTS.cardsEnabled,
    maxHandSize: DEFAULTS.maxHandSize,
    startingHand: DEFAULTS.startingHand,
    scanRadius: DEFAULTS.scanRadius,
    shrinkingEnabled: DEFAULTS.shrinkingEnabled,
    defuseSeconds: DEFAULTS.defuseSeconds,
    defendSeconds: DEFAULTS.defendSeconds,
    sfxVolume: DEFAULTS.sfxVolume,
  }
}

// FIX_LISTS #1: ช่องเริ่มต้นอัตโนมัติ = ระเบิดจริง + glitch bomb + การ์ดในสำรับ
// เช่น 8 ทีม (ระเบิดจริง 7) + glitch 1 + การ์ด 10 ใบ → 18 ช่อง
// ⚠️ ตัวเลขนี้เป็นแค่ "ค่าเริ่มต้น" — ผู้ใช้ลดลงเหลือเท่าจำนวนระเบิดจริงได้ (#2/#15)
export function autoCellsFor(realBombs: number, glitchBombs: number, deckSize: number): number {
  return Math.max(realBombs + glitchBombs + deckSize, 1)
}
