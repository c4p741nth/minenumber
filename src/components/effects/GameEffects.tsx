
import { useEffect, useRef, useState } from 'react'
import { useGame } from '@/components/game/GameProvider'
import { sfx } from '@/lib/audio/sfx'

type FxOverlay = 'glitch' | 'redflash' | null

// สังเกตการเปลี่ยนแปลงของ state แล้วเล่นเสียง + effect ตามเหตุการณ์ (§10)
export function GameEffects() {
  const { state } = useGame()
  const [overlay, setOverlay] = useState<FxOverlay>(null)
  const lastResultSig = useRef<string | null>(null)
  const lastCardSig = useRef<string | null>(null)
  const phaseRef = useRef(state.phase)
  const overlayTimer = useRef<number | null>(null)

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

  return (
    <>
      {overlay === 'glitch' && <div className="fx-glitch-overlay" />}
      {overlay === 'redflash' && <div className="fx-red-flash" />}
    </>
  )
}
