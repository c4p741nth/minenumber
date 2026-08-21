
import { useEffect, useState } from 'react'
import { useGame } from '@/components/game/GameProvider'
import { sfx } from '@/lib/audio/sfx'
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

// B7: ย่อขนาดการ์ดเมื่อใบเยอะ (64 → 48 → 36px) ก่อนจะปล่อยให้ scroll แนวนอน
// แยกเป็น pure function ที่ export เพื่อให้ threshold มีเทสคุม (เหมือน cellSizeFor ของ Board)
export function cardWidthFor(count: number): number {
  if (count > 20) return 36
  if (count > 12) return 48
  return 64
}

// FIX #43: Block หงายหน้าอยู่แล้ว + เก็บไว้ในมือได้ (ไม่ถูกบังคับใช้/ทิ้ง)
// การ์ดอื่นเปิดดูแล้ว "เห็นข้อมูลลับ" (เช่น Scan รู้ผลก่อนตัดสินใจ) จึงต้องบังคับตัดสินใจ
// แต่ Block เป็น defensive charge หงายอยู่แล้วไม่มีอะไรรั่ว → ปิดกลับได้
export function isFaceUpCard(card: CardType): boolean {
  return card === 'block'
}

// การ์ดที่เปิดดูแล้วเก็บกลับเข้ามือได้ — คู่กับ isFaceUpCard โดยเจตนา
// (หงายอยู่แล้ว = ไม่มีข้อมูลลับให้รั่ว = ไม่ต้องบังคับตัดสินใจ)
export function canKeepInHand(card: CardType): boolean {
  return isFaceUpCard(card)
}

