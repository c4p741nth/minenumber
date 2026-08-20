import { useEffect, useRef, useState } from 'react'
import { useGame } from '@/components/game/GameProvider'
import { isPlaylistId, parseYouTubeId } from '@/lib/audio/music'

// W8: เพลง background จาก YouTube — ฝัง player ซ่อนไว้ (iframe ขนาด 0) ใช้ IFrame API
// autoplay ถูกบล็อกจนกว่าจะมี user gesture — เริ่มเกมคือ gesture แรก (unlockAudio)
// fallback: ถ้า API/ไฟล์โหลดไม่ได้ → ซ่อน UI เพลง เกมไม่พัง

type YTPlayer = {
  playVideo(): void
  pauseVideo(): void
  setVolume(v: number): void
  getVideoData(): { title?: string }
  destroy(): void
}

// โหลด YouTube IFrame API ครั้งเดียว (module-level) — กันโหลดซ้ำตอน mount หลายรอบ
let apiPromise: Promise<boolean> | null = null
function loadYouTubeApi(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (apiPromise) return apiPromise
  apiPromise = new Promise<boolean>((resolve) => {
    if ((window as unknown as { YT?: { Player?: unknown } }).YT?.Player) {
      resolve(true)
      return
    }
    const prev = (window as unknown as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady
    ;(window as unknown as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve(true)
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    s.onload = () => {
      // API ยังโหลดตัว YT เองแบบ async — รอ onYouTubeIframeAPIReady จริง ๆ
      // ถ้า 5 วิแล้วยังไม่มา ให้ timeout เตือนเอา
    }
    s.onerror = () => {
      apiPromise = null
      resolve(false)
    }
    document.head.appendChild(s)
    // safety timeout — ถ้าโหลดช้าเกิน (offline/adblock) ให้ถอดออก
    window.setTimeout(() => {
      if (!(window as unknown as { YT?: { Player?: unknown } }).YT?.Player) {
        apiPromise = null
        resolve(false)
      }
    }, 8000)
  })
  return apiPromise
}

const VOLUME_KEY = 'mn.musicVolume'

export function MusicPlayer() {
  const { state } = useGame()
  const musicUrl = state.settings.musicUrl
  const [volume, setVolume] = useState(() => {
    try {
      const raw = globalThis.localStorage?.getItem(VOLUME_KEY)
      const v = raw !== null ? Number(raw) : state.settings.musicVolume
      return Number.isNaN(v) ? 30 : Math.min(Math.max(v, 0), 100)
    } catch {
      return state.settings.musicVolume
    }
  })
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [title, setTitle] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const volumeRef = useRef(volume)

  const id = musicUrl ? parseYouTubeId(musicUrl) : null
  const active = id !== null && ready && !failed

  // สร้าง player ตอน id เปลี่ยน (มุมเกมจริง ๆ แล้วไม่เปลี่ยน) — cleanup ทำลาย player เก่า
  useEffect(() => {
    if (!id) return
    let cancelled = false
    setReady(false)
    setFailed(false)
    void loadYouTubeApi().then((ok) => {
      if (cancelled || !ok) {
        if (!cancelled) setFailed(true)
        return
      }
      const YT = (window as unknown as {
        YT: { Player: new (el: HTMLElement, opts: object) => YTPlayer }
      }).YT
      const opts: Record<string, unknown> = {
        height: '0',
        width: '0',
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          loop: 1,
          rel: 0,
        },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            if (cancelled) return
            e.target.setVolume(volumeRef.current)
            try {
              e.target.playVideo()
            } catch {
              // autoplay ถูกบล็อก — ผู้เล่นกด ▶ เองได้
            }
            setPlaying(true)
            setTitle(e.target.getVideoData().title ?? '')
          },
          onStateChange: (e: { data: number }) => {
            // 1 = playing, 2 = paused, 3 = buffering
            setPlaying(e.data === 1 || e.data === 3)
          },
        },
      }
      if (isPlaylistId(id)) {
        ;(opts.playerVars as Record<string, unknown>).listType = 'playlist'
        ;(opts.playerVars as Record<string, unknown>).list = id
      } else {
        ;(opts.playerVars as Record<string, unknown>).playlist = id // จำเป็นให้ loop ทำงาน
        opts.videoId = id
      }
      try {
        const p = new YT.Player(containerRef.current!, opts)
        playerRef.current = p
        setReady(true)
      } catch {
        setFailed(true)
      }
    })
    return () => {
      cancelled = true
      try {
        playerRef.current?.destroy()
      } catch {
        // ignore
      }
      playerRef.current = null
    }
  }, [id])

  // ออกจากเกม (unmount) → ทำลาย player หยุดเพลง
  useEffect(() => {
    return () => {
      try {
        playerRef.current?.destroy()
      } catch {
        // ignore
      }
      playerRef.current = null
    }
  }, [])

  function togglePlay() {
    const p = playerRef.current
    if (!p) return
    if (playing) p.pauseVideo()
    else p.playVideo()
  }

  function changeVolume(v: number) {
    const next = Math.min(Math.max(v, 0), 100)
    setVolume(next)
    volumeRef.current = next
    playerRef.current?.setVolume(next)
    try {
      globalThis.localStorage?.setItem(VOLUME_KEY, String(next))
    } catch {
      // ignore
    }
  }

  if (!active) return null

  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow">
      <button
        onClick={togglePlay}
        className="grid h-8 w-8 place-items-center rounded-full bg-primary text-base font-bold text-primary-foreground"
        title={playing ? 'หยุดเพลง' : 'เล่นเพลง'}
        aria-label={playing ? 'หยุดเพลง' : 'เล่นเพลง'}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <div className="flex flex-col">
        <span className="max-w-40 truncate text-xs font-semibold leading-tight">
          {title || 'เพลงพื้นหลัง'}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          🔊
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            aria-label="ระดับเสียงเพลง"
            className="h-1.5 w-20 accent-[var(--primary)]"
          />
          <span className="w-8 text-right font-mono">{volume}%</span>
        </span>
      </div>
      {/* ตัวเล่นจริง — ต้องอยู่ใน DOM ขนาด 0 (ซ่อนแต่ไม่โหลดซ้ำ) */}
      <div ref={containerRef} className="pointer-events-none absolute h-0 w-0 overflow-hidden" />
    </div>
  )
}