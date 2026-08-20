'use client'

import { useState } from 'react'

// คำอธิบายกติกาแบบย่อ — แสดงบนหน้าตั้งค่า (index) กดเพื่อขยาย/หุบ
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
        <div className="mt-4 grid gap-4 text-base leading-7 text-foreground md:grid-cols-2">
          <div>
            <h3 className="section-label mb-1">🎯 เป้าหมาย</h3>
            <p>
              เป็นทีมสุดท้ายที่รอด ทีมที่ตกรอบก่อนได้อันดับท้าย
              (ตายทีหลัง = อันดับดีกว่า)
            </p>

            <h3 className="section-label mt-4 mb-1">🕹 การเล่นใน 1 ตา</h3>
            <ol className="list-decimal space-y-1 pl-5">
              <li>ทีมที่ได้ตาเปิดป้าย 1 ช่อง (ถ้าถูก ⚔ Attack ต้องเปิดเพิ่ม)</li>
              <li>
                ช่องปลอดภัย → ผ่าน{' '}
                <span className="text-emerald-600">✓</span>
              </li>
              <li>
                เจอระเบิดจริง → โหมดตัดสาย เลือกสายแดง/น้ำเงิน
                (โอกาส 50/50 เท่ากันทั้งสองสี)
                <ul className="list-disc pl-5">
                  <li>กู้สำเร็จ → ระเบิดย้ายไปที่อื่น</li>
                  <li>กู้ไม่สำเร็จ → ทีมตกรอบ</li>
                </ul>
              </li>
              <li>
                เจอ Glitch bomb{' '}
                <span className="text-purple-600">⚡</span> → ไม่ตาย แต่ติดกลิตช์
                2 ตา (ใช้/จั่วการ์ดไม่ได้)
              </li>
              <li>จบตาอย่างรอด → จั่วการ์ด 1 ใบ (มือเต็ม 5 จั่วไม่เข้า)</li>
            </ol>
          </div>

          <div>
            <h3 className="section-label mb-1">🃏 การ์ด</h3>
            <ul className="space-y-1">
              <li>🔍 <b>Scan</b> — มีระเบิดในช่วง ±R ไหม (ตอบแค่มี/ไม่มี)</li>
              <li>⏭ <b>Skip</b> — ข้ามตาเลย ไม่ต้องเปิด (ไม่ได้จั่วการ์ด)</li>
              <li>🛡 <b>Block</b> — เป้าหมายใช้การ์ดไม่ได้ในตาถัดไป</li>
              <li>🔄 <b>Reverse</b> — สลับทิศทาง + จบตา</li>
              <li>🎲 <b>Shuffle</b> — สุ่มย้ายตำแหน่งระเบิดทั้งหมด</li>
              <li>⚔ <b>Attack</b> — เป้าหมายต้องเปิดเพิ่ม +1 (โอนกองต่อได้)</li>
            </ul>

            <h3 className="section-label mt-4 mb-1">🏁 จบเกม</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>เหลือ 1 ทีม = ชนะ ทีมที่ตายทีหลังได้อันดับดีกว่า</li>
              <li>ช่องหมดแต่เหลือหลายทีม = เสมอกัน</li>
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}