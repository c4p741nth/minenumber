
import { useEffect, useState } from 'react'
import {
  aggregateByTeam,
  clearLeaderboard,
  loadLeaderboard,
  type MatchRecord,
} from '@/lib/storage/leaderboard'
import { confirmDialog, infoDialog } from '@/components/ui/alert'
import { BombMark } from '@/components/setup/SetupScreen'

interface Props {
  onBack: () => void
}

export function LeaderboardScreen({ onBack }: Props) {
  const [records, setRecords] = useState<MatchRecord[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setRecords(loadLeaderboard())
    setLoaded(true)
  }, [])

  const aggregates = aggregateByTeam(records)
  const recent = records.slice().reverse().slice(0, 20)

  async function handleClear() {
    const ok = await confirmDialog({
      title: 'ล้าง leaderboard?',
      text: 'ประวัติและแต้มสะสมทั้งหมดจะถูกลบทิ้ง',
      confirmText: 'ล้างเลย',
    })
    if (!ok) return
    clearLeaderboard()
    setRecords([])
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
              {aggregates.map((a, i) => (
                <tr key={a.teamName} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3 font-mono font-bold">{i + 1}</td>
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
          <h2 className="section-label mb-3">ประวัติ 20 เกมล่าสุด</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center gap-3 border-b border-border py-1.5 last:border-0">
                <span className="w-6 text-center font-mono text-xs font-bold text-muted-foreground">
                  #{r.rank}
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

      {loaded && aggregates.length > 0 && (
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
