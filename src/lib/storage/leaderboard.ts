// ประวัติผลเกมข้ามรอบ — plain JSON (ไม่เข้ารหัส ไม่ใช่ความลับเหมือนตำแหน่งระเบิด)
import type { CardType } from '../game/types'

const KEY = 'mn.leaderboard'
const MAX_ROWS = 200

export interface MatchRecord {
  id: string
  playedAt: number
  teamName: string
  rank: number
  totalTeams: number
  // FIX: "รอบที่รอด" แทน "ป้ายที่เปิด" — optional เพราะ record เก่ายังมี opens ไม่มีค่านี้
  survivedRounds?: number
  defusesSucceeded: number
  cardsPlayed: number
  survived: boolean
}

export interface TeamAggregate {
  teamName: string
  games: number
  wins: number
  points: number
  survivedRounds: number
  survived: number
}

// FIX #37: คะแนนลดหลั่นตามจำนวนทีม — ที่ 1 ได้ (ทีมทั้งหมด − 1), ทีมสุดท้ายได้ 0
// เช่น 8 ทีม → ที่ 1 = 7 แต้ม, ที่ 2 = 6, ..., ที่ 8 = 0
export function pointsForRank(rank: number, totalTeams: number): number {
  if (!Number.isFinite(rank) || !Number.isFinite(totalTeams)) return 0
  return Math.max(totalTeams - rank, 0)
}

export function loadLeaderboard(): MatchRecord[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r): r is MatchRecord => isMatchRecord(r))
  } catch {
    return []
  }
}

function isMatchRecord(r: unknown): r is MatchRecord {
  if (typeof r !== 'object' || r === null) return false
  const o = r as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.playedAt === 'number' &&
    typeof o.teamName === 'string' &&
    typeof o.rank === 'number' &&
    typeof o.totalTeams === 'number'
  )
}

export function appendMatch(records: MatchRecord[]): void {
  if (records.length === 0) return
  const merged = [...loadLeaderboard(), ...records]
  const trimmed = merged.slice(-MAX_ROWS)
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(trimmed))
  } catch {
    // ignore
  }
}

export function clearLeaderboard(): void {
  try {
    globalThis.localStorage?.removeItem(KEY)
  } catch {
    // ignore
  }
}

// รวมสถิติรายทีม เรียงตามแต้มรวม (เสมอให้เรียงตามชนะ แล้วชื่อ)
export function aggregateByTeam(records: MatchRecord[]): TeamAggregate[] {
  const map = new Map<string, TeamAggregate>()
  for (const r of records) {
    const cur = map.get(r.teamName) ?? {
      teamName: r.teamName,
      games: 0,
      wins: 0,
      points: 0,
      survivedRounds: 0,
      survived: 0,
    }
    cur.games += 1
    if (r.rank === 1) cur.wins += 1
    cur.points += pointsForRank(r.rank, r.totalTeams)
    // record เก่าไม่มี survivedRounds → นับ 0
    cur.survivedRounds += r.survivedRounds ?? 0
    if (r.survived) cur.survived += 1
    map.set(r.teamName, cur)
  }
  return Array.from(map.values()).sort(
    (a, b) => b.points - a.points || b.wins - a.wins || a.teamName.localeCompare(b.teamName),
  )
}

// การ์ดที่ใช้เยอะสุด — ใช้ตอนจบเกมเพื่อบันทึก (ส่งจำนวนรวม)
export function totalCardsPlayed(counts: Record<CardType, number>): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}