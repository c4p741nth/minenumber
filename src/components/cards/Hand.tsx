
import { useEffect, useState } from 'react'
import { useGame } from '@/components/game/GameProvider'
import {
  CARD_COLORS,
  CARD_DESCRIPTIONS,
  CARD_META,
  cardNeedsCellTarget,
  cardNeedsTeamTarget,
} from '@/lib/game/cards'
import type { CardType } from '@/lib/game/types'

interface HandProps {
  // ล็อกการ์ด — ผู้เล่นเลือก "เปิดป้ายเลย" ในตานี้ (ยังจั่ว/เห็นมือได้ แต่ใช้ไม่ได้)
  locked?: boolean
}

// W5.3: ไพ่ในมือคว่ำหน้าทั้งหมด — กดเปิดทีละใบ (revealed) แล้วตัดสินใจ ใช้/ทิ้ง
// เปิดแล้วปิดกลับไม่ได้ และระหว่างเปิดใบหนึ่งอยู่ห้ามเปิดใบอื่นซ้อน
export function Hand({ locked = false }: HandProps) {
  const { state, dispatch } = useGame()
  const [revealed, setRevealed] = useState<number | null>(null)
  const [scanTarget, setScanTarget] = useState('')

  const current = state.teams[state.currentTeamIndex]
  const canPlay = state.phase === 'cards' && !locked && !state.currentGlitched && !state.currentBlocked
  const maxHand = state.settings.maxHandSize
  const handLimited = maxHand > 0
  const handFull = handLimited && current.hand.length >= maxHand

  // ขึ้นตาใหม่ → ปิดการ์ดที่เปิดค้างไว้
  useEffect(() => {
    setRevealed(null)
    setScanTarget('')
  }, [state.turnNumber, state.currentTeamIndex])

  if (!state.settings.cardsEnabled || state.phase === 'gameover') return null

  const revealedCard = revealed !== null ? current.hand[revealed] : null

  function playRevealed(extra?: { targetTeamId?: string; targetCell?: number }) {
    if (revealedCard === null) return
    dispatch({ type: 'PLAY_CARD', card: revealedCard, index: revealed!, ...extra })
    setRevealed(null)
    setScanTarget('')
  }

  function discardRevealed() {
    if (revealed === null) return
    dispatch({ type: 'DISCARD_CARD', index: revealed })
    setRevealed(null)
  }

  function onCardClick(i: number) {
    if (!canPlay) return
    if (revealed !== null) return // กันเปิดซ้อนระหว่างเปิดใบหนึ่งอยู่
    setRevealed(i)
  }

  const needsTeam = revealedCard !== null && cardNeedsTeamTarget(revealedCard)
  const needsCell = revealedCard !== null && cardNeedsCellTarget(revealedCard)

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 pb-3">
      {/* ใบที่เปิดอยู่ — เลือกใช้/ทิ้ง หรือเลือกเป้า */}
      {revealedCard && (
        <div
          className={`flex flex-wrap items-center gap-3 rounded-xl border-2 p-3 shadow-2xl ${CARD_COLORS[revealedCard]}`}
        >
          <span className="text-3xl leading-none">{CARD_META[revealedCard].emoji}</span>
          <div className="min-w-0">
            <p className="text-lg font-black">{CARD_META[revealedCard].name}</p>
            <p className="text-sm leading-5">{CARD_DESCRIPTIONS[revealedCard]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {needsTeam &&
              state.teams
                .filter((t) => t.alive)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => playRevealed({ targetTeamId: t.id })}
                    className="rounded-lg border-2 border-border bg-background px-3 py-2 text-base font-bold hover:border-primary"
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
                  onClick={() => playRevealed({ targetCell: Number(scanTarget) })}
                  disabled={scanTarget === ''}
                  className="primary-button disabled:opacity-40"
                >
                  ยืนยัน
                </button>
              </>
            )}
            {!needsTeam && !needsCell && (
              <button onClick={() => playRevealed()} className="primary-button">
                ใช้
              </button>
            )}
            <button
              onClick={discardRevealed}
              className="rounded-lg border border-border bg-background px-3 py-2 text-base font-bold text-destructive"
            >
              ทิ้ง
            </button>
          </div>
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
        {current.hand.map((_, i) => (
          <button
            key={i}
            onClick={() => onCardClick(i)}
            disabled={!canPlay}
            title={`ใบที่ ${i + 1} — กดเพื่อเปิดดู`}
            className={
              `flex w-16 flex-col items-center gap-0.5 rounded-xl border-2 p-2 ` +
              `border-border bg-secondary text-secondary-foreground transition hover:scale-105 ` +
              `disabled:cursor-not-allowed disabled:opacity-40`
            }
          >
            <span className="text-2xl leading-none">🂠</span>
            <span className="text-sm font-black">#{i + 1}</span>
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