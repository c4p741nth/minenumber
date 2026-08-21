
import { useEffect, useState } from 'react'
import {
  aggregateByTeam,
  clearLeaderboard,
  loadLeaderboard,
  type MatchRecord,
} from '@/lib/storage/leaderboard'
import { clearGameLogs, loadGameLogs, orderedTeamNames, type GameLogRecord } from '@/lib/storage/gamelog'
import { confirmDialog, infoDialog } from '@/components/ui/alert'
import { BombMark } from '@/components/setup/SetupScreen'
import { logClass } from '@/components/game/GameScreen'
import { medalClass, MEDAL_EMOJI } from '@/lib/game/ranking'
import { downloadLog, LOG_FORMATS, type LogFormat } from '@/lib/export/logExport'

const PAGE_SIZE = 10

interface Props {
  onBack: () => void
}

export function LeaderboardScreen({ onBack }: Props) {
  const [records, setRecords] = useState<MatchRecord[]>([])
  const [logs, setLogs] = useState<GameLogRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  // FIX #36: id ของเกมที่กางดู log อยู่ (null = ไม่ได้กางอันไหน)
  const [openLogId, setOpenLogId] = useState<string | null>(null)
  // กรองตามวันที่ (yyyy-mm-dd, ว่าง = ดูทั้งหมด) + paginate หน้าละ 10
  const [dateFilter, setDateFilter] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    setRecords(loadLeaderboard())
    setLoaded(true)
    setLogs(loadGameLogs())
  }, [])

  const aggregates = aggregateByTeam(records)
  // เก็บใหม่ต่อท้าย → เรนเดอร์ใหม่ไปเก่าต้องกลับด้าน
  const recentGames = logs.slice().reverse()
  const filteredGames = dateFilter
    ? recentGames.filter((g) => {
        const at = g.startedAt ?? g.endedAt
        return at !== null && at > 0 && isoDate(at) === dateFilter
      })
    : recentGames
  const totalPages = Math.max(1, Math.ceil(filteredGames.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageGames = filteredGames.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const hasData = aggregates.length > 0 || logs.length > 0

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
    setDateFilter('')
    setPage(1)
    void infoDialog({ title: 'ล้างแล้ว', text: 'ประวัติ leaderboard ถูกลบเรียบร้อย', icon: 'success' })
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-8">
      <header className="flex flex-wrap items-center gap-3 pb-6">
        <BombMark />
        <div>
          <h1 className="font-serif text-3xl font-bold">🏆 Leaderboard</h1>
          <p className="section-label">Minenumber — เลขระเบิด</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {loaded && hasData && (
            <button
              onClick={() => void handleClear()}
              className="rounded-lg border border-destructive/40 px-3 py-2 text-sm font-bold text-destructive"
            >
              🗑 ล้าง leaderboard
            </button>
          )}
          <button
            onClick={onBack}
            className="rounded-lg border border-border px-4 py-2 text-base font-bold"
          >
            ← กลับเมนู
          </button>
        </div>
      </header>

      {!loaded && <p className="py-10 text-center text-muted-foreground">กำลังโหลด…</p>}

      {loaded && aggregates.length === 0 && logs.length === 0 && (
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
                <th className="py-2 pr-3 text-center">#</th>
                <th className="py-2 pr-3">ทีม</th>
                <th className="py-2 pr-3 text-center">เกม</th>
                <th className="py-2 pr-3 text-center">ชนะ</th>
                <th className="py-2 pr-3 text-center">แต้ม</th>
                <th className="py-2 text-center">รอบรอด</th>
              </tr>
            </thead>
            <tbody>
              {/* FIX #38: 3 แถวแรก (แต้มสูงสุด) ได้สีทอง/เงิน/ทองแดง */}
              {aggregates.map((a, i) => (
                <tr
                  key={a.teamName}
                  className={`border-b border-border last:border-0 ${medalClass(i + 1)}`}
                >
                  <td className="py-2 pr-3 text-center font-mono font-bold">
                    {i < 3 ? MEDAL_EMOJI[i] : i + 1}
                  </td>
                  <td className="py-2 pr-3 font-bold">{a.teamName}</td>
                  <td className="py-2 pr-3 text-center font-mono">{a.games}</td>
                  <td className="py-2 pr-3 text-center font-mono">{a.wins}</td>
                  <td className="py-2 pr-3 text-center font-mono font-black text-primary">{a.points}</td>
                  <td className="py-2 text-center font-mono">{a.survivedRounds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* FIX #36: ประวัติระดับ "เกม" — เวลาเริ่ม → เวลาจบ กางดู log เต็มของเกมนั้นได้ */}
      {loaded && recentGames.length > 0 && (
        <section className="panel mt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-label">บันทึก {recentGames.length} เกมล่าสุด</h2>
            {/* กรองตามวันที่ — startedAt (หรือ endedAt ถ้าเกมเก่าไม่มี) */}
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-bold">ค้นหาวันที่:</span>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value)
                  setPage(1)
                  setOpenLogId(null)
                }}
                className="rounded-lg border border-border bg-background px-2 py-1 font-mono text-sm"
              />
              {dateFilter && (
                <button
                  onClick={() => {
                    setDateFilter('')
                    setPage(1)
                    setOpenLogId(null)
                  }}
                  className="rounded-lg border border-border px-2 py-1 text-xs font-bold"
                >
                  ล้าง
                </button>
              )}
            </label>
          </div>

          {dateFilter && filteredGames.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">ไม่มีเกมในวันที่นี้</p>
          )}

          <ul className="flex flex-col gap-1.5 text-sm">
            {pageGames.map((g) => (
              <li key={g.id} className="border-b border-border py-1.5 last:border-0">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatGameTime(g.startedAt)} → {formatGameTime(g.endedAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold">
                    {/* เรียงชื่อทีมตามอันดับ ที่ 1 → ท้าย */}
                    {orderedTeamNames(g).join(' · ')}
                  </span>
                  <span className="text-muted-foreground">
                    {g.teamNames.length} ทีม · {g.turnNumber} รอบ
                  </span>
                  <button
                    onClick={() => setOpenLogId((cur) => (cur === g.id ? null : g.id))}
                    className="rounded-lg border border-border px-2 py-1 text-xs font-bold"
                  >
                    {openLogId === g.id ? 'ปิด' : 'ดูบันทึก'}
                  </button>
                </div>
                {openLogId === g.id && (
                  <div className="mt-2 flex max-h-96 flex-col gap-0.5 overflow-y-auto rounded-lg bg-background p-2">
                    {/* ดาวน์โหลดบันทึกเกมนี้เป็นไฟล์ */}
                    <div className="flex flex-wrap items-center gap-2 border-b border-border py-2">
                      <span className="text-xs font-bold text-muted-foreground">⬇ ดาวน์โหลดบันทึก:</span>
                      {LOG_FORMATS.map((f: LogFormat) => (
                        <button
                          key={f}
                          onClick={() => downloadLog(g, f)}
                          className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold"
                          title={`ดาวน์โหลดบันทึกเกมนี้เป็น .${f}`}
                        >
                          {f.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    {g.log.length === 0 && (
                      <p className="text-sm text-muted-foreground">ไม่มีเหตุการณ์ในเกมนี้</p>
                    )}
                    {/* ลำดับ 1 → สุดท้าย ตามลำดับเหตุการณ์จริง */}
                    {g.log.map((l, i) => (
                      <p
                        key={l.id}
                        className={`border-b border-border py-1.5 text-sm leading-5 last:border-0 ${logClass(l.level)}`}
                      >
                        <span className="mr-2 font-mono text-xs text-muted-foreground">
                          #{i + 1}
                        </span>
                        {l.message}
                      </p>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Paginate หน้าละ 10 รายการ */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-3 text-sm">
              <button
                onClick={() => setPage(safePage - 1)}
                disabled={safePage === 1}
                className="rounded-lg border border-border px-3 py-1 font-bold disabled:opacity-40"
              >
                ‹ ก่อนหน้า
              </button>
              <span className="font-mono text-xs text-muted-foreground">
                หน้า {safePage} / {totalPages}
              </span>
              <button
                onClick={() => setPage(safePage + 1)}
                disabled={safePage === totalPages}
                className="rounded-lg border border-border px-3 py-1 font-bold disabled:opacity-40"
              >
                ถัดไป ›
              </button>
            </div>
          )}
        </section>
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

// วันที่แบบ yyyy-mm-dd — ใช้เทียบกับ input type="date" ของการกรอง
export function isoDate(at: number): string {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
