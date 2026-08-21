
import { useEffect, useRef } from 'react'
import { useGame } from '@/components/game/GameProvider'
import { CARD_LABELS } from '@/lib/game/cards'
import { computeRankings, MEDAL_EMOJI, type RankedTeam } from '@/lib/game/ranking'
import { appendGameLog } from '@/lib/storage/gamelog'
import { appendMatch, totalCardsPlayed } from '@/lib/storage/leaderboard'
import { sfx } from '@/lib/audio/sfx'
import { USER_ENDED_LOG } from '@/lib/game/engine'
import type { CardType, Team } from '@/lib/game/types'

interface Props {
  // FIX_LISTS #8: จบเกมแล้วเหลือปุ่มเดียว — ไม่ต้องมี onRestart/onLeaderboard อีก
  onExit: () => void
}

export function GameOverScreen({ onExit }: Props) {
  const { state } = useGame()
  const { rankings, isDraw, noWinner } = computeRankings(state.teams)
  const winner = rankings.find((r) => r.rank === 1)
  const savedRef = useRef(false)
  // FIX_LISTS ชุดใหม่ #10: กรรมการกดจบเกมเอง ≠ ผลการแข่งที่เล่นจนจบ
  // ทีมที่เหลือรอดพร้อมกันตอนถูกยุติจะเข้าเงื่อนไข isDraw ทำให้ขึ้น "เสมอกัน!"
  // ซึ่งโกหก — เกมยังไม่ได้ตัดสิน จึงต้องบอกตรง ๆ ว่าถูกยุติ และไม่โชว์โพเดียม
  const userEnded = state.log.some((l) => l.message === USER_ENDED_LOG)

  // FIX_LISTS #7: เสียงตอนขึ้น Leaderboard ตอนจบเกม — ครั้งเดียวตอน mount
  // FIX #44 ยังใช้อยู่: กรรมการสั่งยุติเกมเองไม่ใช่ชัยชนะ จึงไม่ต้องมีเสียงฉลอง
  useEffect(() => {
    if (!userEnded) sfx.finished()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        // FIX: บันทึก "รอบที่รอด" แทน "ป้ายที่เปิด" — ดูเท่กว่า
        survivedRounds: r.team.stats.turnsSurvived ?? 0,
        defusesSucceeded: r.team.stats.defusesSucceeded,
        cardsPlayed: totalCardsPlayed(r.team.stats.cardsPlayed),
        survived: r.team.alive,
      })),
    )
    // FIX #36: เก็บ log เต็มเกมไว้ดูย้อนหลังใน leaderboard
    // try/catch แยกของตัวเอง — log เก็บไม่ได้ต้องไม่ล้มการเขียนคะแนนข้างบน
    try {
      appendGameLog({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        // เกมก่อนอัปเกรดไม่มีค่านี้ → null (UI โชว์ '—') ไม่ใช่ default เป็น endedAt
        // ซึ่งจะโกหกว่าเกมเริ่มและจบพร้อมกัน
        startedAt: state.startedAt ?? null,
        endedAt: Date.now(),
        teamNames: state.teams.map((t) => t.name),
        // อันดับสุดท้ายของทุกทีม — ใช้เรียงชื่อทีมในหัว log (ที่ 1 อยู่หน้า)
        rankings: rankings.map((r) => ({ teamName: r.team.name, rank: r.rank })),
        turnNumber: state.turnNumber,
        log: state.log,
      })
    } catch {
      // ignore
    }
    // ⚠️ dep array เป็น [rankings] โดยเจตนา — savedRef คือตัวรับประกันว่าเขียนครั้งเดียว
    // เพิ่ม state เข้าไปจะทำให้ effect ยิงถี่ขึ้นโดยไม่ได้อะไรเพิ่ม
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankings])

  // FIX_LISTS ชุดใหม่ #9: จัดกลางแนวตั้งด้วย flex + m-auto แทน grid place-items-center
  // place-items-center บนกล่องที่ scroll ได้ จะดัน overflow ทะลุขอบบนจนเลื่อนขึ้นไปดูไม่ได้
  // (m-auto ในแกนที่ล้น จะยุบเป็น 0 เอง → เนื้อหายาวเกินจอก็ยังเลื่อนอ่านครบ)
  return (
    <div className="fixed inset-0 z-40 flex overflow-y-auto bg-black/70 p-3 sm:p-6">
      <div className="m-auto w-full max-w-3xl rounded-2xl border border-border bg-card p-4 sm:p-8">
        <p className="section-label text-center">จบเกม</p>
        {/* FIX_LISTS ชุดใหม่ #10: ยุติเอง → ไม่ประกาศผู้ชนะ/ไม่บอกว่าเสมอ บอกแค่ว่าถูกยุติ */}
        <h2 className="mt-1 text-center font-serif text-3xl font-bold sm:text-5xl">
          {userEnded
            ? 'เกมถูกยุติโดยผู้ใช้'
            : noWinner
              ? 'ไม่มีผู้ชนะ'
              : isDraw
                ? 'เสมอกัน!'
                : `ชนะเลิศ — ${winner?.team.name}`}
        </h2>
        {userEnded ? (
          <p className="mt-2 text-center text-muted-foreground">
            เกมยังไม่จบตามกติกา — ด้านล่างคือคะแนน ณ ตอนที่ยุติ
          </p>
        ) : (
          <>
            {isDraw && (
              <p className="mt-2 text-center text-muted-foreground">ช่องหมด — ทุกทีมที่รอดเสมอกัน</p>
            )}
            {noWinner && <p className="mt-2 text-center text-muted-foreground">ทุกทีมตกรอบ</p>}
          </>
        )}

        {/* FIX_LISTS ชุดใหม่ #10: ยุติเอง → ไม่โชว์กราฟโพเดียม เพราะยังไม่มีผู้ชนะจริง
            เหลือเฉพาะตารางคะแนนข้างล่าง */}
        {!userEnded && <Podium rankings={rankings} />}

        <ol className="mt-6 flex flex-col gap-1">
          {rankings.map((r) => (
            <li
              key={r.team.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-background px-3 py-2 sm:flex-nowrap sm:px-4"
            >
              <span className="w-8 text-center font-mono text-lg font-black text-primary">
                {r.rank}
              </span>
              <span className={`min-w-0 flex-1 truncate text-lg font-bold ${r.team.alive ? '' : 'opacity-60'}`}>
                {r.team.name}
                {r.team.alive && <span className="ml-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">รอด</span>}
              </span>
              <StatsRow team={r.team} />
            </li>
          ))}
        </ol>

        {/* FIX_LISTS #8: จบเกมแล้วเหลือปุ่มเดียว — กลับไปหน้าหลัก */}
        <div className="mt-8 flex justify-center">
          <button onClick={onExit} className="primary-button text-xl">
            กลับไปหน้าหลัก
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
  return (
    <div className="mt-6 flex items-end justify-center gap-2 sm:mt-8 sm:gap-4">
      {top.map((r, i) =>
        r ? (
          <div key={r.team.id} className="flex flex-col items-center gap-1">
            <span className="text-3xl">{MEDAL_EMOJI[i]}</span>
            <span className="max-w-28 truncate text-base font-bold">{r.team.name}</span>
            <div
              className={
                `grid w-20 place-items-center rounded-t-xl border border-b-0 sm:w-24 ` +
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
    <span className="flex w-full shrink-0 flex-wrap items-center gap-x-3 pl-11 text-sm text-muted-foreground sm:w-auto sm:pl-0">
      <span title="รอบที่รอด">🕐 {team.stats.turnsSurvived ?? 0}</span>
      <span title="กู้สำเร็จ">🧨 {team.stats.defusesSucceeded}</span>
      <span title="การ์ดที่ทิ้ง">🗑 {team.stats.cardsDiscarded}</span>
      <span title="การ์ดที่ใช้เยอะสุด">
        {top && top[1] > 0 ? `${CARD_LABELS[top[0]]} ×${top[1]}` : '—'}
      </span>
    </span>
  )
}
