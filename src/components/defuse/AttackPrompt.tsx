import { useEffect, useState } from 'react'
import { useGame } from '@/components/game/GameProvider'
import { sfx } from '@/lib/audio/sfx'
import { CARD_ART, CARD_DESCRIPTIONS, CARD_META } from '@/lib/game/cards'

// Phase 'defending' — การ์ดโจมตีของศัตรูที่ค้างอยู่ถึงตา เลือกว่าจะกันใบไหนด้วย Block
// กัน 1 ใบต่อ 1 การ์ดโจมตี (ใช้ Block ในมือ) ถ้าไม่มี Block เอนจินข้าม phase นี้ไปเลย
// จับเวลาตัดสินใจ (defendSeconds ตั้งค่าได้) — หมดเวลา = ไม่กัน โดนทั้งหมด
//
// FIX_LISTS ชุดที่สิบสอง #3: เดิมเป็นแผงมุมขวาที่ดูการ์ดได้ "ทีละใบ" (carousel + ลูกศร)
// ซึ่งซ่อนของสำคัญ — จำนวนการ์ดที่โดนคือข้อมูลหลักในการตัดสินใจ แต่ต้องกดลูกศรไล่ดู
// ตอนนี้เรียงการ์ดที่โดนโจมตี "หงายขึ้นมาในแนวนอน" ให้เห็นครบทุกใบพร้อมกันในทีเดียว
//   - กดที่ใบไหนก็ได้เพื่อสลับ ป้องกัน/ปล่อยผ่าน รายใบ (ไม่ต้องเลื่อนหา)
//   - ตัวนับ "block ใช้ไป N/M" อยู่บนหัว modal เห็นตลอดว่าเหลือกี่ใบ
//   - ชี้ (hover) ที่การ์ด → popup อธิบายว่าใบนี้เป็น effect อะไร
export function AttackPrompt() {
  const { state, dispatch } = useGame()
  const [selected, setSelected] = useState<boolean[]>([])
  // ชี้ค้างที่การ์ดใบไหนอยู่ (index) — โชว์คำอธิบาย effect แบบ popup
  const [hover, setHover] = useState<number | null>(null)

  const team = state.teams[state.currentTeamIndex]
  const phase = state.phase
  const attacks = team?.pendingAttacks.length ?? 0
  const blocksLeft = team ? team.hand.filter((c) => c === 'block').length : 0
  // FIX_LISTS ชุดที่สิบสาม #2: โควตา Skip แยกจาก Block คนละก้อน
  //   Block = กันรายใบ (1 ใบต่อ 1 การ์ดโจมตี), Skip = ข้ามการเปิดป้ายทั้งตาในทีเดียว
  //   จึงนับแยกและโชว์แยก ไม่ให้ผู้เล่นเข้าใจว่าใช้โควตาเดียวกัน
  const skipsLeft = team ? team.hand.filter((c) => c === 'skip').length : 0
  const limit = state.settings.defendSeconds
  const [left, setLeft] = useState(limit)

  const active = phase === 'defending' && team != null && attacks > 0

  // ขึ้น defending รอบใหม่ → รีเซ็ตการเลือก + ตัวจับเวลา
  useEffect(() => {
    setSelected([])
    setHover(null)
    setLeft(state.settings.defendSeconds)
  }, [phase, state.turnNumber, state.currentTeamIndex])

  // นับถอยหลังตัดสินใจ — หมดเวลา = ไม่กัน โดนทั้งหมด
  // ⚠️ hook ทุกตัวต้องอยู่เหนือ early return — ถ้าวางไว้ล่างจะผิดกฎ Rules of Hooks
  // (จำนวน hook ที่เรียกต้องเท่ากันทุกครั้งที่ render) เดิมไฟล์นี้ return ก่อน useEffect ตัวนี้
  useEffect(() => {
    if (!active || limit <= 0) return
    if (left <= 0) {
      dispatch({ type: 'RESOLVE_ATTACK_DEFENSE', use: 0 })
      return
    }
    sfx.bombTimer()
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => window.clearTimeout(t)
  }, [left, limit, phase, active])

  if (!active) return null

  const selectedCount = selected.filter(Boolean).length
  const totalOpens = team.pendingAttacks.reduce((s, a) => s + a.opens, 0)
  // ป้าย +N ของใบที่ไม่ได้บล็อก = ที่จะโดนจริง
  const takingOpens = team.pendingAttacks.reduce(
    (s, a, i) => (selected[i] ? s : s + a.opens),
    0,
  )

  function toggle(i: number) {
    const already = selected[i] ?? false
    // เลือกครบตามจำนวน Block ที่มีแล้ว → ใบที่เหลือติ๊กเพิ่มไม่ได้
    if (!already && selectedCount >= blocksLeft) return
    setSelected((s) => {
      const next = [...s]
      next[i] = !next[i]
      return next
    })
  }

  return (
    // FIX_LISTS ชุดที่สิบสอง #3: กลับมาเป็น modal เต็มจอ — จังหวะนี้ต้องตัดสินใจก่อนเล่นต่อ
    // (กระดานยังกดอะไรไม่ได้อยู่แล้วระหว่าง phase 'defending')
    // overflow-y-auto + m-auto: กล่องสูงเกินจอก็ยังเลื่อนอ่านได้ ไม่โดนตัดหัว/ท้าย
    <div
      className="fixed inset-0 z-50 flex overflow-y-auto bg-black/80 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="เลือกการ์ดโจมตีที่จะบล็อก"
    >
      <div
        className={
          'm-auto w-full max-w-3xl rounded-2xl border-2 border-red-500 bg-card p-6 ' +
          'shadow-[0_12px_40px_rgba(0,0,0,0.45)]'
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <p className="section-label">⚔️ โดนโจมตีก่อนถึงตา</p>
          {/* FIX_LISTS ชุดที่สิบสอง #3: ตัวนับ "block ใช้ไป N/M" อยู่บนหัว เห็นตลอดเวลา
              M = จำนวน Block ที่มีในมือ (เพดานจริงที่กันได้) ไม่ใช่จำนวนการ์ดที่โดน */}
          <span
            className={
              'rounded-full border-2 px-3 py-1 font-mono text-base font-black ' +
              (selectedCount > 0
                ? 'border-[var(--confirm)] text-[var(--confirm)]'
                : 'border-border text-muted-foreground')
            }
            aria-live="polite"
          >
            🚫 Block {selectedCount}/{blocksLeft}
          </span>
          {/* FIX_LISTS ชุดที่สิบสาม #2: โควตา Skip แยกก้อน — เห็นชัดว่าเป็นทางออกอีกทาง
              ไม่ได้กินโควตา Block และใช้ทีเดียวข้ามทั้งตา */}
          <span
            className={
              'rounded-full border-2 px-3 py-1 font-mono text-base font-black ' +
              (skipsLeft > 0
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-border text-muted-foreground')
            }
            aria-live="polite"
          >
            ⏭ Skip 0/{skipsLeft}
          </span>
          {limit > 0 && (
            <span
              className={
                'ml-auto font-mono text-3xl font-black leading-none ' +
                (left <= 5 ? 'text-red-500 timer-urgent' : 'text-[var(--primary)]')
              }
              aria-live="polite"
            >
              {Math.max(left, 0)}
            </span>
          )}
        </div>

        <h2 className="mt-2 font-serif text-3xl font-bold leading-tight">{team.name}</h2>
        <p className="mt-1 text-base text-muted-foreground">
          โดนโจมตี {attacks} ใบ — กดที่การ์ดเพื่อเลือกว่าจะ <b>ป้องกัน</b> หรือ{' '}
          <b>ปล่อยผ่าน</b> แล้วกดยืนยัน
        </p>

        {/* FIX_LISTS ชุดที่สิบสอง #3: การ์ดที่โดนเรียงหงายในแนวนอน เห็นครบทุกใบพร้อมกัน
            flex-wrap: การ์ดเยอะ ๆ ตกบรรทัดได้ ไม่ล้นออกนอกจอ
            relative: ให้ popup อธิบาย effect วางตำแหน่งอ้างอิงแถวนี้ */}
        <div className="relative mt-4">
          <ul className="flex flex-wrap items-start justify-center gap-3">
            {team.pendingAttacks.map((a, i) => {
              const isSel = selected[i] ?? false
              const selectable = isSel || selectedCount < blocksLeft
              return (
                <li key={i}>
                  <button
                    onClick={() => toggle(i)}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    aria-pressed={isSel}
                    disabled={!selectable}
                    className={
                      'relative block rounded-2xl transition ' +
                      (isSel
                        ? 'ring-4 ring-[var(--confirm)]'
                        : selectable
                          ? 'opacity-90 hover:opacity-100'
                          : 'cursor-not-allowed opacity-40')
                    }
                  >
                    <img
                      src={CARD_ART.attack}
                      alt={`${CARD_META.attack.name} ใบที่ ${i + 1} จาก ${attacks}`}
                      className="h-44 w-auto"
                      draggable={false}
                    />
                    {/* จำนวนป้ายที่การ์ดใบนี้บังคับให้เปิดเพิ่ม */}
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 font-mono text-sm font-bold text-white">
                      +{a.opens}
                    </span>
                    {/* สถานะรายใบ — อ่านได้โดยไม่ต้องเดาจากสีขอบ */}
                    <span
                      className={
                        'absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-black ' +
                        (isSel ? 'bg-[var(--confirm)] text-white' : 'bg-red-600 text-white')
                      }
                    >
                      {isSel ? '🚫 ป้องกัน' : '⚔ ปล่อยผ่าน'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {/* ชี้ที่การ์ด → popup อธิบาย effect ของใบนั้น
              วางกลางใต้แถวการ์ด — แถวเป็น wrap ได้ การอิงตำแหน่งใบเดียวจะหลุดกรอบ */}
          {hover !== null && (
            <div
              role="tooltip"
              className={
                'pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-80 -translate-x-1/2 ' +
                'rounded-xl border-2 border-red-500 bg-card p-3 text-left shadow-2xl'
              }
            >
              <p className="mb-1 font-bold">
                {CARD_META.attack.emoji} {CARD_META.attack.name} — {CARD_META.attack.th}
              </p>
              <p className="text-sm leading-5 text-muted-foreground">
                {CARD_DESCRIPTIONS.attack}
              </p>
              <p className="mt-2 text-sm font-bold">
                ใบนี้บังคับให้เปิดเพิ่ม{' '}
                <span className="font-mono">+{team.pendingAttacks[hover]?.opens ?? 1}</span> ป้าย
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-lg bg-secondary p-3 text-base">
          <div className="flex items-center justify-between font-bold">
            <span>ป้องกันไว้</span>
            <span className="font-mono">
              {selectedCount}/{attacks}{' '}
              <span className="text-muted-foreground">(มี Block {blocksLeft} ใบ)</span>
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between font-bold">
            <span>ต้องเปิดเพิ่ม</span>
            <span
              className={
                'font-mono text-xl ' +
                (takingOpens > 0 ? 'text-destructive' : 'text-[var(--confirm)]')
              }
            >
              {takingOpens} ป้าย
            </span>
          </div>
          {takingOpens < totalOpens && (
            <p className="mt-1 text-sm text-muted-foreground">
              (ถ้าไม่ป้องกันเลยจะต้องเปิด {totalOpens} ป้าย)
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => dispatch({ type: 'RESOLVE_ATTACK_DEFENSE', use: selectedCount })}
            className="rounded-lg bg-[var(--confirm)] px-6 py-3 text-lg font-black text-white"
          >
            ✓ ยืนยัน
            {selectedCount > 0 ? ` — ป้องกัน ${selectedCount} ใบ` : ' — ปล่อยผ่านทั้งหมด'}
          </button>
          {selectedCount > 0 && (
            <button
              onClick={() => setSelected([])}
              className="rounded-lg border-2 border-border bg-background px-4 py-3 text-base font-bold"
            >
              ล้างที่เลือก
            </button>
          )}
          {/* FIX_LISTS ชุดที่สิบสาม #2: ใช้ Skip ตอนตั้งรับได้เลย ไม่ต้องรอ phase ใช้การ์ด
              ข้ามการเปิดป้ายทั้งตา (รวมหนี้โจมตี) และหนี้ไม่โอนต่อให้ทีมถัดไป (#3)
              ทีมถัดไปยังมีสิทธิ์เอา Block มากัน Skip ใบนี้ตามกติกาเดิม */}
          {skipsLeft > 0 && (
            <button
              onClick={() => dispatch({ type: 'PLAY_CARD', card: 'skip' })}
              className="rounded-lg border-2 border-emerald-500 bg-emerald-500/15 px-6 py-3 text-lg font-black text-emerald-700 dark:text-emerald-300"
            >
              ⏭ ใช้ Skip — ข้ามการเปิด {totalOpens + 1} ป้าย
            </button>
          )}
        </div>

        <p className="mt-3 text-center text-sm text-muted-foreground">
          เก็บ Block ไว้ได้ถ้าอยากกัน Skip / Reverse / Shuffle ที่อาจมาภายหลัง
          {skipsLeft > 0 && ' · Skip ข้ามทั้งตาในทีเดียว แต่ทีมถัดไปเอา Block มากันได้'}
        </p>
      </div>
    </div>
  )
}
