import { useEffect, useState } from 'react'
import { Autosave } from '@/components/game/Autosave'
import { GameProvider } from '@/components/game/GameProvider'
import { GameScreen } from '@/components/game/GameScreen'
import { LeaderboardScreen } from '@/components/leaderboard/LeaderboardScreen'
import { MainMenu } from '@/components/menu/MainMenu'
import { SetupScreen } from '@/components/setup/SetupScreen'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { DisplayModeToggle } from '@/components/ui/DisplayModeToggle'
import { createGame, createGameFromState, type GameHandle } from '@/lib/game/engine'
import { defaultSettings } from '@/lib/game/config'
import { randomSeed } from '@/lib/game/rng'
import { setSfxVolume, unlockAudio } from '@/lib/audio/sfx'
import { clearSnapshot, loadSettings, loadSnapshot, saveSettings } from '@/lib/storage/session'
import type { GameSettings } from '@/lib/game/types'

type Screen = 'menu' | 'setup' | 'leaderboard' | 'game'

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
    setSfxVolume(s.sfxVolume / 100) // FIX_LISTS #9: ระดับเสียง effect จากหน้าตั้งค่า
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
      setSfxVolume((snap.state.settings.sfxVolume ?? 80) / 100)
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

  // FIX #41: ปุ่มสลับธีมต้องอยู่ทุกหน้า — switch ด้านล่าง return ตรงจากทุก branch
  // จึงย้ายเข้า renderScreen() แล้วห่อด้วย fragment ที่นี่ครั้งเดียว
  // FIX_LISTS ชุดใหม่ #2: ปุ่มโหมดจอ (Laptop/TV) + เต็มจอ อยู่แถวเดียวกับปุ่มธีม
  //
  // FIX_LISTS ชุดที่แปด #2: หน้าเล่นเกมไม่ใช้แถบลอยมุมขวาบนแล้ว — ปุ่มทั้งสาม
  //   (ธีม/เต็มจอ/โหมดจอ) ไปอยู่บน top nav bar ระดับเดียวกับระดับเสียงและปุ่มออกห้อง
  //   (GameHeader เรนเดอร์ให้เอง) หน้าอื่นที่ไม่มี header ยังใช้แถบลอยเหมือนเดิม
  //
  // FIX_LISTS ชุดที่สิบเอ็ด #3: หน้าตั้งค่าก็มี top nav เป็นของตัวเองแล้ว (pattern
  //   เดียวกับหน้าเล่นเกม) จึงตัดออกจากแถบลอยด้วย ไม่งั้นปุ่มธีม/โหมดจอจะซ้ำสองชุด
  //
  //   หน้า Leaderboard มี top nav แบบเดียวกันแล้วเช่นกัน — เหลือแค่หน้าเมนูหลัก
  //   หน้าเดียวที่ยังใช้แถบลอย (หน้านั้นเป็นหน้าจัดกลาง ไม่มี header แถวบน)
  return (
    <>
      {renderScreen()}
      {screen === 'menu' && (
        <div className="fixed right-3 top-3 z-50 flex items-center gap-2">
          <ThemeToggle />
          <DisplayModeToggle />
        </div>
      )}
    </>
  )

  function renderScreen() {
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
    case 'leaderboard':
      return <LeaderboardScreen onBack={() => setScreen('menu')} />
    case 'game':
      return game ? (
        <GameProvider handle={game}>
          <Autosave />
          {/* FIX_LISTS #8: จบเกมแล้วกลับไปหน้าหลักทางเดียว */}
          <GameScreen onExit={exitGame} />
        </GameProvider>
      ) : (
        <div className="grid min-h-screen place-items-center">กำลังโหลด…</div>
      )
    }
  }
}