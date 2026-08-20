'use client'

import { useState } from 'react'
import { useGame } from '@/components/game/GameProvider'
import {
  CARD_DESCRIPTIONS,
  CARD_META,
  cardNeedsCellTarget,
  cardNeedsTeamTarget,
} from '@/lib/game/cards'
import type { CardType } from '@/lib/game/types'

const CARD_COLORS: Record<CardType, string> = {
  scan: 'border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300',
  skip: 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  block: 'border-slate-500 bg-slate-500/15 text-slate-700 dark:text-slate-300',
  reverse: 'border-orange-500 bg-orange-500/15 text-orange-700 dark:text-orange-300',
  shuffle: 'border-purple-500 bg-purple-500/15 text-purple-700 dark:text-purple-300',
  attack: 'border-red-500 bg-red-500/15 text-red-700 dark:text-red-300',
}

interface HandProps {
  // ล็อกการ์ด — ผู้เล่นเลือก "เปิดป้ายเลย" ในตานี้ (ยังจั่ว/เห็นมือได้ แต่ใช้ไม่ได้)
  locked?: boolean
}

export function Hand({ locked = false }: HandProps) {
  const { state, dispatch } = useGame()
  const [selected, setSelected] = useState<CardType | null>(null)
  const [scanTarget, setScanTarget] = useState('')

  const current = state.teams[state.currentTeamIndex]
  const canPlay = state.phase === 'cards' && !locked && !state.currentGlitched && !state.currentBlocked
  const maxHand = state.settings.maxHandSize
  const handFull = current.hand.length >= maxHand

  if (!state.settings.cardsEnabled || state.phase === 'gameover') return null

  function playCard(card: CardType, extra?: { targetTeamId?: string; targetCell?: number }) {
    dispatch({ type: 'PLAY_CARD', card, ...extra })
    setSelected(null)
    setScanTarget('')
  }

  function onCardClick(card: CardType) {
    if (!canPlay) return
    if (cardNeedsTeamTarget(card) || cardNeedsCellTarget(card)) {
      setSelected(selected === card ? null : card)
    } else {
      playCard(card)
    }
  }

  const needsTeam = selected !== null && cardNeedsTeamTarget(selected)
  const needsCell = selected !== null && cardNeedsCellTarget(selected)

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 pb-3">
      {selected && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-2xl">
          {needsTeam &&
            state.teams
              .filter((t) => t.alive)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => playCard(selected, { targetTeamId: t.id })}
                  className={
                    'rounded-lg border-2 border-border bg-background px-3 py-2 ' +
                    'text-base font-bold hover:border-primary'
                  }
                >
                  {t.name}
                </button>
              ))}
          {needsCell && (
            <>
              <input
                type="number"
                value={scanTarget}
                min={state.rangeMin}
                max={state.rangeMax}
                onChange={(e) => setScanTarget(e.target.value)}
                placeholder="เลขเป้า"
                className="control w-28 text-lg font-bold"
              />
              <button
                onClick={() => playCard(selected, { targetCell: Number(scanTarget) })}
                disabled={scanTarget === ''}
                className="primary-button disabled:opacity-40"
              >
                ยืนยัน
              </button>
            </>
          )}
        </div>
      )}

      {handFull && (
        <p
          className={
            'rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800 ' +
            'dark:bg-amber-900/50 dark:text-amber-100'
          }
        >
          มือเต็ม {maxHand} ใบ — จั่วไม่เข้าแล้ว
        </p>
      )}

      <div className="flex gap-2">
        {current.hand.map((card, i) => (
          <button
            key={i}
            onClick={() => onCardClick(card)}
            disabled={!canPlay}
            title={CARD_DESCRIPTIONS[card]}
            className={
              `flex w-20 flex-col items-center gap-0.5 rounded-xl border-2 p-2 ` +
              `${CARD_COLORS[card]} transition hover:scale-105 ` +
              `disabled:cursor-not-allowed disabled:opacity-40`
            }
          >
            <span className="text-2xl leading-none">{CARD_META[card].emoji}</span>
            <span className="text-sm font-black">{CARD_META[card].name}</span>
          </button>
        ))}
        {current.hand.length === 0 && (
          <p className="text-sm text-muted-foreground">ไม่มีการ์ดในมือ</p>
        )}
      </div>

      {!canPlay && state.phase === 'cards' && (
        <p className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-muted-foreground">
          {state.currentGlitched
            ? 'ติด glitch — ใช้การ์ดไม่ได้ตานี้'
            : state.currentBlocked
              ? 'โดน Block — ใช้การ์ดไม่ได้ตานี้'
              : 'เข้าช่วงเปิดป้ายแล้ว'}
        </p>
      )}
    </div>
  )
}