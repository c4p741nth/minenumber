
import { useEffect, useRef, useState } from 'react'
import { Board } from '@/components/board/Board'
import { TimerCircle } from '@/components/board/TimerCircle'
import { Hand } from '@/components/cards/Hand'
import { BlockPrompt } from '@/components/defuse/BlockPrompt'
import { DefuseModal } from '@/components/defuse/DefuseModal'
import { GameEffects } from '@/components/effects/GameEffects'
import { MuteButton } from '@/components/effects/MuteButton'
import { GameOverScreen } from '@/components/gameover/GameOverScreen'
import { confirmDialog, infoDialog } from '@/components/ui/alert'
import { hitChance } from '@/lib/game/balance'
import { computeRankings, medalClass, MEDAL_EMOJI, visibleMedal } from '@/lib/game/ranking'
import { BombMark } from '@/components/setup/SetupScreen'
import { useGame } from './GameProvider'

interface Props {
  // FIX_LISTS #8: จบเกมเหลือปุ่ม "กลับไปหน้าหลัก" ปุ่มเดียว → ไม่ต้องมี
  // onRestart/onLeaderboard อีกแล้ว
  onExit: () => void
}

interface ScanInfo {
  center: number
  radius: number
  found: boolean
}

export function GameScreen({ onExit }: Props) {
  const { state, dispatch } = useGame()
  const current = state.teams[state.currentTeamIndex]
  const [typed, setTyped] = useState('')
  const [cardMode, setCardMode] = useState(true)
  const [scanning, setScanning] = useState<{ center: number; radius: number } | null>(null)
  const lastScanSig = useRef<string | null>(null)
  const scanTimer = useRef<number | null>(null)

  // ขึ้นตาใหม่ → กลับไปช่วงใช้การ์ดก่อน
  // ต้อง depend บนตาที่เปลี่ยน (turnNumber/currentTeamIndex) ด้วย — phase ค้างเป็น 'cards'
  // ข้ามตาได้ ทำให้ effect ที่ depend เฉพาะ phase ไม่ยิงซ้ำ แล้วโหมดค้างที่ "เปิดป้ายเลย"
  useEffect(() => {
    if (state.phase === 'cards') setCardMode(true)
  }, [state.phase, state.turnNumber, state.currentTeamIndex])

  const inCards = state.phase === 'cards'

  // พิมพ์ตัวเลขตรง ๆ เพื่อเลือกช่อง (MC พิมพ์เร็วกว่าคลิก) + Esc ยกเลิก
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (state.phase !== 'opening' && state.phase !== 'cards') return
      if (/^\d$/.test(e.key)) {
        setTyped((prev) => (prev + e.key).slice(0, 3))
      } else if (e.key === 'Enter' && typed !== '') {
        dispatch({ type: 'OPEN_CELL', cell: Number(typed) })
        setTyped('')
      } else if (e.key === 'Backspace') {
        setTyped((prev) => prev.slice(0, -1))
      } else if (e.key === 'Escape') {
        setTyped('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.phase, typed, dispatch])

  // FIX #44: ยุติเกมแล้วต้องเห็นหน้าสรุปอันดับทันทีเหมือนเกมจบตามปกติ
  // (เดิมเรียก onExit() ซึ่งทำลาย handle แล้วเด้งกลับหน้าตั้งค่า — อันดับหายไปเลย)
  function endGame() {
    void confirmDialog({
      title: 'จบเกมนี้เลย?',
      text: 'เกมจะถูกบันทึกเป็นจบเกม แล้วแสดงสรุปอันดับ',
      confirmText: 'จบเกม',
    }).then((ok) => {
      if (ok) dispatch({ type: 'END_GAME' })
    })
  }

  // W6.3: เล่น Scan → ให้ Board เรืองแสงช่วงที่ตรวจ แล้ว popup ผลหลัง animation จบ
  // ใช้ ref กัน trigger ซ้ำตอน state อัปเดตเหตุอื่น (lastCardResult เปลี่ยน identity ทุกครั้ง)
  useEffect(() => {
    const lc = state.lastCardResult
    const sig = lc ? JSON.stringify(lc) : null
    if (!lc || lc.card !== 'scan' || sig === lastScanSig.current) return
    lastScanSig.current = sig
    const info: ScanInfo = {
      center: lc.center,
      radius: state.settings.scanRadius,
      found: lc.found,
    }
    setScanning({ center: info.center, radius: info.radius })
    if (scanTimer.current) window.clearTimeout(scanTimer.current)
    scanTimer.current = window.setTimeout(() => {
      setScanning(null)
      const lo = Math.max(state.rangeMin, info.center - info.radius)
      const hi = Math.min(state.rangeMax, info.center + info.radius)
      void infoDialog({
        title: info.found ? '⚠ มีระเบิดอยู่ใกล้ ๆ!' : '✓ ไม่มีระเบิดอยู่ใกล้ ๆ',
        text: `ตรวจช่วง ${lo}–${hi} (รอบเลข ${info.center})`,
        icon: info.found ? 'error' : 'success',
      })
    }, 2200)
  }, [state.lastCardResult, state.rangeMin, state.rangeMax, state.settings.scanRadius])

  // FIX #26: ใช้ layout ความกว้างคงที่ ไม่ place-content-center
  // (เดิมจอ "ดิ้น" เพราะ content จัดกลางแล้วขนาดเปลี่ยนทุกครั้งที่เปลี่ยนทีม/เปิดช่อง)
  return (
    <div className="min-h-screen w-full p-2 sm:p-4">
      <GameHeader onExit={endGame} />
      <div className="mx-auto grid w-full max-w-375 items-start gap-4 pb-44 lg:grid-cols-[240px_1fr_300px]">
        <TeamList />
        <main className="flex flex-col gap-3">
          <CurrentTeamBanner />
          {/* FIX #17: แทนเมนู "ตานี้จะทำอะไร?" ด้วยข้อความบอกตรง ๆ ว่าใครต้องทำอะไร */}
          {inCards && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-primary bg-primary/5 p-3">
              <span className="text-lg font-bold">
                {current.name} กรุณาเลือกแผ่นป้ายหรือใช้ item
              </span>
              {current.hand.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  ({current.hand.length} ใบในมือ — กดการ์ดด้านล่างเพื่อเปิดดู)
                </span>
              )}
              {!cardMode && (
                <button
                  onClick={() => setCardMode(true)}
                  className="ml-auto rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-bold"
                >
                  🃏 กลับไปใช้การ์ด
                </button>
              )}
            </div>
          )}
          <Board
            rangeMin={state.rangeMin}
            rangeMax={state.rangeMax}
            cells={state.cells}
            cardCells={state.cardCells}
            disabled={state.phase !== 'opening' && state.phase !== 'cards'}
            onOpen={(cell) => dispatch({ type: 'OPEN_CELL', cell })}
            scanning={scanning}
          />
          {current.pendingOpens > 1 && (
            <div
              className={
                'rounded-xl border-2 border-amber-500 bg-amber-100 p-3 text-center ' +
                'text-lg font-bold text-amber-900 dark:bg-amber-900/50 dark:text-amber-100'
              }
            >
              ⚔ {current.name} ต้องเปิดอีก {current.pendingOpens} ป้าย
            </div>
          )}
        </main>
        {/* FIX #16: ล็อก panel ขวาแบบ floating — เลื่อนกระดานยาว ๆ แล้วยังเห็นสถานะ/log */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <StatusPanel />
          <LogPanel />
        </aside>
      </div>
      {state.phase === 'defusing' && <DefuseModal />}
      {state.phase === 'blocking' && <BlockPrompt />}
      {state.phase === 'gameover' && <GameOverScreen onExit={onExit} />}
      <Hand locked={!cardMode} />
      <div className="fixed top-4 right-4 z-30 flex items-center gap-2">
        <MuteButton />
      </div>
      {/* FIX #16: พิมพ์เลขแล้วต้องกด Enter ยืนยัน — ไม่เปิดให้อัตโนมัติ กันลั่นกดผิดช่อง */}
      {typed !== '' && state.phase !== 'gameover' && (
        <div
          className={
            'fixed bottom-48 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl ' +
            'border-2 border-primary bg-card px-4 py-2 shadow-2xl'
          }
        >
          <span className="font-mono text-3xl font-black">{typed}</span>
          <span className="text-sm font-bold text-muted-foreground">
            กด Enter เพื่อเปิด · Esc ยกเลิก
          </span>
        </div>
      )}
      <GameEffects />
    </div>
  )
}

// FIX #19: ชื่อเกมอยู่หัวเว็บตอนเล่น (เดิมหน้าโล่งไปหน่อย)
// FIX #21: ปุ่มจบเกมเป็น icon ออกห้อง
function GameHeader({ onExit }: { onExit: () => void }) {
  return (
    <header className="mx-auto mb-4 flex w-full max-w-375 items-center gap-3">
      <BombMark />
      <div className="min-w-0">
        <h1 className="truncate font-serif text-2xl font-bold leading-tight">Minenumber</h1>
        <p className="section-label">เลขระเบิด</p>
      </div>
      <button
        onClick={onExit}
        title="จบเกมนี้ / ออกจากห้อง"
        aria-label="จบเกมนี้ / ออกจากห้อง"
        className={
          'ml-auto mr-24 flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 sm:mr-28 ' +
          'text-sm font-bold text-destructive shadow transition hover:border-destructive'
        }
      >
        <ExitIcon />
        <span className="hidden sm:inline">ออกจากห้อง</span>
      </button>
    </header>
  )
}

// icon ประตูออก (door-open + ลูกศร) — วาดเองไม่พึ่ง lib ภายนอก
function ExitIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function CurrentTeamBanner() {
  const { state, dispatch } = useGame()
  const current = state.teams[state.currentTeamIndex]
  const next = nextAliveTeam(state.teams, state.currentTeamIndex, state.direction)
  // FIX #18: กรรมการกด pause เวลาได้
  const [paused, setPaused] = useState(false)

  // ขึ้นตาใหม่ → เลิก pause อัตโนมัติ
  useEffect(() => {
    setPaused(false)
  }, [state.turnNumber, state.currentTeamIndex])

  return (
    <div
      className={
        'flex flex-wrap items-center gap-4 rounded-2xl border-2 border-primary bg-card p-4 ' +
        'shadow-[0_0_24px_color-mix(in_srgb,var(--primary)_35%,transparent)]'
      }
    >
      <div className="flex items-center gap-3">
        <span className="pulse-dot" />
        <span className="section-label">ตาปัจจุบัน</span>
      </div>
      <h2 className="font-serif text-4xl font-bold">{current.name}</h2>

      {/* FIX #30: บอกทิศทางเกม + ทีมถัดไป */}
      <div className="ml-auto flex items-center gap-3 text-sm">
        <span
          className="rounded-full bg-secondary px-3 py-1 font-bold"
          title={state.direction === 1 ? 'เล่นไปทางขวา (ตามลำดับทีม)' : 'เล่นย้อนกลับ (ทวนลำดับทีม)'}
        >
          {state.direction === 1 ? '→ ตามลำดับ' : '← ย้อนกลับ'}
        </span>
        {next && (
          <span className="text-muted-foreground">
            ถัดไป: <b className="text-foreground">{next.name}</b>
          </span>
        )}
        <span className="font-mono text-muted-foreground">รอบ {state.turnNumber}</span>
      </div>

      <div className="flex items-center gap-2">
        {/* FIX #18: pause เวลา — ทีมไหนเลือกไม่ทันจะเสีย turn ไม่มีการเลือกให้อัตโนมัติ */}
        {state.settings.turnSeconds > 0 && (
          <button
            onClick={() => setPaused((p) => !p)}
            title={paused ? 'เดินเวลาต่อ' : 'หยุดเวลาชั่วคราว'}
            aria-label={paused ? 'เดินเวลาต่อ' : 'หยุดเวลาชั่วคราว'}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold"
          >
            {paused ? '▶' : '⏸'}
          </button>
        )}
        {/* FIX #18: กรรมการย้อนกลับไปทีมก่อนหน้าได้ตามที่พิจารณา */}
        <button
          onClick={() => dispatch({ type: 'UNDO_TURN' })}
          title="ย้อนกลับไปทีมก่อนหน้า (กรรมการพิจารณา)"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold"
        >
          ↩ ย้อนทีม
        </button>
        <TimerCircle
          duration={state.settings.turnSeconds}
          phase={state.phase}
          paused={paused}
          // turnKey ต้องไม่ชนกันข้ามตาของทีมต่างกัน: turnNumber * 1000 + currentTeamIndex
          // ใช้ได้ตราบใดที่ maxTeams < 1000 — ถ้าใครเพิ่ม maxTeams ต้องเปลี่ยนสูตรนี้
          turnKey={state.turnNumber * 1000 + state.currentTeamIndex}
          onTimeout={() => dispatch({ type: 'TIMEOUT' })}
        />
      </div>
    </div>
  )
}

// FIX #30: หาทีมถัดไปที่ยังรอด ตามทิศทางปัจจุบัน
export function nextAliveTeam(
  teams: { id: string; name: string; alive: boolean }[],
  currentIndex: number,
  direction: 1 | -1,
): { id: string; name: string } | null {
  const len = teams.length
  let i = currentIndex
  for (let step = 1; step < len; step++) {
    i = (i + direction + len) % len
    if (teams[i].alive) return teams[i]
  }
  return null
}

function TeamList() {
  const { state } = useGame()
  const currentIdx = state.currentTeamIndex
  const isGameover = state.phase === 'gameover'
  // FIX #38: อันดับ + เหรียญ — ระหว่างเล่นเปิดแค่ทองแดง (ทีมที่ตายจนเหลือ 3 ทีม)
  // ทอง/เงินโผล่พร้อมกันตอนเกมจบ เพราะก่อนนั้นยังไม่รู้ว่าใครชนะ
  const { rankings } = computeRankings(state.teams)
  const rankOf = new Map(rankings.map((r) => [r.team.id, r.rank]))
  return (
    <aside className="panel flex h-max flex-col gap-1">
      <h3 className="section-label mb-2">ทีม</h3>
      {state.teams.map((t, i) => {
        const medal = visibleMedal(t, state.teams.length, isGameover, rankOf.get(t.id) ?? 99)
        // ลำดับความสำคัญ: ทีมปัจจุบัน > เหรียญ > ยังรอด > ตาย
        // เหรียญต้องมาก่อน branch ตาย ไม่งั้นทีมที่ได้ทองแดงจะถูกหรี่จนมองไม่เห็น
        // ทุก branch มี border-2 (branch ที่ไม่มีเหรียญใช้ border-transparent)
        // เพื่อให้ความสูงแถวไม่ขยับตอนเหรียญโผล่ — ดู FIX #26 เรื่อง layout นิ่ง
        const rowClass =
          i === currentIdx && !isGameover
            ? 'border-primary bg-primary/10 font-bold'
            : medal !== null
              ? `${medalClass(medal)} font-bold`
              : t.alive
                ? 'border-transparent bg-background'
                : 'border-transparent opacity-40 line-through'
        return (
        <div
          key={t.id}
          className={'flex items-center gap-2 rounded-lg border-2 px-3 py-2 ' + rowClass}
        >
          {medal !== null && (
            <span className="shrink-0 text-base" title={`อันดับ ${medal}`}>
              {MEDAL_EMOJI[medal - 1]}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-base">{t.name}</span>
          {t.glitchTurnsLeft > 0 && (
            <span
              className="rounded-full bg-purple-600 px-2 py-0.5 text-xs font-bold text-white"
              title="ติด glitch"
            >
              ⚡{t.glitchTurnsLeft}
            </span>
          )}
          {t.shieldCharges > 0 && (
            <span
              className="rounded-full bg-cyan-600 px-2 py-0.5 text-xs font-bold text-white"
              title="กาง Shield — กันระเบิดได้"
            >
              🛡{t.shieldCharges}
            </span>
          )}
          {t.blockCharges > 0 && (
            <span
              className="rounded-full bg-slate-500 px-2 py-0.5 text-xs font-bold text-white"
              title="มี Block — กัน effect จากทีมอื่นได้"
            >
              🚫{t.blockCharges}
            </span>
          )}
          {t.pendingOpens > 1 && (
            <span
              className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white"
              title="ต้องเปิดหลายป้าย"
            >
              ⚔{t.pendingOpens}
            </span>
          )}
        </div>
        )
      })}
    </aside>
  )
}

function StatusPanel() {
  const { state } = useGame()
  // FIX #28: โอกาสโดนระเบิดระหว่างเล่น = ระเบิดทั้งหมด / ช่องที่ยังไม่เปิด
  let hidden = 0
  for (let n = state.rangeMin; n <= state.rangeMax; n++) {
    if (!(n in state.cells)) hidden++
  }
  const chance = Math.round(hitChance(state.bombsRemaining, hidden) * 100)
  const chanceClass =
    chance >= 50
      ? 'text-red-600 dark:text-red-400'
      : chance >= 30
        ? 'text-orange-500'
        : chance >= 15
          ? 'text-yellow-500'
          : 'text-emerald-600 dark:text-emerald-400'

  return (
    <div className="panel flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-center">
          <p className="section-label">ระเบิดเหลือ</p>
          <p className="font-mono text-3xl font-black text-destructive">{state.bombsRemaining}</p>
        </div>
        <div className="text-center">
          <p className="section-label">ช่องเหลือ</p>
          <p className="font-mono text-3xl font-black">{hidden}</p>
        </div>
        <div className="text-center">
          <p className="section-label">สถานะ</p>
          <p className="text-lg font-bold">{phaseLabel(state.phase)}</p>
        </div>
      </div>

      {/* FIX #28: แถบโอกาสโดนระเบิดถ้าเปิดช่องแบบสุ่ม */}
      <div>
        <div className="mb-1 flex items-center justify-between text-sm font-bold">
          <span>โอกาสโดนระเบิด</span>
          <span className={`font-mono text-xl font-black ${chanceClass}`}>{chance}%</span>
        </div>
        <div className="range-bar">
          <div
            className={
              chance >= 50
                ? 'bg-red-600'
                : chance >= 30
                  ? 'bg-orange-500'
                  : chance >= 15
                    ? 'bg-yellow-400'
                    : 'bg-emerald-500'
            }
            style={{ width: `${Math.max(chance, 1)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function LogPanel() {
  const { state } = useGame()
  // engine push log ต่อท้าย (เก่า→ใหม่) — ต้องตัดท้ายแล้วกลับด้าน ไม่ใช่ slice(0,10)
  // ไม่งั้นพอเกิน 10 เหตุการณ์ panel จะค้างอยู่ที่ 10 อันแรกตลอดเกม
  const latest = state.log.slice(-40).reverse()
  return (
    <div className="panel flex min-h-0 flex-col gap-1">
      <h3 className="section-label mb-1">บันทึก</h3>
      {latest.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีเหตุการณ์</p>}
      <div className="flex max-h-96 flex-col gap-0.5 overflow-y-auto">
        {latest.map((l) => (
          <p
            key={l.id}
            className={`border-b border-border py-1.5 text-sm leading-5 last:border-0 ${logClass(l.level)}`}
          >
            {/* FIX #33: timestamp ทุกบรรทัด */}
            <span className="mr-2 font-mono text-xs text-muted-foreground">{logTime(l.at)}</span>
            {l.message}
          </p>
        ))}
      </div>
    </div>
  )
}

// FIX #31/#32: สีข้อความตามระดับ — danger แดง (ตกรอบ), warn เหลือง (ต้องตัดสาย)
export function logClass(level?: string): string {
  switch (level) {
    case 'danger':
      return 'font-bold text-red-600 dark:text-red-400'
    case 'warn':
      return 'font-bold text-yellow-600 dark:text-yellow-400'
    case 'good':
      return 'font-semibold text-emerald-600 dark:text-emerald-400'
    default:
      return ''
  }
}

// FIX #33: แสดงเวลาแบบ HH:MM:SS (log เก่าที่ไม่มี at → ไม่แสดงเวลา)
export function logTime(at?: number): string {
  if (!at) return ''
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function phaseLabel(p: string): string {
  switch (p) {
    case 'cards':
      return 'ใช้การ์ด'
    case 'opening':
      return 'เปิดป้าย'
    case 'defusing':
      return 'ตัดสาย'
    case 'gameover':
      return 'จบเกม'
    default:
      return p
  }
}
