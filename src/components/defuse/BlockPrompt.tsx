import { useGame } from '@/components/game/GameProvider'

// FIX #25: ทีมเป้าหมายถูกถามว่าจะใช้ Block กัน effect ไหม
// ⚠️ ห้ามบอกว่าอีกฝ่ายใช้การ์ดอะไร — ผู้เล่นต้องตัดสินใจโดยไม่เห็นการ์ด
export function BlockPrompt() {
  const { state, dispatch } = useGame()
  const pending = state.pendingBlock
  if (!pending) return null

  const target = state.teams.find((t) => t.id === pending.targetTeamId)
  if (!target) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl border-2 border-slate-500 bg-card p-8 text-center">
        <p className="section-label">มีทีมใช้ effect ใส่คุณ</p>
        <h2 className="mt-2 font-serif text-4xl font-bold">{target.name}</h2>
        <p className="mt-4 text-lg leading-7">
          จะใช้การ์ด <b>🚫 Block</b> เพื่อกันไว้ไหม?
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          (ไม่บอกว่าเป็น effect อะไร — เหลือ Block อยู่ {target.blockCharges} ใบ)
        </p>

        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => dispatch({ type: 'RESOLVE_BLOCK', use: true })}
            className="rounded-lg bg-[var(--confirm)] px-6 py-3 text-lg font-black text-white"
          >
            🚫 ใช้ Block กัน
          </button>
          <button
            onClick={() => dispatch({ type: 'RESOLVE_BLOCK', use: false })}
            className="rounded-lg border-2 border-border bg-background px-6 py-3 text-lg font-bold"
          >
            ไม่กัน (เก็บการ์ดไว้)
          </button>
        </div>
      </div>
    </div>
  )
}
