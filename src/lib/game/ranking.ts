// อันดับเมื่อจบเกม + palette เหรียญ — logic บริสุทธิ์บน Team[] ไม่พึ่ง React/storage
// แยกออกมาจาก GameOverScreen ด้วยเหตุผลเดียวกับที่ hitChance ถูกแยกออกจาก StatusPanel:
// ตอนอยู่ใน component มันเทสไม่ได้ และตอนนี้ TeamList/LeaderboardScreen ต้องใช้ด้วย
import type { Team } from './types'

export interface RankedTeam {
  team: Team
  rank: number
}

export function computeRankings(teams: Team[]): {
  rankings: RankedTeam[]
  isDraw: boolean
  noWinner: boolean
} {
  const alive = teams.filter((t) => t.alive)
  const dead = teams
    .filter((t) => !t.alive)
    .sort((a, b) => (b.eliminatedAt ?? 0) - (a.eliminatedAt ?? 0))
  const isDraw = alive.length > 1
  const noWinner = alive.length === 0
  const rankings: RankedTeam[] = []
  if (alive.length > 0) {
    for (const t of alive) rankings.push({ team: t, rank: 1 })
    dead.forEach((t, i) => rankings.push({ team: t, rank: i + 2 }))
  } else {
    // ทุกทีมตาย — ตายทีหลังสุด = อันดับดีกว่า
    dead.forEach((t, i) => rankings.push({ team: t, rank: i + 1 }))
  }
  return { rankings, isDraw, noWinner }
}

// FIX #38: เหรียญชุดเดียวใช้ทั้งใน Podium, TeamList ตอนเล่น และ leaderboard
export const MEDAL_EMOJI = ['🥇', '🥈', '🥉'] as const

// FIX #38: สีพื้น/ขอบตามเหรียญ — อันดับ 4+ คืน '' (ไม่มีเหรียญ)
// มีคู่ dark: ครบทุกอัน เพราะข้อ 41 จะเปิดโหมดมืดให้ใช้งานจริง
export function medalClass(rank: number): string {
  switch (rank) {
    case 1:
      return 'border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100'
    case 2:
      return 'border-slate-400 bg-slate-100 text-slate-900 dark:bg-slate-400/20 dark:text-slate-100'
    case 3:
      return 'border-orange-500 bg-orange-100 text-orange-900 dark:bg-orange-600/20 dark:text-orange-100'
    default:
      return ''
  }
}

// FIX #38: อันดับสุดท้ายของทีมที่ "ตายแล้ว" ถูกล็อกตั้งแต่วินาทีที่ตายและไม่เปลี่ยนอีก
// (ตายคนแรกในเกม 4 ทีม = ที่ 4 เสมอ ไม่ว่าเกมจะเดินต่อยังไง)
export function finalPlaceOfDead(totalTeams: number, eliminatedAt: number): number {
  return totalTeams - eliminatedAt + 1
}

// FIX #38: ระหว่างเล่นเปิดแค่ "ทองแดง" — ทอง/เงินยังไม่รู้ผลจนกว่าเกมจะจบ
// ทองแดงจึงโผล่ตอนมีทีมตกรอบจนเหลือ 3 ทีมพอดี (ทีมที่เพิ่งตายได้ที่ 3)
//
// ⚠️ ห้ามใช้ rank ระหว่างเล่นมาตัดสินเหรียญตรง ๆ — rank ตอนนั้นไม่ใช่อันดับสุดท้าย
// (ทีมที่รอดแชร์ rank 1 กันหมด, ทีมที่เพิ่งตายได้ rank 2 ไม่ใช่ 3)
export function visibleMedal(
  team: { alive: boolean; eliminatedAt: number | null },
  totalTeams: number,
  isGameover: boolean,
  rank: number,
): number | null {
  if (isGameover) return rank <= 3 ? rank : null
  if (team.alive || team.eliminatedAt === null) return null
  return finalPlaceOfDead(totalTeams, team.eliminatedAt) === 3 ? 3 : null
}
