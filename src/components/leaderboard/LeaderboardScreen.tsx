
import { useEffect, useState } from 'react'
import {
  aggregateByTeam,
  clearLeaderboard,
  loadLeaderboard,
  type MatchRecord,
} from '@/lib/storage/leaderboard'
import { clearGameLogs, loadGameLogs, type GameLogRecord } from '@/lib/storage/gamelog'
import { confirmDialog, infoDialog } from '@/components/ui/alert'
import { BombMark } from '@/components/setup/SetupScreen'
import { logClass, logTime } from '@/components/game/GameScreen'
import { medalClass, MEDAL_EMOJI } from '@/lib/game/ranking'

interface Props {
  onBack: () => void
}

export function LeaderboardScreen({ onBack }: Props) {
  const [records, setRecords] = useState<MatchRecord[]>([])
  const [logs, setLogs] = useState<GameLogRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  // FIX #36: id ของเกมที่กางดู log อยู่ (null = ไม่ได้กางอันไหน)
  const [openLogId, setOpenLogId] = useState<string | null>(null)

  useEffect(() => {
    setRecords(loadLeaderboard())
    setLoaded(true)
    setLogs(loadGameLogs())
  }, [])

  const aggregates = aggregateByTeam(records)
  const recent = records.slice().reverse().slice(0, 20)
  // เก็บใหม่ต่อท้าย → เรนเดอร์ใหม่ไปเก่าต้องกลับด้าน
  const recentGames = logs.slice().reverse()

  async function handleClear() {
    const ok = await confirmDialog({
      title: 'ล้าง leaderboard?',
      text: 'ประวัติ แต้มสะสม และบันทึกเกมย้อนหลังทั้งหมดจะถูกลบทิ้ง',
      confirmText: 'ล้างเลย',
    })
    if (!ok) return
    clearLeaderboard()
    setRecords([])
    // FIX #36: ต้องล้าง log ด้วย ไม่งั้นเหลือบันทึกกำพร้าที่ไม่มีคะแนนคู่กัน
    clearGameLogs()
    setLogs([])
    setOpenLogId(null)
    void infoDialog({ title: 'ล้างแล้ว', text: 'ประวัติ leaderboard ถูกลบเรียบร้อย', icon: 'success' })
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-8">
      <header className="flex items-center gap-3 pb-6">
        <BombMark />
        <div>
          <h1 className="font-serif text-3xl font-bold">🏆 Leaderboard</h1>
          <p className="section-label">Minenumber — เลขระเบิด</p>
        </div>
        <button
          onClick={onBack}
          className="ml-auto rounded-lg border border-border px-4 py-2 text-base font-bold"
        >
          ← กลับเมนู
        </button>
      </header>

      {!loaded && <p className="py-10 text-center text-muted-foreground">กำลังโหลด…</p>}

      {loaded && aggregates.length === 0 && (
        <p className="panel py-16 text-center text-muted-foreground">
          ยังไม่มีผลเกม — เล่นเกมให้จบเพื่อบันทึกสถิติ
        </p>
      )}

      {loaded && aggregates.length > 0 && (
        <section className="panel">
          <h2 className="section-label mb-3">ตารางรวมรายทีม</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">ทีม</th>
                <th className="py-2 pr-3 text-right">เกม</th>
                <th className="py-2 pr-3 text-right">ชนะ</th>
                <th className="py-2 pr-3 text-right">แต้ม</th>
                <th className="py-2 pr-3 text-right">ป้ายเปิด</th>
                <th className="py-2 text-right">รอด</th>
              </tr>
            </thead>
            <tbody>
              {/* FIX #38: 3 แถวแรก (แต้มสูงสุด) ได้สีทอง/เงิน/ทองแดง */}
              {aggregates.map((a, i) => (
                <tr
                  key={a.teamName}
                  className={`border-b border-border last:border-0 ${medalClass(i + 1)}`}
                >
                  <td className="py-2 pr-3 font-mono font-bold">
                    {i < 3 ? MEDAL_EMOJI[i] : i + 1}
                  </td>
                  <td className="py-2 pr-3 font-bold">{a.teamName}</td>
                  <td className="py-2 pr-3 text-right font-mono">{a.games}</td>
                  <td className="py-2 pr-3 text-right font-mono">{a.wins}</td>
                  <td className="py-2 pr-3 text-right font-mono font-black text-primary">{a.points}</td>
                  <td className="py-2 pr-3 text-right font-mono">{a.opens}</td>
                  <td className="py-2 text-right font-mono">{a.survived}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {loaded && recent.length > 0 && (
        <section className="panel mt-4">
          <h2 className="section-label mb-3">ผลรายทีม 20 รายการล่าสุด</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {recent.map((r) => (
              <li
                key={r.id}
                className={
                  'flex items-center gap-3 rounded-lg border-b border-border px-2 py-1.5 last:border-0 ' +
                  medalClass(r.rank)
                }
              >
                <span className="w-6 text-center font-mono text-xs font-bold">
                  {r.rank <= 3 ? MEDAL_EMOJI[r.rank - 1] : `#${r.rank}`}
                </span>
                <span className="min-w-0 flex-1 truncate font-bold">{r.teamName}</span>
                <span className="text-muted-foreground">
                  {r.survived ? 'รอด' : 'ตกรอบ'} · {r.opens} ป้าย
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {new Date(r.playedAt).toLocaleDateString('th-TH', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* FIX #36: ประวัติระดับ "เกม" — เวลาเริ่ม → เวลาจบ กางดู log เต็มของเกมนั้นได้ */}
      {loaded && recentGames.length > 0 && (
        <section className="panel mt-4">
          <h2 className="section-label mb-3">บันทึก {recentGames.length} เกมล่าสุด</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {recentGames.map((g) => (
              <li key={g.id} className="border-b border-border py-1.5 last:border-0">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatGameTime(g.startedAt)} → {formatGameTime(g.endedAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold">
                    {g.teamNames.join(' · ')}
                  </span>
                  <span className="text-muted-foreground">
                    {g.teamNames.length} ทีม · {g.turnNumber} รอบ
                  </span>
                  <button
                    onClick={() => setOpenLogId((cur) => (cur === g.id ? null : g.id))}
                    className="rounded-lg border border-border px-2 py-1 text-xs font-bold"
                  >
                    {openLogId === g.id ? 'ปิด' : `ดูบันทึก (${g.log.length})`}
                  </button>
                </div>
                {openLogId === g.id && (
                  <div className="mt-2 flex max-h-96 flex-col gap-0.5 overflow-y-auto rounded-lg bg-background p-2">
                    {g.log.length === 0 && (
                      <p className="text-sm text-muted-foreground">ไม่มีเหตุการณ์ในเกมนี้</p>
                    )}
                    {g.log.map((l) => (
                      <p
                        key={l.id}
                        className={`border-b border-border py-1.5 text-sm leading-5 last:border-0 ${logClass(l.level)}`}
                      >
                        <span className="mr-2 font-mono text-xs text-muted-foreground">
                          {logTime(l.at)}
                        </span>
                        {l.message}
                      </p>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {loaded && (aggregates.length > 0 || recentGames.length > 0) && (
        <button
          onClick={() => void handleClear()}
          className="mt-6 self-end rounded-lg border border-destructive/40 px-4 py-2 text-sm font-bold text-destructive"
        >
          🗑 ล้าง leaderboard
        </button>
      )}
    </div>
  )
}

// FIX #36: เกมก่อนอัปเกรดไม่มี startedAt → โชว์ '—' ไม่ใช่ 1 ม.ค. 1970
export function formatGameTime(at: number | null): string {
  if (!at) return '—'
  return new Date(at).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
