'use client'

import type { CellState } from '@/lib/game/types'

interface Props {
  rangeMin: number
  rangeMax: number
  cells: Record<number, CellState>
  disabled: boolean
  onOpen: (cell: number) => void
}

const OPENED_STYLES: Record<Exclude<CellState, 'hidden'>, { cls: string; label: string }> = {
  safe: { cls: 'bg-secondary text-muted-foreground opacity-70', label: '✓' },
  detonated: { cls: 'bg-red-600 text-white', label: '💥' },
  defused: { cls: 'bg-emerald-500 text-white', label: '🔧' },
  glitched: { cls: 'bg-purple-600 text-white', label: '⚡' },
}

export function Board({ rangeMin, rangeMax, cells, disabled, onOpen }: Props) {
  const numbers: number[] = []
  for (let n = rangeMin; n <= rangeMax; n++) numbers.push(n)

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}
    >
      {numbers.map((n) => {
        const state = cells[n] ?? 'hidden'
        if (state === 'hidden') {
          return (
            <button
              key={n}
              onClick={() => onOpen(n)}
              disabled={disabled}
              className={
                'grid min-h-[56px] place-items-center rounded-lg border-2 p-1 font-mono ' +
                'text-xl font-black transition hover:border-primary hover:bg-primary ' +
                'border-border bg-card hover:text-primary-foreground ' +
                'disabled:cursor-not-allowed disabled:opacity-50'
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
            className={
              `grid min-h-[56px] place-items-center rounded-lg border-2 border-transparent ` +
              `p-1 font-mono text-2xl font-black ${s.cls}`
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