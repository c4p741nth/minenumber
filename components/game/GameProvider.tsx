'use client'

import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import type { GameHandle } from '@/lib/game/engine'
import type { GameAction, PublicGameState } from '@/lib/game/types'

interface GameContextValue {
  state: PublicGameState
  dispatch: (a: GameAction) => void
}

const GameContext = createContext<GameContextValue | null>(null)

// ถือ GameHandle ใน useRef — state ระเบิดไม่อยู่ใน React tree เลย
export function GameProvider({ handle, children }: { handle: GameHandle; children: ReactNode }) {
  const handleRef = useRef(handle)
  const [state, setState] = useState<PublicGameState>(() => handleRef.current.getState())

  const dispatch = (action: GameAction) => {
    setState(handleRef.current.dispatch(action))
  }

  return <GameContext.Provider value={{ state, dispatch }}>{children}</GameContext.Provider>
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used within GameProvider')
  return ctx
}