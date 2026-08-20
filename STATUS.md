# STATUS — Minenumber (V3) — สถานะงานรอบที่ 3

อัปเดตล่าสุด: 2026-08-20

งานอ้างอิง: `docs/TASKS-V3.md` (แปลง TODO.md 18 ข้อ → 9 task W1–W9)
กติกา: `docs/GAME_SPEC.md` | งานเก่า: `docs/TASKS-V2.md` (V1–V8)

---

## สรุปสถานะ

| # | Task | สถานะ | Commit | หมายเหตุ |
|---|------|--------|--------|----------|
| W4 | ซ่อมตัวจับเวลา (TODO 17) | ✅ เสร็จ | `81891a6` | นับถอยหลังตั้งแต่ phase `cards` + timeout ทำงานช่วงคิด |
| W3 | จัดหน้าจอเล่นกลางจอ (TODO 15) | ✅ เสร็จ | `6f1066e` | wrapper `min-h-screen` + `place-content-center` |
| W1 | เลิกสไลด์ + ช่องเดียว + gate toggle + เปลี่ยนชื่อ Shrinking Mode (TODO 13,4,5,12,11) | ✅ เสร็จ | `0be481f` | `type="range"` ใน src = 0 |
| W2 | Popup ตั้งค่า + bar โอกาสโดนระเบิด + ข้อความสุดโต่ง + แยกสีระเบิดจริง/glitch (TODO 1,2,3,10) | ✅ เสร็จ | `45abc66` | Base UI Dialog, verdict thresholds ปรับเป็น 15/30/50% |
| W5 | มือไม่จำกัด + ไพ่คว่ำหน้า + ใช้/ทิ้ง + toast สีตอนจั่ว (TODO 7,9,16,8) | ⏳ ยังไม่เริ่ม | — | **ใหญ่สุด — แตะ engine + types + test หลายจุด** |
| W6 | Scan adapt รัศมี + อธิบาย + effect + popup ผล (TODO 6) | ⏳ ยังไม่เริ่ม | — | รอ W1/W2 (แก้อินพุตเดียวกัน) |
| W7 | ใช้ไฟล์เสียงจริงใน `sounds/` (TODO 18) | ⏳ ยังไม่เริ่ม | — | รอ W5 (hook เหตุการณ์การ์ด) ต้อง `git mv sounds public/sounds` |
| W8 | เพลง YouTube background + volume (TODO 14) | ⏳ ยังไม่เริ่ม | — | รอ W2 (ช่อง URL อยู่ใน modal) ต้องตัดสินใจเรื่อง IFrame API/CSP |
| W9 | อัปเดตเอกสารให้ตรงกับของใหม่ | ⏳ ยังไม่เริ่ม | — | ทำท้ายสุด; ต้อง grep 'โหมดเร่ง' = 0 |

**ผลตรวจ baseline:** `bun test` 96/96 ผ่าน, `bun run tsc --noEmit` clean, `bun run build` สำเร็จ

---

## รายละเอียดที่ทำไปแล้ว

### W4 — ซ่อมตัวจับเวลา
- `TimerCircle.tsx:22` เปลี่ยน `active = phase === 'opening'` → `(phase === 'cards' \|\| phase === 'opening')`
- `engine.ts` `timeout()` รับ phase `'cards'` ด้วย (เดิมคืนทันที → เกมค้าง)
- ใส่คอมเมนต์กำกับเงื่อนไข `turnKey` (`maxTeams < 1000`)
- test ใหม่: TIMEOUT ตอน phase=cards → มีช่องถูกเปิด + ขึ้นตาถัดไป

### W3 — จัดกลางจอ
- ห่อ grid ด้วย `div.min-h-screen.place-content-center` → เนื้อหาอยู่กลางแนวตั้งเมื่อจอสูงเกิน
- กระดานใหญ่ (200 ช่อง) ยัง scroll ได้ปกติ ไม่ตัดเนื้อหา
- เปลี่ยนชื่อโหมดเร่ง → **Shrinking Mode (วงหด)** ทั้ง src/docs/README

