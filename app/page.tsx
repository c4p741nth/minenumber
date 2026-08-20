'use client'

import { useEffect, useState } from 'react'
import { Autosave } from '@/components/game/Autosave'
import { GameProvider } from '@/components/game/GameProvider'
import { GameScreen } from '@/components/game/GameScreen'
import { LeaderboardScreen } from '@/components/leaderboard/LeaderboardScreen'
import { MainMenu } from '@/components/menu/MainMenu'
import { RulesScreen } from '@/components/rules/RulesScreen'
import { SetupScreen } from '@/components/setup/SetupScreen'
import { createGame, createGameFromState, type GameHandle } from '@/lib/game/engine'
import { defaultSettings } from '@/lib/game/config'
import { randomSeed } from '@/lib/game/rng'
import { unlockAudio } from '@/lib/audio/sfx'
import { clearSnapshot, loadSettings, loadSnapshot, saveSettings } from '@/lib/storage/session'
import type { GameSettings } from '@/lib/game/types'

type Screen = 'menu' | 'setup' | 'rules' | 'leaderboard' | 'game'

export default function Page() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [settings, setSettings] = useState<GameSettings>(defaultSettings())
  const [ready, setReady] = useState(false)
  const [hasSnapshot, setHasSnapshot] = useState(false)
  const [game, setGame] = useState<GameHandle | null>(null)

  useEffect(() => {
    const saved = loadSettings()
    if (saved) setSettings(saved)
    setReady(true)
    loadSnapshot().then((snap) => setHasSnapshot(snap !== null))
  }, [])

  function startGame(s: GameSettings) {
    unlockAudio() // ปลดล็อก autoplay ด้วย user gesture แรก
    void clearSnapshot() // เกมใหม่ → ล้าง snapshot เก่า
    saveSettings(s)
    setSettings(s)
    setGame(createGame(s, randomSeed()))
    setScreen('game')
  }

  // กู้เกมกลางคันกลับมา — สร้าง engine จาก snapshot (Task 10)
  async function resumeGame() {
    const snap = await loadSnapshot()
    if (snap) {
      unlockAudio()
      setSettings(snap.state.settings)
      setGame(createGameFromState(snap.state, snap.secret, randomSeed()))
      setScreen('game')
    }
  }

  async function exitGame() {
    await clearSnapshot()
    setHasSnapshot(false)
    setGame(null)
    setScreen('menu')
  }

  function viewLeaderboard() {
    setGame(null)
    setScreen('leaderboard')
  }

  if (!ready) {
    return <div className="grid min-h-screen place-items-center">กำลังโหลด…</div>
  }

  switch (screen) {
    case 'menu':
      return (
        <MainMenu
          hasSnapshot={hasSnapshot}
          onStart={() => setScreen('setup')}
          onResume={() => void resumeGame()}
          onLeaderboard={() => setScreen('leaderboard')}
          onRules={() => setScreen('rules')}
        />
      )
    case 'setup':
      return (
        <SetupScreen
          initial={settings}
          onStart={startGame}
          onBack={() => setScreen('menu')}
        />
      )
    case 'rules':
      return <RulesScreen onBack={() => setScreen('menu')} />
    case 'leaderboard':
      return <LeaderboardScreen onBack={() => setScreen('menu')} />
    case 'game':
      return game ? (
        <GameProvider handle={game}>
          <Autosave />
          <GameScreen
            onRestart={() => startGame(settings)}
            onExit={exitGame}
            onLeaderboard={viewLeaderboard}
          />
        </GameProvider>
      ) : (
        <div className="grid min-h-screen place-items-center">กำลังโหลด…</div>
      )
  }
}