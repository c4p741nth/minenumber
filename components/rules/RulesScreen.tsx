'use client'

import { RulesContent } from '@/components/rules/RulesContent'

interface Props {
  onBack: () => void
}

// หน้ากติกาแบบเต็มหน้า (จากเมนู) — ใช้ RulesContent ตัวเดียวกับ panel พับ
export function RulesScreen({ onBack }: Props) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
      <header className="flex items-center gap-3 pb-6">
        <div className="brand-mark">7</div>
        <div>
          <p className="section-label">MEETING GAME</p>
          <h1 className="font-serif text-3xl font-bold">กฎกติกา</h1>
        </div>
        <button onClick={onBack} className="ml-auto rounded-lg border border-border px-4 py-2 text-base font-bold">
          ← กลับเมนู
        </button>
      </header>

      <section className="panel">
        <RulesContent />
      </section>
    </div>
  )
}