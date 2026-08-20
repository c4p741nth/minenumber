// ความสมดุลของเกมสัมพันธ์กับช่วงตัวเลข — ใช้แนะนำผู้เล่นในหน้าตั้งค่า

// ความหนาแน่นระเบิด = ระเบิดทั้งหมด / ช่องทั้งหมด
export function bombDensity(totalBombs: number, totalCells: number): number {
  if (totalCells <= 0) return 0
  return totalBombs / totalCells
}

export type BalanceVerdict = 'too-easy' | 'good' | 'risky' | 'brutal'

// เกณฑ์แนะนำ (ล็อกด้วย test):
//   < 0.08  too-easy   เปิดกันยาว น่าเบื่อ
//   0.08–0.20 good
//   0.20–0.35 risky
//   > 0.35   brutal
export function verdictFor(density: number): BalanceVerdict {
  if (density < 0.08) return 'too-easy'
  if (density <= 0.2) return 'good'
  if (density <= 0.35) return 'risky'
  return 'brutal'
}

// แนะนำช่วงตัวเลขที่เหมาะกับจำนวนทีม — target density ≈ 0.13
// max ≈ min + round((teams − 1) / 0.13) เมื่อ min = 1 (ระเบิดจริง = ทีม − 1)
export function suggestRange(teamCount: number): { min: number; max: number } {
  const min = 1
  const span = Math.max(teamCount - 1, 1)
  const max = min + Math.round(span / 0.13)
  return { min, max }
}