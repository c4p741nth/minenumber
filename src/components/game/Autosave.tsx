
import { useEffect, useRef } from 'react'
import { useGame } from './GameProvider'
import { clearSnapshot, saveSnapshot } from '@/lib/storage/session'

const DEBOUNCE_MS = 300

// autosave ทุกครั้งที่ state เปลี่ยน (debounce 300ms)
// และกันปิดแท็บพลาดกลางงาน (beforeunload) ระหว่างเกม
export function Autosave() {
  const { state, handle } = useGame()
  const inFlight = useRef(false)

  useEffect(() => {
    if (state.phase === 'gameover') {
      void clearSnapshot()
      return
    }
    const t = window.setTimeout(() => {
      void (async () => {
        if (inFlight.current) return
        inFlight.current = true
        try {
          await saveSnapshot(state, handle.serializeSecret())
        } finally {
          inFlight.current = false
        }
      })()
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [state, handle])

  useEffect(() => {
    if (state.phase === 'gameover') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [state.phase])

  return null
}