### W1 — หน้าตั้งค่า
- เก็บเลขทุกช่องเป็น string → ลบจนว่างได้ ไม่ขึ้น NaN, blur/start ถึงจะ clamp
- ยุบช่อง "จาก/ถึง" เหลือช่องเดียว "จำนวนช่องทั้งหมด" (rangeMin ล็อก 1 ใน `handleStart()`)
- แทนสไลด์ 5 ตัวด้วย `<input type="number">` (component `NumberField` ในไฟล์เดียวกัน)
- กลุ่ม glitch/cards ใช้ `<fieldset disabled>` + จางลงเมื่อ toggle ปิด (scanRadius ผูกกับ cardsEnabled ด้วย)

### W2 — หน้าตั้งค่า (ต่อ)
- กลุ่ม Toggles + ตัวเลขปรับค่าอยู่ใน popup modal (Base UI Dialog) — Esc/ปิด/click backdrop ได้
- เพิ่ม bar โอกาสโดนระเบิด: ระดับสีจาก `verdictFor()` (เกณฑ์เดียวกับ badge) 15/30/50%
- `balance.ts` เพิ่ม `hitChance()` + `chanceDisplay()` (pure function) + test ครบ 3 kind
- แยกสีระเบิดจริง (แดง) / glitch (ม่วง) ในกล่องจำนวนระเบิด + preview (เฉพาะหน้า setup เท่านั้น)
- หมายเหตุ: เกณฑ์ `verdictFor` ถูกปรับจาก 8/20/35% → 15/30/50% ให้ตรงกับสี bar (อัปเดต test แล้ว)

---

## งานที่เหลือ (เรียงตามลำดับที่แนะนำใน TASKS-V3.md)

### W5 — ระบบการ์ด (ใหญ่สุด)
- [ ] `maxHandSize` 0 = ไม่จำกัด (`JSON.stringify(Infinity)` → null ทำ snapshot พัง ห้ามใช้ Infinity)
- [ ] `DEFAULTS.startingHand` 3, `LIMITS.maxStartingHand` 5
- [ ] checkbox "จำกัดจำนวนใบในมือ" ปลดล็อกช่องกรอก
- [ ] ไพ่คว่ำหน้า → เปิดทีละใบ → ใช้/ทิ้ง (`DISCARD_CARD`) → ปิดกลับไม่ได้
- [ ] `lastDraw` ใน `PublicGameState` + เคลียร์เมื่อขึ้นตาใหม่ + toast สี (ย้าย `CARD_COLORS` ไป `lib/game/cards.ts`)
- [ ] `cardsDiscarded` ใน `TeamStats` + โชว์ที่ GameOverScreen
- [ ] อัปเดต invariant มือใน `playthrough.test.ts` (ข้ามเมื่อ maxHandSize===0)

### W6 — Scan
- [ ] `maxScanRadiusFor` / `suggestedScanRadius` + clamp ตอนเริ่มเกม + test
- [ ] อธิบายว่าสแกนแบบซ้าย–ขวา (ช่วง [target−R, target+R]) ใน CARD_DESCRIPTIONS/Rules/GAME_SPEC
- [ ] effect เรืองแสงไล่จากกลาง + popup ผลสแกน (infoDialog) + เคารพ reduced-motion

### W7 — เสียงจริง
- [ ] `git mv sounds public/sounds` (Vite copy เฉพาะ public/)
- [ ] `playFile(name)` ใน sfx.ts + เก็บ WebAudio ไว้เป็น fallback
- [ ] map เสียง 10 ไฟล์ ตามตารางใน TASKS-V3.md §W7.2
- [ ] `sfxVolume` แยกจากเพลง background

### W8 — เพลง YouTube
- **ต้องตัดสินใจก่อน:** ใช้ YouTube IFrame API หรือไม่ (ห้าม download/แปลงไฟล์)
- [ ] `parseYouTubeId()` + test, `musicUrl`/`musicVolume` ใน GameSettings (backward-compatible + test)
- [ ] player ซ่อน + ▶/⏸ + volume + cleanup ตอนออกเกม

### W9 — เอกสาร
- [ ] GAME_SPEC/README/RulesContent/RulesPanel ให้ตรงกับของใหม่
- [ ] `grep -r 'โหมดเร่ง' src docs README.md` = 0 (ยังมีหลงใน docs/TASKS*.md ที่เป็นประวัติเก่า)

---

## หมายเหตุ

- แต่ละ task = 1 commit (กฎเดิม)
- `docs/TASKS-V3.md` มีลำดับ: W4 → W3 → W1 → W2 → W5 → W6 → W7 → W8 → W9
- งานเสี่ยงสุด: W5 (engine/types/test) และ W8 (script ภายนอก + CSP)