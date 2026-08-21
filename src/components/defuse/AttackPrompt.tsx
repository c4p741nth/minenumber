import { useEffect, useState } from 'react'
import { useGame } from '@/components/game/GameProvider'
import { sfx } from '@/lib/audio/sfx'
import { CARD_ART, CARD_DESCRIPTIONS, CARD_META } from '@/lib/game/cards'

// Phase 'defending' — การ์ดโจมตีของศัตรูที่ค้างอยู่ถึงตา เลือกว่าจะกันใบไหนด้วย Block
// กัน 1 ใบต่อ 1 การ์ดโจมตี (ใช้ Block ในมือ) ถ้าไม่มี Block เอนจินข้าม phase นี้ไปเลย
// จับเวลาตัดสินใจ (defendSeconds ตั้งค่าได้) — หมดเวลา = ไม่กัน โดนทั้งหมด
export function AttackPrompt() {
  const { state, dispatch } = useGame()
  const [selected, setSelected] = useState<boolean[]>([])

  const team = state.teams[state.currentTeamIndex]
  const phase = state.phase
  const attacks = team?.pendingAttacks.length ?? 0
  const blocksLeft = team ? team.hand.filter((c) => c === 'block').length : 0
  const limit = state.settings.defendSeconds
  const [left, setLeft] = useState(limit)

  // ขึ้น defending รอบใหม่ → รีเซ็ตการเลือก + ตัวจับเวลา
  useEffect(() => {
    setSelected([])
    setLeft(state.settings.defendSeconds)
  }, [phase, state.turnNumber, state.currentTeamIndex])

  if (phase !== 'defending' || !team || attacks === 0) return null

  const selectedCount = selected.filter(Boolean).length
  const totalOpens = team.pendingAttacks.reduce((s, a) => s + a.opens, 0)

  // นับถอยหลังตัดสินใจ — หมดเวลา = ไม่กัน โดนทั้งหมด
  useEffect(() => {
    if (limit <= 0) return
    if (left <= 0) {
      dispatch({ type: 'RESOLVE_ATTACK_DEFENSE', use: 0 })
      return
    }
    sfx.bombTimer()
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => window.clearTimeout(t)
  }, [left, limit, phase])

  return (
    <div
      className="fixed inset-0 z-50 flex overflow-y-auto bg-black p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="m-auto flex w-full max-w-6xl flex-col items-center gap-4 rounded-3xl border-2 border-red-500 bg-card p-5 text-center sm:p-8">
        <p className="section-label">⚔️ มีทีมโจมตีคุณก่อนถึงตา</p>
        <h2 className="font-serif text-3xl font-bold sm:text-4xl">{team.name}</h2>
        {limit > 0 && (
          <p
            className={`font-mono text-5xl font-black leading-none sm:text-6xl ${
              left <= 5 ? 'text-red-500 timer-urgent' : 'text-[var(--primary)]'
            }`}
            aria-live="polite"
          >
            {Math.max(left, 0)}
          </p>
        )}
        <p className="text-sm text-muted-foreground sm:text-base">
          โดนโจมตี {attacks} ครั้ง — ถ้าไม่กันเลย ต้องเปิดเพิ่ม {totalOpens} ป้าย
        </p>

        <div className="flex items-center justify-center gap-2">
          <p className="text-lg font-bold">เลือกการ์ดโจมตีของศัตรูที่จะ Block</p>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-base font-black">
            {selectedCount}/{attacks}
          </span>
        </div>

        {/* การ์ดโจมตีของศัตรูที่ค้างอยู่ — เลือกใบที่จะกัน (1 Block ต่อ 1 ใบ) */}
        <div className="flex flex-wrap justify-center gap-4">
          {team.pendingAttacks.map((a, i) => {
            const isSel = selected[i] ?? false
            // เลือกครบตามจำนวน Block แล้ว → ใบที่เหลือเลือกไม่ได้
            const selectable = isSel || selectedCount < blocksLeft
            return (
              <div key={i} className="group relative">
                <button
                  onClick={() => {
                    if (!selectable) return
                    setSelected((s) => {
                      const next = [...s]
                      next[i] = !next[i]
                      return next
                    })
                  }}
                  aria-pressed={isSel}
                  title={CARD_DESCRIPTIONS.attack}
                  className={
                    'relative rounded-2xl transition ' +
                    (isSel
                      ? 'scale-105 ring-4 ring-[var(--confirm)]'
                      : selectable
                        ? 'opacity-80 hover:scale-105 hover:opacity-100'
                        : 'cursor-not-allowed opacity-40')
                  }
                >
                  <img
                    src={CARD_ART.attack}
                    alt={`${CARD_META.attack.name} ${i + 1}`}
                    className="h-64 w-auto sm:h-80"
                    draggable={false}
                  />
                  {/* จำนวนป้ายที่การ์ดใบนี้บังคับให้เปิดเพิ่ม */}
                  <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 font-mono text-sm font-bold text-white sm:text-base">
                    +{a.opens}
                  </span>
                </button>
                {/* tooltip ตอนชี้ — อ่าน effect ของการ์ดโจมตี */}
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-60 -translate-x-1/2 rounded-lg border border-border bg-card p-2 text-left text-xs leading-4 opacity-0 shadow-xl transition group-hover:opacity-100">
                  {CARD_DESCRIPTIONS.attack}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          กัน 1 ใบต่อ 1 การ์ดโจมตี (เหลือ Block {blocksLeft} ใบ) — เก็บไว้ได้ถ้าอยากกัน
          Reverse / Shuffle ที่อาจมาในภายหลัง
        </p>

        <div className="mt-1 flex justify-center gap-3">
          <button
            onClick={() => dispatch({ type: 'RESOLVE_ATTACK_DEFENSE', use: selectedCount })}
            disabled={selectedCount === 0}
            className="rounded-lg bg-[var(--confirm)] px-6 py-3 text-lg font-black text-white disabled:opacity-40"
          >
            ยืนยัน Block
          </button>
          <button
            onClick={() => dispatch({ type: 'RESOLVE_ATTACK_DEFENSE', use: 0 })}
            className="rounded-lg border-2 border-border bg-background px-6 py-3 text-lg font-bold"
          >
            ไม่ Block
          </button>
        </div>
      </div>
    </div>
  )
}