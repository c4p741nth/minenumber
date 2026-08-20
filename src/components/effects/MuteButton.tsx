
import { useEffect, useState } from 'react'
import { setMuted } from '@/lib/audio/sfx'

const KEY = 'mn.mute'

export function MuteButton() {
  const [muted, setMutedState] = useState(false)

  useEffect(() => {
    let m = false
    try {
      m = globalThis.localStorage?.getItem(KEY) === '1'
    } catch {
      // ignore
    }
    setMutedState(m)
    setMuted(m)
  }, [])

  function toggle() {
    const next = !muted
    setMutedState(next)
    setMuted(next)
    try {
      globalThis.localStorage?.setItem(KEY, next ? '1' : '0')
    } catch {
      // ignore
    }
  }

  return (
    <button
      onClick={toggle}
      className="grid h-12 w-12 place-items-center rounded-full border border-border bg-card text-2xl shadow"
      title={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
      aria-pressed={muted}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  )
}
