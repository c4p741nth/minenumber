
import type { CellState } from '@/lib/game/types'

interface ScanTarget {
  center: number
  radius: number
}

interface Props {
  rangeMin: number
  rangeMax: number
  cells: Record<number, CellState>
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
  if (count > 120) return 40
  if (count > 60) return 48
  return 56
}

export function Board({ rangeMin, rangeMax, cells, disabled, onOpen, scanning = null }: Props) {
  const numbers: number[] = []
  for (let n = rangeMin; n <= rangeMax; n++) numbers.push(n)

  const size = cellSizeFor(numbers.length)
  const small = size < 56

  return (
    <div
      // scroll ในกรอบตัวเองเมื่อกระดานสูงเกินจอ — ไม่ดันหน้าให้ยาวจนต้องเลื่อนทั้งหน้า
      className="grid max-h-[calc(100vh-14rem)] gap-2 overflow-y-auto pr-1"
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
          return (
            <button
              key={n}
              onClick={() => onOpen(n)}
              disabled={disabled}
              style={{ minHeight: size, ...(inScan ? { animationDelay: `${scanDelay}s` } : {}) }}
              className={
                'grid place-items-center rounded-lg border-2 p-1 font-mono ' +
                'font-black transition hover:border-primary hover:bg-primary ' +
                'border-border bg-card hover:text-primary-foreground ' +
                'disabled:cursor-not-allowed disabled:opacity-50 ' +
                (small ? 'text-base ' : 'text-xl ') +
                (inScan ? 'cell-scan' : '')
              }
            >
              {n}
            </button>
          )
        }
        const s = OPENED_STYLES[state]
        return (
          <button
            key={n}
            disabled
            style={{ minHeight: size }}
            className={
              `grid place-items-center rounded-lg border-2 border-transparent ` +
              `p-1 font-mono font-black ${small ? 'text-lg' : 'text-2xl'} ${s.cls}`
            }
            title={state}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
