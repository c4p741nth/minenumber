
import { useEffect, useRef, useState } from 'react'
import { useGame } from '@/components/game/GameProvider'
import { CARD_COLORS } from '@/lib/game/cards'
import { sfx } from '@/lib/audio/sfx'
import type { CardType } from '@/lib/game/types'

type FxOverlay = 'glitch' | 'redflash' | null

// สังเกตการเปลี่ยนแปลงของ state แล้วเล่นเสียง + effect ตามเหตุการณ์ (§10)
export function GameEffects() {
  const { state } = useGame()
  const [overlay, setOverlay] = useState<FxOverlay>(null)
  const [drawToast, setDrawToast] = useState<CardType | null>(null)
  const lastResultSig = useRef<string | null>(null)
  const lastCardSig = useRef<string | null>(null)
  const lastDrawLogId = useRef(0)
  const phaseRef = useRef(state.phase)
  const overlayTimer = useRef<number | null>(null)
  const drawTimer = useRef<number | null>(null)

  function showOverlay(o: FxOverlay, ms: number) {
    if (overlayTimer.current) window.clearTimeout(overlayTimer.current)
    setOverlay(o)
    overlayTimer.current = window.setTimeout(() => setOverlay(null), ms)
  }

  useEffect(() => {
    const sig = state.lastResult ? JSON.stringify(state.lastResult) : null
    if (sig && sig !== lastResultSig.current) {
      if (state.lastResult?.kind === 'safe') sfx.click()
      if (state.lastResult?.kind === 'glitch') {
        sfx.glitch()
        showOverlay('glitch', 900)
      }
    }
    lastResultSig.current = sig
  }, [state.lastResult])

  useEffect(() => {
    const sig = state.lastCardResult ? JSON.stringify(state.lastCardResult) : null
    if (sig && sig !== lastCardSig.current) sfx.cardPlay()
    lastCardSig.current = sig
  }, [state.lastCardResult])

  useEffect(() => {
    const prev = phaseRef.current
    phaseRef.current = state.phase
    if (state.phase === 'gameover' && prev !== 'gameover') sfx.fanfare()
  }, [state.phase])

  // toast สีการ์ดตอนจั่ว (W5.4) — อ่านจาก log ที่มี kind='draw' (lastDraw เคลียร์ตอนขึ้นตาใหม่)
  useEffect(() => {
    const drawLog = state.log.find((l) => l.kind === 'draw' && l.id > lastDrawLogId.current)
    if (drawLog?.card) {
      lastDrawLogId.current = drawLog.id
      setDrawToast(drawLog.card)
      if (drawTimer.current) window.clearTimeout(drawTimer.current)
      drawTimer.current = window.setTimeout(() => setDrawToast(null), 1500)
    }
  }, [state.log])

  return (
    <>
      {overlay === 'glitch' && <div className="fx-glitch-overlay" />}
      {overlay === 'redflash' && <div className="fx-red-flash" />}
      {drawToast && (
        <div
          className={
            `fixed bottom-32 left-1/2 z-50 -translate-x-1/2 rounded-xl border-2 px-5 py-3 ` +
            `text-lg font-black shadow-2xl ${CARD_COLORS[drawToast]}`
          }
        >
          ได้การ์ด 1 ใบ
        </div>
      )}
    </>
  )
}
