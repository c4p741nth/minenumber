
import { useEffect, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { RulesContent } from '@/components/rules/RulesContent'
import { clearLeaderboard } from '@/lib/storage/leaderboard'
import { clearSnapshot, saveSettings } from '@/lib/storage/session'
import { confirmDialog, infoDialog } from '@/components/ui/alert'
import { defaultSettings } from '@/lib/game/config'

interface Props {
  hasSnapshot: boolean
  onStart: () => void
  onResume: () => void
  onLeaderboard: () => void
}

// หน้าแรกของเกม — มีเมนูนำทางและปุ่มล้างข้อมูล
export function MainMenu({ hasSnapshot, onStart, onResume, onLeaderboard }: Props) {
  const [ready, setReady] = useState(false)
  // FIX #12: กฎกติกาเป็น modal ในหน้าแรก ไม่เปิดหน้าใหม่
  const [rulesOpen, setRulesOpen] = useState(false)

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
        <div className="brand-mark brand-mark-lg mx-auto mb-5 shadow-[0_0_40px_color-mix(in_srgb,var(--primary)_40%,transparent)]" aria-hidden="true">
          <span className="brand-bomb">💣</span>
          <span className="brand-digits">7</span>
        </div>
        <h1 className="font-serif text-5xl font-bold">Minenumber</h1>
        <p className="section-label mt-1 text-lg">เลขระเบิด</p>
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
          onClick={() => setRulesOpen(true)}
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

      {/* FIX #12: กฎกติกาเป็น modal */}
      <Dialog.Root open={rulesOpen} onOpenChange={setRulesOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/70" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(100%,900px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center gap-3 border-b border-border px-6 py-4">
              <Dialog.Title className="font-serif text-2xl font-bold">📖 กฎกติกา</Dialog.Title>
              <Dialog.Close
                render={
                  <button
                    aria-label="ปิด"
                    className="ml-auto grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-lg font-bold hover:border-primary"
                  />
                }
              >
                ✕
              </Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <RulesContent />
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
