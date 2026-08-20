'use client'

import { useEffect, useState } from 'react'
import { GameProvider } from '@/components/game/GameProvider'
import { GameScreen } from '@/components/game/GameScreen'
import { ResumePrompt } from '@/components/setup/ResumePrompt'
import { SetupScreen } from '@/components/setup/SetupScreen'
import { createGame, type GameHandle } from '@/lib/game/engine'
import { defaultSettings } from '@/lib/game/config'
import { randomSeed } from '@/lib/game/rng'
import { unlockAudio } from '@/lib/audio/sfx'
import { clearSnapshot, loadSettings, loadSnapshot, saveSettings } from '@/lib/storage/session'
import type { GameSettings } from '@/lib/game/types'

export default function Page() {
  const [settings, setSettings] = useState<GameSettings>(defaultSettings())
  const [ready, setReady] = useState(false)
  const [started, setStarted] = useState(false)
  const [hasSnapshot, setHasSnapshot] = useState(false)
  const [snapshotHandled, setSnapshotHandled] = useState(false)
  const [game, setGame] = useState<GameHandle | null>(null)

  useEffect(() => {
    const saved = loadSettings()
    if (saved) setSettings(saved)
    setReady(true)
    loadSnapshot().then((snap) => setHasSnapshot(snap !== null))
  }, [])

  function startGame(s: GameSettings) {
    unlockAudio() // ปลดล็อก autoplay ด้วย user gesture แรก
    saveSettings(s)
    setSettings(s)
    setGame(createGame(s, randomSeed()))
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

  if (!started || !game) {
    return (
      <>
        <SetupScreen initial={settings} onStart={startGame} />
        {hasSnapshot && !snapshotHandled && (
          <ResumePrompt onResume={resumeGame} onNewGame={discardSnapshot} />
        )}
      </>
    )
  }

  return (
    <GameProvider handle={game}>
      <GameScreen />
    </GameProvider>
  )
}