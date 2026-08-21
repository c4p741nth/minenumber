// ความสมดุลของเกมสัมพันธ์กับช่วงตัวเลข — ใช้แนะนำผู้เล่นในหน้าตั้งค่า
import { minCellsFor, type MinCellsOptions } from './config'

// ความหนาแน่นระเบิด = ระเบิดทั้งหมด / ช่องทั้งหมด
export function bombDensity(totalBombs: number, totalCells: number): number {
  if (totalCells <= 0) return 0
  return totalBombs / totalCells
}

export type BalanceVerdict = 'too-easy' | 'good' | 'risky' | 'brutal'

// เกณฑ์เดียวกับสีของ bar โอกาสโดนระเบิด (W2.2) — อย่าตั้งเกณฑ์ซ้อนคนละชุด
//   < 0.15  too-easy   เขียว   ระเบิดน้อย เปิดกันสบาย
//   0.15–0.30 good      เหลือง  พอดี ๆ ต้องระวังบ้าง
//   0.30–0.50 risky     ส้ม    เริ่มอันตราย
//   > 0.50   brutal     แดง    โดนง่ายมาก
export function verdictFor(density: number): BalanceVerdict {
  if (density < 0.15) return 'too-easy'
  if (density <= 0.3) return 'good'
  if (density <= 0.5) return 'risky'
  return 'brutal'
}

// แนะนำช่วงตัวเลขที่เหมาะกับจำนวนทีม — target density ≈ 0.2 (โซน good)
// max ≈ min + round((teams − 1) / 0.2) เมื่อ min = 1 (ระเบิดจริง = ทีม − 1)
export function suggestRange(teamCount: number): { min: number; max: number } {
  const min = 1
  const span = Math.max(teamCount - 1, 1)
  const max = min + Math.round(span / 0.2)
  return { min, max }
}

// โอกาสที่ "การเปิดช่องถัดไปแบบสุ่ม" จะโดนระเบิด = ระเบิดทั้งหมด / ช่องที่ยังไม่เปิด
export function hitChance(totalBombs: number, hiddenCells: number): number {
  if (hiddenCells <= 0) return 0
  return Math.min(Math.max(totalBombs / hiddenCells, 0), 1)
}

// สรุปผลสำหรับแสดง bar โอกาสโดนระเบิดในหน้าตั้งค่า (W2.3)
export type ChanceDisplay =
  | { kind: 'unplayable'; text: string }
  | { kind: 'certain'; text: string; percent: 100 }
  | { kind: 'normal'; percent: number; level: BalanceVerdict }

export function chanceDisplay(
  bombs: number,
  cells: number,
  teams: number,
  minOpts: MinCellsOptions = {},
): ChanceDisplay {
  if (cells < minCellsFor(teams, minOpts)) {
    return { kind: 'unplayable', text: 'เล่นยังไงก่อน (มันเล่นไม่ได้ ช่องน้อยไป๊)' }
  }
  if (bombs >= cells) {
    return { kind: 'certain', text: 'หลบยังไงก่อน (100%)', percent: 100 }
  }
  const chance = hitChance(bombs, cells)
  return { kind: 'normal', percent: Math.round(chance * 100), level: verdictFor(chance) }
}
// FIX_LISTS #14: ช่องที่ยังไม่เปิดเหลือเท่ากับจำนวนระเบิดจริง → เปิดช่องไหนก็เจอระเบิด
// (โอกาสโดน 100%) เกมเข้าโหมด "แข่งกันตัดสาย" สลับทีมไปมาจนกว่าจะจบ
// นับเฉพาะระเบิดจริง — glitch เป็นระเบิดส่วนเกินที่ไม่ทำให้ตกรอบ (#16)
export function isForcedWireCut(realBombs: number, hiddenCells: number): boolean {
  return hiddenCells > 0 && realBombs >= hiddenCells
}
