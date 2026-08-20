
import { useEffect, useRef } from 'react'
import { useGame } from '@/components/game/GameProvider'
import { CARD_LABELS } from '@/lib/game/cards'
import { appendMatch, totalCardsPlayed } from '@/lib/storage/leaderboard'
import type { CardType, Team } from '@/lib/game/types'

interface Props {
  onRestart: () => void
  onExit: () => void
  onLeaderboard: () => void
}

interface RankedTeam {
  team: Team
  rank: number
}

export function GameOverScreen({ onRestart, onExit, onLeaderboard }: Props) {
  const { state } = useGame()
  const { rankings, isDraw, noWinner } = computeRankings(state.teams)
  const winner = rankings.find((r) => r.rank === 1)
  const savedRef = useRef(false)

  // บันทึกผลเข้าบอร์ดครั้งเดียวตอน mount — guard กัน React StrictMode double-mount
  useEffect(() => {
    if (savedRef.current) return
    savedRef.current = true
    appendMatch(
      rankings.map((r) => ({
        id: `${Date.now()}-${r.team.id}-${Math.random().toString(36).slice(2, 8)}`,
        playedAt: Date.now(),
        teamName: r.team.name,
        rank: r.rank,
        totalTeams: rankings.length,
        opens: r.team.stats.opens,
        defusesSucceeded: r.team.stats.defusesSucceeded,
        cardsPlayed: totalCardsPlayed(r.team.stats.cardsPlayed),
        survived: r.team.alive,
      })),
    )
  }, [rankings])

  return (
    <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/70 p-6">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-card p-8">
        <p className="section-label text-center">จบเกม</p>
        <h2 className="mt-1 text-center font-serif text-5xl font-bold">
          {noWinner ? 'ไม่มีผู้ชนะ' : isDraw ? 'เสมอกัน!' : `ชนะเลิศ — ${winner?.team.name}`}
        </h2>
        {isDraw && <p className="mt-2 text-center text-muted-foreground">ช่องหมด — ทุกทีมที่รอดเสมอกัน</p>}
        {noWinner && <p className="mt-2 text-center text-muted-foreground">ทุกทีมตกรอบ</p>}

        <Podium rankings={rankings} />

        <ol className="mt-6 flex flex-col gap-1">
          {rankings.map((r) => (
            <li
              key={r.team.id}
              className="flex items-center gap-3 rounded-lg bg-background px-4 py-2"
            >
              <span className="w-8 text-center font-mono text-lg font-black text-primary">
                {r.rank}
              </span>
              <span className={`min-w-0 flex-1 truncate text-lg font-bold ${r.team.alive ? '' : 'opacity-60'}`}>
                {r.team.name}
                {r.team.alive && <span className="ml-2 text-sm font-bold text-emerald-600">รอด</span>}
              </span>
              <StatsRow team={r.team} />
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <button onClick={onRestart} className="primary-button text-xl">
            เล่นอีกรอบ
          </button>
          <button
            onClick={onLeaderboard}
            className="rounded-lg border border-primary px-5 py-3 text-xl font-bold text-primary"
          >
            🏆 ดู leaderboard
          </button>
          <button
            onClick={onExit}
            className="rounded-lg border border-border bg-background px-5 py-3 text-xl font-bold"
          >
            กลับหน้าตั้งค่า
          </button>
        </div>
      </div>
    </div>
  )
}

function Podium({ rankings }: { rankings: RankedTeam[] }) {
  const top = [
    rankings.find((r) => r.rank === 1),
    rankings.find((r) => r.rank === 2),
    rankings.find((r) => r.rank === 3),
  ]
  const heights = ['h-40', 'h-28', 'h-20']
  const medals = ['🥇', '🥈', '🥉']
  return (
    <div className="mt-8 flex items-end justify-center gap-4">
      {top.map((r, i) =>
        r ? (
          <div key={r.team.id} className="flex flex-col items-center gap-1">
            <span className="text-3xl">{medals[i]}</span>
            <span className="max-w-28 truncate text-base font-bold">{r.team.name}</span>
            <div
              className={
                `grid w-24 place-items-center rounded-t-xl border border-b-0 ` +
                `border-border bg-primary/10 ${heights[i]}`
              }
            >
              <span className="font-mono text-2xl font-black text-primary">{r.rank}</span>
            </div>
          </div>
        ) : null,
      )}
    </div>
  )
}

function StatsRow({ team }: { team: Team }) {
  const entries = Object.entries(team.stats.cardsPlayed) as [CardType, number][]
  const top = entries.reduce<[CardType, number] | null>(
    (best, e) => (best === null || e[1] > best[1] ? e : best),
    null,
  )
  return (
    <span className="flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
      <span title="ป้ายที่เปิด">🔎 {team.stats.opens}</span>
      <span title="กู้สำเร็จ">🧨 {team.stats.defusesSucceeded}</span>
      <span title="การ์ดที่ทิ้ง">🗑 {team.stats.cardsDiscarded}</span>
      <span title="การ์ดที่ใช้เยอะสุด">
        {top && top[1] > 0 ? `${CARD_LABELS[top[0]]} ×${top[1]}` : '—'}
      </span>
    </span>
  )
}

function computeRankings(teams: Team[]): {
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
