import { useGame } from '@/components/game/GameProvider'

// FIX #25: ทีมที่ถือ Block ถูกถามว่าจะใช้กัน effect ไหม
// FIX_LISTS #10: ถามทีละทีมจนกว่าจะมีคนกัน หรือทุกทีมที่ถือ Block ตอบว่าไม่กัน
//   หัวคิว (askQueue[0]) คือทีมที่กำลังถูกถามอยู่ตอนนี้
// ⚠️ ห้ามบอกว่าอีกฝ่ายใช้การ์ดอะไร — ผู้เล่นต้องตัดสินใจโดยไม่เห็นการ์ด
export function BlockPrompt() {
  const { state, dispatch } = useGame()
  const pending = state.pendingBlock
  if (!pending) return null

  // snapshot เก่าไม่มี askQueue → ตกกลับไปถามทีมเป้าหมายเหมือนพฤติกรรมเดิม
  const responderId = pending.askQueue?.[0] ?? pending.targetTeamId
  const responder = state.teams.find((t) => t.id === responderId)
  if (!responder) return null

  const target = state.teams.find((t) => t.id === pending.targetTeamId)
  // ทีมที่ถูกถามไม่ใช่ทีมที่โดน effect → บอกให้รู้ว่ากำลังกันแทนใคร
  const defendingOther = target != null && target.id !== responder.id
  const waiting = Math.max((pending.askQueue?.length ?? 1) - 1, 0)

  // FIX_LISTS ชุดใหม่ #9: กลางจอแนวตั้งจริง และเลื่อนอ่านได้ถ้ากล่องสูงเกินจอ
  return (
    <div
      className="fixed inset-0 z-50 flex overflow-y-auto bg-black/80 p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="m-auto w-full max-w-lg rounded-2xl border-2 border-slate-500 bg-card p-8 text-center">
        <p className="section-label">
          {defendingOther ? 'มีทีมใช้ effect ใส่ทีมอื่น' : 'มีทีมใช้ effect ใส่คุณ'}
        </p>
        <h2 className="mt-2 font-serif text-4xl font-bold">{responder.name}</h2>
        {defendingOther && target && (
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            (effect กำลังจะลงที่ {target.name} — จะกันแทนก็ได้)
          </p>
        )}
        <p className="mt-4 text-lg leading-7">
          จะใช้การ์ด <b>🚫 Block</b> เพื่อกันไว้ไหม?
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          (ไม่บอกว่าเป็น effect อะไร — เหลือ Block อยู่{' '}
          {responder.hand.filter((c) => c === 'block').length} ใบ)
        </p>
        {waiting > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            ถ้าไม่กัน จะถามทีมที่ถือ Block ต่อไปอีก {waiting} ทีม
          </p>
        )}

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
