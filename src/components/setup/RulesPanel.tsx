
import { useState } from 'react'
import { RulesContent } from '@/components/rules/RulesContent'

// คำอธิบายกติกาแบบย่อ — แสดงบนหน้าตั้งค่า กดเพื่อขยาย/หุบ
export function RulesPanel() {
  const [open, setOpen] = useState(false)

  return (
    <section className="panel mt-6">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-xl font-bold">📖 กติกา / วิธีเล่น</span>
        <span className="text-2xl">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-4">
          <RulesContent />
        </div>
      )}
    </section>
  )
}
