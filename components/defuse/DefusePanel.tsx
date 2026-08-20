'use client'

import { useGame } from '@/components/game/GameProvider'

// แบบชั่วคราวสำหรับ Task 5 — Task 6 จะแทนด้วย DefuseModal เต็มจอ
export function DefusePanel() {
  const { dispatch } = useGame()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <h2 className="font-serif text-5xl font-bold text-red-600">ตัดสาย!</h2>
      <p className="text-xl text-muted-foreground">ทีมต้องเลือกสายหนึ่งเพื่อกู้ระเบิด</p>
      <div className="flex gap-10">
        <button
          onClick={() => dispatch({ type: 'CHOOSE_WIRE', wire: 'red' })}
          className={
            'grid h-32 w-32 place-items-center rounded-2xl border-4 border-red-600 ' +
            'bg-red-600 text-5xl font-black text-white shadow-lg transition hover:scale-105'
          }
        >
          🔴
        </button>
        <button
          onClick={() => dispatch({ type: 'CHOOSE_WIRE', wire: 'blue' })}
          className={
            'grid h-32 w-32 place-items-center rounded-2xl border-4 border-blue-600 ' +
            'bg-blue-600 text-5xl font-black text-white shadow-lg transition hover:scale-105'
          }
        >
          🔵
        </button>
      </div>
    </div>
  )
}