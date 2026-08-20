# TODO (เดิม) — ทั้งหมดเรียบร้อยแล้ว

รายการ TODO เดิม 18 ข้อ ได้ทำครบทั้งหมดแล้วในรอบ V3
ดูรายละเอียดงานที่ทำและสถานะได้ที่:

- `docs/TASKS-V3.md` — แผนงาน V3 (W1–W9) และสิ่งที่ต้องทำ
- `STATUS.md` (ที่ root) — สถานะล่าสุดของแต่ละ task
- `docs/GAME_SPEC.md` — กติกา/ค่า default ที่เป็นแหล่งความจริงเดียว

สรุปว่างานไหนอยู่ที่ไหน:

- ตั้งค่า popup modal + bar โอกาสระเบิด + สีแยกระเบิดจริง/glitch → **W2**
- เลิกสไลด์ (กรอกเลขได้) + ช่องเดียว "จำนวนช่องทั้งหมด" + ลบเลขได้ไม่ดีดค่า → **W1**
- Shrinking Mode (วงหด) เปลี่ยนชื่อ → **W1/W9**
- ตัวจับเวลาเริ่มทำงาน (นับตั้งแต่ช่วงใช้การ์ด) → **W4**
- จัดหน้าจอเล่นกลางจอ → **W3**
- Scan adapt รัศมี + อธิบายช่วงซ้าย–ขวา + effect/popup ผล → **W6**
- การ์ด: ถือไม่จำกัด, เริ่มต้น 3 ใบ, คว่ำหน้า, ใช้/ทิ้ง, toast สีตอนจั่ว → **W5**
- เสียงใน `sounds/` เอามาใช้จริง (10 ไฟล์ + WebAudio fallback) → **W7**
- เพลง YouTube background + volume → **W8**

---

# บั๊กที่เจอจากรอบเทสเว็บ (2026-08-20)

## แก้แล้วในรอบนี้ ✅

- **B1 — หน้าจอว่างเปล่าตอนกด "เริ่มเกม"** *(บั๊กหลัก / blocker)*
  `<Dialog.Trigger>` ของปุ่ม "⚙ ตั้งค่าเพิ่มเติม" อยู่นอก `<Dialog.Root>` (คนละ subtree)
  Base UI throw `"<Dialog.Trigger> must be used within <Dialog.Root>"` ตอน render
  → SetupScreen crash ทั้งหน้า เห็นเป็นจอว่าง
  **แก้:** เปลี่ยน Dialog เป็น controlled (`open` / `onOpenChange` + state `settingsOpen`)
  แล้วใช้ `<button>` ธรรมดาเป็นตัวเปิดแทน Trigger — `src/components/setup/SetupScreen.tsx`

- **B2 — LogPanel ค้างอยู่ที่ 10 เหตุการณ์แรกตลอดเกม**
  engine push log ต่อท้าย (เก่า→ใหม่) แต่ UI ใช้ `state.log.slice(0, 10)` = เอา 10 อันเก่าสุด
  พอเกิน 10 เหตุการณ์ บันทึกจะไม่อัปเดตอีกเลย (เหตุการณ์อย่าง "หมดเวลา" ไม่เคยโผล่)
  **แก้:** `state.log.slice(-10).reverse()` + เพิ่มเทสกัน regression เรื่อง order ที่ `engine.test.ts`

- **B3 — โหมด "ใช้การ์ด/เปิดป้ายเลย" ไม่รีเซ็ตเมื่อขึ้นตาทีมใหม่**
  `useEffect` depend แค่ `[state.phase]` แต่ phase ค้างเป็น `'cards'` ข้ามตาได้
  → effect ไม่ยิงซ้ำ ทีมถัดไปเลยรับช่วง "เปิดป้ายเลย" ต่อ ใช้การ์ดไม่ได้ทั้งที่ควรได้
  **แก้:** depend `[state.phase, state.turnNumber, state.currentTeamIndex]`

- **B4 — StatusPanel โชว์ค่าดิบ `cards`**
  `phaseLabel()` ไม่มี case `'cards'` เลย fallthrough ไป `default` คืนค่าดิบ
  **แก้:** เพิ่ม `case 'cards': return 'ใช้การ์ด'`

- **B5 — ปุ่มมุมขวาบนทับ StatusPanel**
  toolbar เป็น `fixed top-4 right-4` ทับคอลัมน์ขวาที่ขึ้นต้นด้วย StatusPanel (คำว่า "สถานะ" โดนบัง)
  **แก้:** เพิ่ม `pt-14` ให้ `<aside>` คอลัมน์ขวา

- **B6 — ข้อความซ้ำ "ทีม ทีม 6"**
  DefuseModal เติม prefix `ทีม ` ทับชื่อทีมที่มีคำว่า "ทีม" อยู่แล้ว (ชื่อ default = `ทีม N`)
  **แก้:** ตัด prefix ออกทั้ง 2 จุด — `src/components/defuse/DefuseModal.tsx`

## ยังไม่ได้แก้ — ฝากรอบหน้า 🔧

- **B7 — มือการ์ดล้นจอแนวนอน** *(ความสำคัญ: กลาง)*
  `Hand` เป็น `fixed inset-x-0` + flex แถวเดียว ไม่มี wrap/scroll
  เทสจริงจนมือถึง ~20 ใบ (default = ถือไม่จำกัด) การ์ดล้นออกนอกจอทั้งซ้ายและขวา กดใบท้าย ๆ ไม่ได้
  **เสนอ:** ใส่ `overflow-x-auto` หรือ `flex-wrap` ที่ container ของมือ / หรือย่อขนาดการ์ดอัตโนมัติเมื่อใบเยอะ

- **B8 — กระดาน 200 ช่องสูงมาก ต้องเลื่อนจอเยอะ** *(ความสำคัญ: ต่ำ / UX)*
  Board ใช้ `auto-fill minmax(56px, 1fr)` แต่ถูกบีบด้วย layout `lg:grid-cols-[240px_1fr_300px]`
  ที่ 200 ช่องได้แค่ ~7 คอลัมน์ → หน้ายาวมาก และมือการ์ด (fixed) ไปบังช่องกลางกระดาน
  **เสนอ:** ลด min ของช่องเมื่อจำนวนช่องเยอะ (เช่น 56px → 40px) หรือให้ Board scroll ในกรอบตัวเอง

## หมายเหตุจากการเทส (ไม่ใช่บั๊ก)

- เทสครบ: เมนู → ตั้งค่า → เล่นจนจบเกม → game over → leaderboard → กติกา → เล่นต่อ (resume) → จบเกมกลางคัน
- ระบบที่ยืนยันว่าทำงานถูก: จับเวลา + TIMEOUT สุ่มเปิดช่อง, ตัดสาย (รอด/ตกรอบ), Glitch bomb + นับถอยหลัง turn,
  การ์ด Skip, คว่ำหน้า/เปิด/ใช้/ทิ้ง, พิมพ์เลขเปิดช่อง + auto-open 700ms, snapshot เข้ารหัส + resume,
  leaderboard สะสมข้ามเกม, validation ช่อง < ทีม×4, clamp ค่าเกินขอบ (999 → 200)
- `bun test` ผ่าน 121/121, `tsc --noEmit` ผ่าน, `bun run build` ผ่าน, console ไม่มี error
