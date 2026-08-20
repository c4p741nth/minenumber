'use client'

import { useEffect, useRef, useState } from 'react'
import { ResumePrompt } from '@/components/setup/ResumePrompt'
import { SetupScreen } from '@/components/setup/SetupScreen'
import { createGame, type GameHandle } from '@/lib/game/engine'
import { defaultSettings } from '@/lib/game/config'
import { randomSeed } from '@/lib/game/rng'
import { clearSnapshot, loadSettings, loadSnapshot, saveSettings } from '@/lib/storage/session'
import type { GameSettings } from '@/lib/game/types'

export default function Page() {
  const [settings, setSettings] = useState<GameSettings>(defaultSettings())
  const [ready, setReady] = useState(false)
  const [started, setStarted] = useState(false)
  const [hasSnapshot, setHasSnapshot] = useState(false)
  const [snapshotHandled, setSnapshotHandled] = useState(false)
  const gameRef = useRef<GameHandle | null>(null)

  useEffect(() => {
    const saved = loadSettings()
    if (saved) setSettings(saved)
    setReady(true)
    loadSnapshot().then((snap) => setHasSnapshot(snap !== null))
  }, [])

  function startGame(s: GameSettings) {
    saveSettings(s)
    gameRef.current = createGame(s, randomSeed())
    setSettings(s)
    setStarted(true)
  }

  // Task 10 จะกู้ state กลางเกมกลับมา — ตอนนี้เริ่มด้วย settings เดิมของ snapshot
  async function resumeGame() {
    const snap = await loadSnapshot()
    if (snap) startGame(snap.state.settings)
    setSnapshotHandled(true)
  }

  async function discardSnapshot() {
    await clearSnapshot()
    setHasSnapshot(false)
    setSnapshotHandled(true)
  }

  if (!ready) {
    return <div className="grid min-h-screen place-items-center">กำลังโหลด…</div>
  }

  if (!started) {
    return (
      <>
        <SetupScreen initial={settings} onStart={startGame} />
        {hasSnapshot && !snapshotHandled && (
          <ResumePrompt onResume={resumeGame} onNewGame={discardSnapshot} />
        )}
      </>
    )
  }

  const state = gameRef.current?.getState()
  const current = state?.teams[state?.currentTeamIndex ?? 0]

  return (
    <div className="grid min-h-screen place-items-center p-8">
      <div className="text-center">
        <p className="section-label">เกมเริ่มแล้ว — ตาของ</p>
        <h1 className="mt-2 font-serif text-6xl font-bold">{current?.name}</h1>
        <p className="mt-4 text-muted-foreground">
          ระเบิดเหลือ {state?.bombsRemaining} ลูก — กระดานจะมาใน Task 5
        </p>
      </div>
    </div>
  )
}