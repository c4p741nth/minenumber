'use client'

interface Props {
  onResume: () => void
  onNewGame: () => void
}

export function ResumePrompt({ onResume, onNewGame }: Props) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6">
      <div className="w-full max-w-md rounded-2xl border-2 border-primary bg-card p-8 text-center shadow-2xl">
        <h2 className="font-serif text-4xl font-bold">มีเกมค้างอยู่</h2>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          พบเกมที่ยังไม่จบจากครั้งก่อน — จะเล่นเกมเดิมต่อ หรือเริ่มเกมใหม่?
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button onClick={onResume} className="primary-button text-lg">
            เล่นเกมเดิมต่อ
          </button>
          <button
            onClick={onNewGame}
            className="rounded-lg border border-border bg-background px-4 py-3 text-lg font-bold"
          >
            เริ่มใหม่
          </button>
        </div>
      </div>
    </div>
  )
}