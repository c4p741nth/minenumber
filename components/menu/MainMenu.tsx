'use client'

import { useEffect, useState } from 'react'
import { clearLeaderboard } from '@/lib/storage/leaderboard'
import { clearSnapshot, saveSettings } from '@/lib/storage/session'
import { confirmDialog, infoDialog } from '@/components/ui/alert'
import { defaultSettings } from '@/lib/game/config'

interface Props {
  hasSnapshot: boolean
  onStart: () => void
  onResume: () => void
  onLeaderboard: () => void
  onRules: () => void
}

// หน้าแรกของเกม — มีเมนูนำทางและปุ่มล้างข้อมูล
export function MainMenu({ hasSnapshot, onStart, onResume, onLeaderboard, onRules }: Props) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(true)
  }, [])

  async function clearAll() {
    const ok = await confirmDialog({
      title: 'ล้างข้อมูลทั้งหมด?',
      text: 'เกมค้าง ตั้งค่า และประวัติ leaderboard จะถูกลบทิ้ง',
      confirmText: 'ล้างเลย',
    })
    if (!ok) return
    await clearSnapshot()
    saveSettings(defaultSettings())
    clearLeaderboard()
    void infoDialog({
      title: 'ล้างเรียบร้อย',
      text: 'ข้อมูลทั้งหมดกลับเป็นค่าเริ่มต้นแล้ว',
      icon: 'success',
    })
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-8 px-6 py-12">
      <header className="text-center">
        <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-2xl bg-primary text-5xl font-black text-primary-foreground shadow-[0_0_40px_color-mix(in_srgb,var(--primary)_40%,transparent)]">
          7
        </div>
        <p className="section-label">MEETING GAME</p>
        <h1 className="font-serif text-5xl font-bold">วงระเบิด</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          เกมสุ่มตัวเลขเอาตัวรอดสำหรับเล่นหลายทีมในที่ประชุม
          — เปิดป้ายให้ปลอดภัย เป็นทีมสุดท้ายที่รอด!
        </p>
      </header>

      <nav className="flex w-full flex-col gap-3">
        <button onClick={onStart} className="primary-button w-full py-4 text-xl">
          ▶ เริ่มเกม
        </button>
        {hasSnapshot && ready && (
          <button
            onClick={onResume}
            className="w-full rounded-lg border-2 border-amber-500 bg-amber-100/70 px-4 py-4 text-xl font-black text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
          >
            ⏵ เล่นต่อ
          </button>
        )}
        <button
          onClick={onLeaderboard}
          className="w-full rounded-lg border border-border bg-card px-4 py-4 text-lg font-bold transition hover:border-primary"
        >
          🏆 Leaderboard
        </button>
        <button
          onClick={onRules}
          className="w-full rounded-lg border border-border bg-card px-4 py-4 text-lg font-bold transition hover:border-primary"
        >
          📖 กฎกติกา
        </button>
        <button
          onClick={() => void clearAll()}
          className="w-full rounded-lg border border-destructive/40 bg-card px-4 py-4 text-lg font-bold text-destructive transition hover:border-destructive"
        >
          🗑 ล้างข้อมูล
        </button>
      </nav>
    </div>
  )
}