
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
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { DisplayModeToggle } from '@/components/ui/DisplayModeToggle'

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
    // FIX_LISTS ชุดที่สิบห้า: เดิม min-h-screen + py-8 — โหมด TV (scale 1.5) ตัวอักษรโต
    //   ขึ้น 1.5 เท่า เนื้อหาจึงสูงเกินจอทันที ทั้งหน้าเลื่อนตาม หัวเว็บ (ปุ่มกลับเมนู/
    //   ธีม/โหมดจอ) หลุดออกนอกจอไปด้านบน แถม py-8 * 1.5 = ขอบขาวบนหนาเกินจำเป็น
    //   เปลี่ยนเป็น pattern เดียวกับหน้าเล่นเกม: กรอบสูงเท่าจอเป๊ะ ไม่ scroll เลย
    //   หัวเว็บอยู่กับที่ ส่วนเนื้อหาด้านล่างกินที่เหลือแล้ว scroll เอง (min-h-0 จำเป็น —
    //   ไม่งั้น flex item ยืดตามเนื้อหาแทนที่จะยอมหดแล้วให้ลูก scroll)
    //   padding เป็น rem จึงยังโตตามโหมดจอ แต่เริ่มจากค่าที่บางกว่าเดิม (py-8 → py-4)
    <div className="mx-auto flex h-dvh w-full max-w-4xl flex-col overflow-hidden px-4 py-4 sm:px-6">
      {/* หัวเว็บหน้า Leaderboard ใช้ pattern เดียวกับหน้าเล่นเกม (GameHeader) และ
          หน้าตั้งค่า (SetupScreen) — โลโก้ซ้าย, ชื่อหน้า/คำอธิบาย, ปุ่มหลักดันไปขวา
          ด้วย ml-auto แล้วต่อด้วยธีม/เต็มจอ/โหมดจอ ในแถวเดียวกัน
          ปุ่มลอยมุมขวาบน (แถบ fixed ใน App) ไม่เรนเดอร์ในหน้านี้แล้ว — เดิมมันลอย
          อยู่คนละระดับกับปุ่ม "กลับเมนู" ทำให้สามหน้าดูคนละแบบ */}
      <header className="mb-3 flex w-full shrink-0 flex-wrap items-center gap-3">
        <BombMark />
        <div className="min-w-0">
          {/* text-3xl * 1.5 ในโหมด TV = สูงเกินไปสำหรับหัวเว็บที่ต้องอยู่กับที่
              ลดเป็น text-2xl — ยังใหญ่กว่าทุกอย่างในหน้าและอ่านจากท้ายห้องได้ */}
          <h1 className="truncate font-serif text-2xl font-bold leading-tight">
            🏆 Leaderboard
          </h1>
          <p className="section-label">Minenumber — เลขระเบิด</p>
        </div>
        {loaded && hasData && (
          <button
            onClick={() => void handleClear()}
            title="ล้างประวัติ leaderboard ทั้งหมด"
            aria-label="ล้าง leaderboard"
            className={
              'ml-auto flex shrink-0 items-center gap-2 rounded-lg border border-destructive/40 ' +
              'bg-card px-3 py-2 text-sm font-bold text-destructive shadow transition hover:border-destructive'
            }
          >
            <span aria-hidden="true">🗑</span>
            <span className="hidden sm:inline">ล้าง leaderboard</span>
          </button>
        )}
        <button
          onClick={onBack}
          title="กลับไปหน้าเมนูหลัก"
          aria-label="กลับไปหน้าเมนูหลัก"
          className={
            // ปุ่มล้างโผล่เฉพาะตอนมีข้อมูล — ml-auto จึงต้องมีที่ปุ่มนี้ด้วย
            // ไม่งั้นตอนยังไม่มีผลเกม ปุ่มกลับเมนูจะไปกองชิดซ้ายติดชื่อหน้า
            // (ml-auto สองตัวไม่ชนกัน — ตัวแรกดันกลุ่มไปขวา ตัวหลังไม่มีผลเพิ่ม)
            (loaded && hasData ? '' : 'ml-auto ') +
            'flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card ' +
            'px-3 py-2 text-sm font-bold shadow transition hover:border-primary'
          }
        >
          <span aria-hidden="true">←</span>
          <span className="hidden sm:inline">กลับเมนู</span>
        </button>
        <ThemeToggle />
        <DisplayModeToggle />
      </header>

      {/* FIX_LISTS ชุดที่สิบห้า: ทุกอย่างใต้หัวเว็บอยู่ในกล่องนี้ — กินที่ที่เหลือจากจอ
          (flex-1 + min-h-0) แล้ว scroll ในตัวเอง จอนอกจึงไม่ต้องเลื่อนเลย
          ซ่อนแถบ scroll (no-scrollbar) เพราะเวลาฉายขึ้นจอใหญ่ แถบเลื่อนจะเด่นเกินเนื้อหา */}
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      {!loaded && <p className="py-10 text-center text-muted-foreground">กำลังโหลด…</p>}

      {loaded && aggregates.length === 0 && logs.length === 0 && (
        <p className="panel shrink-0 py-16 text-center text-muted-foreground">
          ยังไม่มีผลเกม — เล่นเกมให้จบเพื่อบันทึกสถิติ
        </p>
      )}

      {loaded && aggregates.length > 0 && (
        <section className="panel shrink-0">
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
        <section className="panel shrink-0">
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
                  <div className="no-scrollbar mt-2 flex max-h-[40dvh] flex-col gap-0.5 overflow-y-auto rounded-lg bg-background p-2">
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