// W5.3: ไพ่ในมือคว่ำหน้าทั้งหมด — กดเปิดทีละใบ (revealed) แล้วตัดสินใจ ใช้/ทิ้ง
// เปิดแล้วปิดกลับไม่ได้ และระหว่างเปิดใบหนึ่งอยู่ห้ามเปิดใบอื่นซ้อน
// ยกเว้นการ์ดที่ isFaceUpCard (Block) — หงายตลอด กดแล้วเก็บกลับได้
export function Hand({ locked = false }: HandProps) {
  const { state, dispatch } = useGame()
  const [revealed, setRevealed] = useState<number | null>(null)
  const [scanTarget, setScanTarget] = useState('')
  // FIX #20: การ์ดเยอะ ๆ จะรกจอ — หุบเก็บได้
  const [collapsed, setCollapsed] = useState(false)

  const current = state.teams[state.currentTeamIndex]
  const canPlay = state.phase === 'cards' && !locked && !state.currentGlitched && !state.currentBlocked
  const maxHand = state.settings.maxHandSize
  const handLimited = maxHand > 0
  const handFull = handLimited && current.hand.length >= maxHand

  // ขึ้นตาใหม่ → ปิดการ์ดที่เปิดค้างไว้
  useEffect(() => {
    setRevealed(null)
    setScanTarget('')
    setCollapsed(false)
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
    if (!canPlay) {
      sfx.itemUnavailable()
      return
    }
    if (revealed !== null) return // กันเปิดซ้อนระหว่างเปิดใบหนึ่งอยู่
    sfx.selectItem()
    setRevealed(i)
  }

  const needsTeam = revealedCard !== null && cardNeedsTeamTarget(revealedCard)
  const needsCell = revealedCard !== null && cardNeedsCellTarget(revealedCard)

  const handCount = current.hand.length
  const compact = handCount > 12
  const cardWidth = cardWidthFor(handCount)

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2">
      {/* ใบที่เปิดอยู่ — เลือกใช้/ทิ้ง หรือเลือกเป้า */}
      {revealedCard && (
        <div
          // FIX_LISTS #10: จอแคบ — การ์ดที่เปิดอยู่ต้องไม่ล้นขอบจอ
          className={`mx-2 flex max-w-[calc(100vw-1rem)] flex-wrap items-center gap-3 rounded-xl border-2 p-3 shadow-2xl ${CARD_COLORS[revealedCard]}`}
        >
          <span className="text-3xl leading-none">{CARD_META[revealedCard].emoji}</span>
          <div className="min-w-0">
            <p className="text-lg font-black">{CARD_META[revealedCard].name}</p>
            <p className="text-sm leading-5">{CARD_DESCRIPTIONS[revealedCard]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {needsTeam &&
              state.teams
                // FIX #23: Attack ใช้กับทีมตัวเองไม่ได้ — ไม่ต้องโชว์ปุ่มทีมตัวเอง
                .filter((t) => t.alive && t.id !== current.id)
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
            {/* FIX #43: การ์ดที่หงายอยู่แล้ว (Block) เก็บกลับเข้ามือได้ ไม่ถูกบังคับใช้/ทิ้ง */}
            {canKeepInHand(revealedCard) && (
              <button
                onClick={() => setRevealed(null)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-base font-bold"
              >
                เก็บไว้ก่อน
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

      {/* FIX #20: ที่เก็บการ์ด — มีหัวแถบบอกจำนวน + ปุ่มหุบ กันรกจอตอนการ์ดเยอะ
          การ์ดย่อลงตามจำนวนใบ (B7) แล้วถ้ายังไม่พอก็ scroll แนวนอน (แถวเดียวเสมอ) */}
      <div className="hand-dock w-full rounded-t-2xl px-3 pt-2 pb-1 shadow-2xl">
        <div className="mx-auto flex w-full max-w-375 items-center gap-3 pb-1">
          <span className="section-label">🃏 การ์ดในมือ</span>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-sm font-black">
            {handCount}
          </span>
          {handLimited && (
            <span className="text-xs text-muted-foreground">/ {maxHand} ใบ</span>
          )}
          {handFull && (
            <span
              className={
                'rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 ' +
                'dark:bg-amber-900/50 dark:text-amber-100'
              }
            >
              มือเต็ม — จั่วไม่เข้าแล้ว
            </span>
          )}
          {handCount > 0 && (
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="ml-auto rounded-lg border border-border bg-background px-3 py-1 text-sm font-bold"
              aria-expanded={!collapsed}
            >
              {collapsed ? `▲ กางการ์ด (${handCount})` : '▼ หุบเก็บ'}
            </button>
          )}
        </div>

        {!collapsed && (
          <div className="hand-scroll w-full overflow-x-auto pb-1">
            <div className="mx-auto flex w-max gap-2">
              {current.hand.map((card, i) => {
                // FIX #43: Block หงายหน้า — โชว์ emoji + ชื่อ + สีของการ์ดจริง
                // การ์ดอื่นยังคว่ำ (🂠 + เลขใบ) ไม่รั่วข้อมูล
                const faceUp = isFaceUpCard(card)
                return (
                  <button
                    key={i}
                    onClick={() => onCardClick(i)}
                    aria-disabled={!canPlay}
                    title={
                      faceUp
                        ? `${CARD_META[card].name} — ${CARD_DESCRIPTIONS[card]}`
                        : `ใบที่ ${i + 1} — กดเพื่อเปิดดู`
                    }
                    style={{ width: cardWidth }}
                    className={
                      `flex shrink-0 flex-col items-center gap-0.5 rounded-xl border-2 p-2 ` +
                      `transition hover:scale-105 ` +
                      (faceUp
                        ? `${CARD_COLORS[card]} `
                        : `border-border bg-secondary text-secondary-foreground `) +
                      `${canPlay ? 'cursor-pointer hover:border-primary' : 'cursor-not-allowed opacity-40'}`
                    }
                  >
                    <span className={compact ? 'text-lg leading-none' : 'text-2xl leading-none'}>
                      {faceUp ? CARD_META[card].emoji : '🂠'}
                    </span>
                    <span
                      className={
                        (compact ? 'text-xs font-black' : 'text-sm font-black') +
                        (faceUp ? ' max-w-full truncate' : '')
                      }
                    >
                      {faceUp ? CARD_META[card].name : `#${i + 1}`}
                    </span>
                  </button>
                )
              })}
              {current.hand.length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">ไม่มีการ์ดในมือ</p>
              )}
            </div>
          </div>
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