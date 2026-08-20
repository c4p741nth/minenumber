import { useEffect, useState } from 'react'
import type { CellState } from '@/lib/game/types'

interface ScanTarget {
  center: number
  radius: number
}

interface Props {
  rangeMin: number
  rangeMax: number
  cells: Record<number, CellState>
  // FIX #15: ช่องที่เปิดแล้วได้การ์ด (cell -> teamId)
  cardCells?: Record<number, string>
  disabled: boolean
  onOpen: (cell: number) => void
  // ช่องที่ Scan กำลังสแกน (W6.3) — รับแค่ center/radius ไม่รับตำแหน่งระเบิด
  scanning?: ScanTarget | null
}

const OPENED_STYLES: Record<Exclude<CellState, 'hidden'>, { cls: string; label: string }> = {
  safe: { cls: 'bg-secondary text-muted-foreground opacity-70', label: '✓' },
  detonated: { cls: 'bg-red-600 text-white', label: '💥' },
  defused: { cls: 'bg-emerald-500 text-white', label: '🔧' },
  glitched: { cls: 'bg-purple-600 text-white', label: '⚡' },
}

// B8: กระดานช่องเยอะ (เช่น 200 ช่อง) ในคอลัมน์กลางที่แคบ ได้แค่ ~7 คอลัมน์ → หน้ายาวมาก
// ย่อขนาดช่องขั้นบันไดตามจำนวนช่อง เพื่อให้ได้คอลัมน์ต่อแถวมากขึ้น
export function cellSizeFor(count: number): number {
  if (count > 300) return 34
  if (count > 120) return 40
  if (count > 60) return 48
  return 56
}

export function Board({
  rangeMin,
  rangeMax,
  cells,
  cardCells = {},
  disabled,
  onOpen,
  scanning = null,
}: Props) {
  // FIX #16: กันลั่นกดผิดช่อง — เลือกก่อน แล้วกดยืนยันอีกที
  const [picked, setPicked] = useState<number | null>(null)

  // ขึ้นตาใหม่ / ปิดกระดาน → ล้างช่องที่เลือกค้างไว้
  useEffect(() => {
    if (disabled) setPicked(null)
  }, [disabled])

  const numbers: number[] = []
  for (let n = rangeMin; n <= rangeMax; n++) numbers.push(n)

  const size = cellSizeFor(numbers.length)
  const small = size < 56

  function confirm() {
    if (picked === null) return
    const cell = picked
    setPicked(null)
    onOpen(cell)
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        // scroll ในกรอบตัวเองเมื่อกระดานสูงเกินจอ — ไม่ดันหน้าให้ยาวจนต้องเลื่อนทั้งหน้า
        className="grid max-h-[calc(100vh-20rem)] gap-2 overflow-y-auto pr-1"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}
      >
        {numbers.map((n) => {
          const state = cells[n] ?? 'hidden'
          const inScan =
            scanning !== null &&
            n >= scanning.center - scanning.radius &&
            n <= scanning.center + scanning.radius
          const scanDelay = inScan ? Math.abs(n - scanning!.center) * 0.06 : 0
          if (state === 'hidden') {
            const isPicked = picked === n
            return (
              <button
                key={n}
                onClick={() => setPicked(isPicked ? null : n)}
                disabled={disabled}
                aria-pressed={isPicked}
                style={{ minHeight: size, ...(inScan ? { animationDelay: `${scanDelay}s` } : {}) }}
                className={
                  'grid place-items-center rounded-lg border-2 p-1 font-mono ' +
                  'font-black transition hover:border-primary ' +
                  'disabled:cursor-not-allowed disabled:opacity-50 ' +
                  (isPicked
                    ? 'cell-picked border-primary bg-primary text-primary-foreground '
                    : 'border-border bg-card hover:bg-primary hover:text-primary-foreground ') +
                  (small ? 'text-base ' : 'text-xl ') +
                  (inScan ? 'cell-scan' : '')
                }
              >
                {n}
              </button>
            )
          }
          const s = OPENED_STYLES[state]
          // FIX #15: ช่องที่เปิดแล้วได้การ์ด — ใส่ขอบ/จุดสีให้เห็นว่าการ์ดมาจากช่องนี้
          const gaveCard = cardCells[n] !== undefined
          return (
            <button
              key={n}
              disabled
              style={{ minHeight: size }}
              className={
                `relative grid place-items-center rounded-lg border-2 ` +
                `p-1 font-mono font-black ${small ? 'text-lg' : 'text-2xl'} ${s.cls} ` +
                (gaveCard ? 'cell-gave-card border-amber-400' : 'border-transparent')
              }
              title={gaveCard ? `${state} — ช่องนี้ได้การ์ด` : state}
            >
              {s.label}
              {gaveCard && (
                <span className="absolute -top-1 -right-1 text-xs" aria-label="ได้การ์ดจากช่องนี้">
                  🃏
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* FIX #16: แถบยืนยันช่องที่เลือก — กันกดผิดช่อง */}
      {picked !== null && !disabled && (
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-xl border-2 border-primary bg-primary/10 p-3">
          <span className="text-base font-bold">
            เลือกช่อง <span className="font-mono text-2xl font-black">{picked}</span> —
            ยืนยันเปิดไหม?
          </span>
          <button
            onClick={confirm}
            className="rounded-lg bg-[var(--confirm)] px-5 py-2 text-base font-black text-white"
          >
            ✓ ยืนยันเปิด
          </button>
          <button
            onClick={() => setPicked(null)}
            className="rounded-lg border-2 border-border bg-background px-4 py-2 text-base font-bold"
          >
            ยกเลิก
          </button>
        </div>
      )}
    </div>
  )
}
