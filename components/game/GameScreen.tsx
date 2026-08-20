'use client'

import { useEffect, useState } from 'react'
import { Board } from '@/components/board/Board'
import { TimerCircle } from '@/components/board/TimerCircle'
import { Hand } from '@/components/cards/Hand'
import { DefuseModal } from '@/components/defuse/DefuseModal'
import { GameEffects } from '@/components/effects/GameEffects'
import { MuteButton } from '@/components/effects/MuteButton'
import { GameOverScreen } from '@/components/gameover/GameOverScreen'
import { useGame } from './GameProvider'

interface Props {
  onRestart: () => void
  onExit: () => void
}

export function GameScreen({ onRestart, onExit }: Props) {
  const { state, dispatch } = useGame()
  const current = state.teams[state.currentTeamIndex]
  const [typed, setTyped] = useState('')

  // พิมพ์ตัวเลขตรง ๆ เพื่อเลือกช่อง (MC พิมพ์เร็วกว่าคลิก) + Esc ยกเลิก
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (state.phase !== 'opening' && state.phase !== 'cards') return
      if (/^\d$/.test(e.key)) {
        setTyped((prev) => (prev + e.key).slice(0, 3))
      } else if (e.key === 'Enter' && typed !== '') {
        dispatch({ type: 'OPEN_CELL', cell: Number(typed) })
        setTyped('')
      } else if (e.key === 'Backspace') {
        setTyped((prev) => prev.slice(0, -1))
      } else if (e.key === 'Escape') {
        setTyped('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.phase, typed, dispatch])

  // พิมพ์ทิ้งไว้เกิน 700ms → เปิดให้อัตโนมัติ
  useEffect(() => {
    if (typed === '') return
    const t = window.setTimeout(() => {
      dispatch({ type: 'OPEN_CELL', cell: Number(typed) })
      setTyped('')
    }, 700)
    return () => window.clearTimeout(t)
  }, [typed, dispatch])

  function endGame() {
    if (window.confirm('จบเกมนี้เลย? (เกมจะถูกบันทึกเป็นจบเกมและกลับหน้าตั้งค่า)')) {
      onExit()
    }
  }

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-375 gap-4 p-4 pb-44 lg:grid-cols-[240px_1fr_300px]">
      <TeamList />
      <main className="flex flex-col gap-3">
        <CurrentTeamBanner />
        <Board
          rangeMin={state.rangeMin}
          rangeMax={state.rangeMax}
          cells={state.cells}
          disabled={state.phase !== 'opening'}
          onOpen={(cell) => dispatch({ type: 'OPEN_CELL', cell })}
        />
        {current.pendingOpens > 1 && (
          <div
            className={
              'rounded-xl border-2 border-amber-500 bg-amber-100 p-3 text-center ' +
              'text-lg font-bold text-amber-900 dark:bg-amber-900/50 dark:text-amber-100'
            }
          >
            ⚔ {current.name} ต้องเปิดอีก {current.pendingOpens} ป้าย
          </div>
        )}
      </main>
      <aside className="flex flex-col gap-3">
        <StatusPanel />
        <LogPanel />
      </aside>
      {state.phase === 'defusing' && <DefuseModal />}
      {state.phase === 'gameover' && <GameOverScreen onRestart={onRestart} onExit={onExit} />}
      <Hand />
      <div className="fixed top-4 right-4 z-30 flex items-center gap-2">
        <button
          onClick={endGame}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-destructive shadow"
        >
          จบเกมนี้
        </button>
        <MuteButton />
      </div>
      {typed !== '' && state.phase !== 'gameover' && (
        <div
          className={
            'fixed bottom-40 left-1/2 z-30 -translate-x-1/2 rounded-xl border-2 border-primary ' +
            'bg-card px-4 py-2 font-mono text-3xl font-black shadow-2xl'
          }
        >
          {typed}
        </div>
      )}
      <GameEffects />
    </div>
  )
}

function CurrentTeamBanner() {
  const { state, dispatch } = useGame()
  const current = state.teams[state.currentTeamIndex]
  return (
    <div
      className={
        'flex items-center gap-4 rounded-2xl border-2 border-primary bg-card p-4 ' +
        'shadow-[0_0_24px_color-mix(in_srgb,var(--primary)_35%,transparent)]'
      }
    >
      <div className="flex items-center gap-3">
        <span className="pulse-dot" />
        <span className="section-label">ตาปัจจุบัน</span>
      </div>
      <h2 className="font-serif text-4xl font-bold">{current.name}</h2>
      <span className="ml-auto text-muted-foreground">
        {state.direction === 1 ? '→' : '←'} รอบ {state.turnNumber}
      </span>
      <TimerCircle
        duration={state.settings.turnSeconds}
        phase={state.phase}
        turnKey={state.turnNumber * 1000 + state.currentTeamIndex}
        onTimeout={() => dispatch({ type: 'TIMEOUT' })}
      />
    </div>
  )
}

function TeamList() {
  const { state } = useGame()
  const currentIdx = state.currentTeamIndex
  return (
    <aside className="panel flex h-max flex-col gap-1">
      <h3 className="section-label mb-2">ทีม</h3>
      {state.teams.map((t, i) => (
        <div
          key={t.id}
          className={
            'flex items-center gap-2 rounded-lg px-3 py-2 ' +
            (i === currentIdx && state.phase !== 'gameover'
              ? 'border-2 border-primary bg-primary/10 font-bold'
              : t.alive
                ? 'bg-background'
                : 'opacity-40 line-through')
          }
        >
          <span className="min-w-0 flex-1 truncate text-base">{t.name}</span>
          {t.glitchTurnsLeft > 0 && (
            <span
              className="rounded-full bg-purple-600 px-2 py-0.5 text-xs font-bold text-white"
              title="ติด glitch"
            >
              ⚡{t.glitchTurnsLeft}
            </span>
          )}
          {t.blockedTurnsLeft > 0 && (
            <span
              className="rounded-full bg-slate-500 px-2 py-0.5 text-xs font-bold text-white"
              title="โดนบล็อก"
            >
              🛡{t.blockedTurnsLeft}
            </span>
          )}
          {t.pendingOpens > 1 && (
            <span
              className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white"
              title="ต้องเปิดหลายป้าย"
            >
              ⚔{t.pendingOpens}
            </span>
          )}
        </div>
      ))}
    </aside>
  )
}

function StatusPanel() {
  const { state } = useGame()
  return (
    <div className="panel flex items-center justify-between gap-2">
      <div className="text-center">
        <p className="section-label">ระเบิดเหลือ</p>
        <p className="font-mono text-3xl font-black text-destructive">{state.bombsRemaining}</p>
      </div>
      <div className="text-center">
        <p className="section-label">สถานะ</p>
        <p className="text-lg font-bold">{phaseLabel(state.phase)}</p>
      </div>
    </div>
  )
}

function LogPanel() {
  const { state } = useGame()
  const latest = state.log.slice(0, 10)
  return (
    <div className="panel flex h-max flex-col gap-1">
      <h3 className="section-label mb-1">บันทึก</h3>
      {latest.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีเหตุการณ์</p>}
      {latest.map((l) => (
        <p key={l.id} className="border-b border-border py-1.5 text-sm leading-5 last:border-0">
          {l.message}
        </p>
      ))}
    </div>
  )
}

function phaseLabel(p: string): string {
  switch (p) {
    case 'opening':
      return 'เปิดป้าย'
    case 'defusing':
      return 'ตัดสาย'
    case 'gameover':
      return 'จบเกม'
    default:
      return p
  }
}