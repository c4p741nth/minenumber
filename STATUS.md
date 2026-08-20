# STATUS — Minenumber (V4) — รอบแก้ตาม FIX_LISTS.md

อัปเดตล่าสุด: 2026-08-21

งานรอบนี้: `FIX_LISTS.md` (41 ข้อ) — แบ่งเป็น 4 เฟส
งานรอบก่อน (V3): ดูหัวข้อ "รอบ V3" ด้านล่าง

---

## สรุปรอบ V4 (FIX_LISTS.md)

**ผลตรวจล่าสุด:** `bun test` 152/152 ผ่าน · `npx tsc --noEmit` clean · `bun run build` สำเร็จ

| เฟส | ขอบเขต | สถานะ | Commit |
|-----|--------|-------|--------|
| 1 | หน้าตั้งค่า / config (ข้อ 1–11, 13, 14) | ✅ เสร็จ | `342d293` |
| 2 | กติกาเกม / engine (ข้อ 18, 22–25, 35, 37, 40) | ✅ เสร็จ | `342d293` |
| 3 | UI ตอนเล่นเกม (ข้อ 15–21, 26–34) | ✅ เสร็จ | `758fac3` |
| 4 | ธีม / leaderboard (ข้อ 36, 38, 41) | ⏳ **ยังไม่เสร็จ** | — |
| 5 | ข้อที่เพิ่มมาทีหลัง (ข้อ 42–44) | ⏳ **ยังไม่เสร็จ** | — |

> ⚠️ `FIX_LISTS.md` มี **44 ข้อ** ไม่ใช่ 41 — ข้อ 42–44 ถูกเพิ่มเข้ามาระหว่างทำงาน
> จึงยังไม่ได้แตะเลย ดูรายละเอียดหัวข้อ "เฟส 5" ด้านล่าง

### การตัดสินใจที่ผู้ใช้เลือกไว้ (สำคัญ — ใช้ต่อในเฟส 4)

1. **ข้อ 40 โควตาระเบิด** → เลือก "ล็อกกับทีมที่ยังรอด"
   ระเบิดจริง = จำนวนทีมที่ยังไม่ตกรอบ − 1 (ลดอัตโนมัติเมื่อทีมตกรอบ) เกมจึงจบพอดี
2. **ข้อ 24/25 การ์ด** → เลือก "เพิ่ม Shield + เปลี่ยนหน้าที่ Block"
   สำรับกลายเป็น 7 ใบ: Scan / Skip / Shield / Block / Reverse / Shuffle / Attack
3. **ข้อ 41 ธีม** → เลือก **Dark tactical**
   พื้นหลัง `#0d1117` เข้ม · เส้น/กรอบเขียว phosphor `#2ee66b` · เตือนภัยส้ม/แดง `#ff5c33` · ตัวเลข monospace แบบจอ LED
4. **รูปแบบส่งงาน** → แบ่งเป็นเฟส รายงานทีละเฟส

---

## ⏳ เฟส 4 — งานที่เหลือ (ทำต่อจากตรงนี้)

### ข้อ 41 — ธีมเว็บแนวกู้ระเบิด (Dark tactical) ← งานหลักที่เหลือ
ไฟล์: `src/globals.css` (ตัวแปรสีอยู่บรรทัด ~11–12), `index.html` (`theme-color`)
- ตอนนี้ยังเป็นโทนครีม/ส้มสว่างของเดิม (`--background: #f5f3ee`)
- ต้องเปลี่ยน `:root` เป็นโทนเข้มตามที่เลือกไว้ (ดูตารางด้านบน)
- ระวัง: `--confirm` / `--cancel` (FIX #13) และ `.brand-mark`, `.cell-picked`,
  `.cell-gave-card`, `.hand-dock` ที่เพิ่มใหม่ ต้องยังอ่านออกบนพื้นเข้ม
- `.dark` block มีอยู่แล้ว — ถ้าธีมหลักเป็นเข้ม อาจยุบสองชุดให้เหลือชุดเดียว

### ข้อ 36 — Leaderboard ดู log เกมที่ผ่านมาได้
ไฟล์: `src/lib/storage/leaderboard.ts`, `src/components/leaderboard/LeaderboardScreen.tsx`
- ต้องเก็บ log ของแต่ละเกม + เวลาเริ่ม/เวลาจบ ลง localStorage
- `MatchRecord` ปัจจุบันมีแค่ `playedAt` — ต้องเพิ่ม `startedAt`, `endedAt`, `log[]`
- แสดงเป็น list เกม กดดูแล้วเห็นว่าเกิดอะไรขึ้นบ้าง
- **หมายเหตุ:** `LogEntry` มี `at` (timestamp) และ `level` (สี) พร้อมใช้แล้วจาก FIX #33
  และมี helper `logClass()` / `logTime()` export อยู่ใน `GameScreen.tsx`

### ข้อ 38 — สีอันดับ ทอง/เงิน/ทองแดง
ไฟล์: `src/components/leaderboard/LeaderboardScreen.tsx`, `src/components/game/GameScreen.tsx` (TeamList)
- ทั้งใน leaderboard และขณะเล่น (แถบ background ของทีม)
- เงื่อนไขพิเศษที่ผู้ใช้ระบุ: ใส่สีที่ **อันดับ 3 ก่อน** แล้วค่อยโชว์อันดับ 1–2 พร้อมกันตอนเกมจบ
  (เพราะอันดับ 1–2 รู้ผลพร้อมกันตอนจบเกมพอดี)

### ข้อ 39 — ปุ่มล้าง Leaderboard ไว้ขวามือ
- ✅ ทำไปแล้วในเฟส 1 (`self-start` → `self-end`) — เหลือแค่ยืนยันตอนทำธีมใหม่

### ข้อ 12 — กฎกติกาเป็น modal หน้าแรก
- ✅ ทำไปแล้วในเฟส 1 (`MainMenu` มี `Dialog` + `RulesContent`, ลบ `RulesScreen.tsx` ทิ้ง)

---

## ⏳ เฟส 5 — ข้อที่เพิ่มมาทีหลัง (42–44) ยังไม่ได้เริ่ม

### ข้อ 42 — "ได้การ์ด 1 ใบ" ไม่ต้องทำสีกรอบ
ไฟล์: `src/components/effects/GameEffects.tsx`
- ตอนนี้ toast "ได้การ์ด 1 ใบ" ใช้ `CARD_COLORS[drawToast]` เป็นสีกรอบ
  → **เป็นข้อมูลรั่ว** ทีมอื่นเดาได้ว่าจั่วการ์ดอะไรจากสีกรอบ
- ต้องเปลี่ยนเป็นสีกลาง ๆ (ไม่ผูกกับชนิดการ์ด)
- ดูตัวแปร `drawToast` และ `CARD_COLORS` ที่ import มา

### ข้อ 43 — การ์ด Block มองเห็นได้ ไม่บังคับใช้/ทิ้ง
ไฟล์: `src/components/cards/Hand.tsx`
- ตอนนี้ไพ่ในมือ **คว่ำหน้าทั้งหมด** เปิดแล้วต้องเลือก ใช้ หรือ ทิ้ง (ปิดกลับไม่ได้)
- ข้อนี้ขอให้ **Block เป็นข้อยกเว้น**: เห็นหน้าไพ่ได้เลย และเลือกจะเก็บไว้ก่อนก็ได้
  (ไม่บังคับใช้/ทิ้ง) ส่วนการ์ดอื่นยังคว่ำหน้าเหมือนเดิม
- เข้ากันได้ดีกับ FIX #25 (Block เป็นการ์ดตั้งรับ เก็บเป็น charge อยู่แล้ว)

### ข้อ 44 — กดปุ่มจบเกม → แสดง Leaderboard ทันที + log ว่ายุติโดยผู้ใช้
ไฟล์: `src/components/game/GameScreen.tsx` (`endGame`), `src/App.tsx` (`exitGame`)
- ตอนนี้กด "ออกจากห้อง" → `confirmDialog` แล้ว `onExit()` → กลับหน้าเมนู **ไม่บันทึกผล**
- ต้องเปลี่ยนเป็น: จบเกมเหมือนเล่นจบปกติ → บันทึกลง leaderboard → แสดงหน้า Leaderboard
- log ต้องระบุว่า "ยุติเกมโดยผู้ใช้" (ใช้ `level` ที่มีอยู่แล้วได้)
- น่าจะต้องเพิ่ม action เช่น `END_GAME` ใน engine เพื่อ set `phase = 'gameover'`
  แล้วให้ `GameOverScreen` ทำงานตามปกติ (มันบันทึก `appendMatch` ให้อยู่แล้ว)
- เกี่ยวโยงกับข้อ 36 (เก็บ log เกมลง leaderboard) — ทำคู่กันจะง่ายกว่า

---

## ✅ เฟส 1 — หน้าตั้งค่า / config (commit `342d293`)

| ข้อ | สิ่งที่แก้ | ไฟล์หลัก |
|-----|-----------|----------|
| 1 | ปุ่มค่าแนะนำเหลือแค่เลขช่อง (`ใช้ค่าแนะนำ 36`) | `SetupScreen.tsx` |
| 2 | เอาลิมิต 1–200 ออก (`maxRange: 9999`) + ตัดคำอธิบายเลขเริ่มต้น | `config.ts`, `SetupScreen.tsx` |
| 3 | ช่องขั้นต่ำ = จำนวนทีม เพิ่มได้ไม่จำกัด | `config.ts` (`minCellsFor`) |
| 4 | เลิกใช้สูตร `ทีม × 4` (ไม่มีที่มา) → `minCellsPerTeam: 1` | `config.ts`, `balance.ts` |
| 5 | เปลี่ยนชื่อเป็น **Minenumber / เลขระเบิด** | menu, setup, leaderboard, `index.html` |
| 6 | ปุ่มปิด modal ไปมุมขวาบน | `SetupScreen.tsx` |
| 7 | toggle ปิด → ตั้งค่าหุบหายเลย + slider เสียง (ลาก/ลูกกลิ้งเมาส์/กรอกเลข) | `SetupScreen.tsx` (`VolumeField`) |
| 8 | ตั้งค่าเป็น **sidebar 4 หมวด** (ระเบิด/การ์ด/การเล่น/เสียง) | `SetupScreen.tsx` (`SETTINGS_TABS`) |
| 9 | จำนวนทีมขั้นต่ำ 2 ไม่จำกัดสูงสุด (`maxTeams: 999`) | `config.ts` |
| 10 | เอา "MEETING GAME" + เลข 7 + กรอบเทา "x ช่อง" + แถบ preview ออก | `SetupScreen.tsx` |
| 11 | "จำนวนระเบิด" → **รายละเอียดห้อง** (ระเบิดจริง/glitch/การ์ดในสำรับ) | `SetupScreen.tsx` (`RoomStat`) |
| 13 | ปุ่มยืนยันเขียว ปุ่มยกเลิกอ่านออก (`--confirm`/`--cancel`) | `ui/alert.ts`, `globals.css` |
| 14 | icon เป็นระเบิด 💣 + ชุดตัวเลข | `SetupScreen.tsx` (`BombMark`), `globals.css` |

---

## ✅ เฟส 2 — กติกาเกม / engine (commit `342d293`)

| ข้อ | สิ่งที่แก้ |
|-----|-----------|
| 18 | หมดเวลา = **เสีย turn** ไม่สุ่มเปิดให้อัตโนมัติ + กรรมการย้อนทีมได้ (`UNDO_TURN`) |
| 22 | ติด glitch → ใช้ item ไม่ได้ (guard เดิมมีอยู่แล้ว + เพิ่มเทสคุม) |
| 23 | Attack ใช้กับทีมตัวเองไม่ได้ (engine guard + ซ่อนปุ่มทีมตัวเองใน `Hand`) |
| 24 | **การ์ดใหม่ Shield** — ใช้กับตัวเองเท่านั้น เหยียบระเบิดแล้วรอดทันที ไม่ต้องตัดสาย ระเบิดย้ายช่อง |
| 25 | **Block เปลี่ยนเป็นการ์ดตั้งรับ** — เก็บเป็น charge, โดน effect แล้วมี popup ถาม (ไม่เผยว่าเป็นการ์ดอะไร) |
| 35 | 🐛 **บั๊กจริง** — ระเบิดหายระหว่างเล่น |
| 37 | คะแนนลดหลั่นตามจำนวนทีม (8 ทีม → ที่ 1 ได้ 7 แต้ม, ทีมสุดท้าย 0) |
| 40 | ระเบิดจริง = ทีมที่รอด − 1 เสมอ, glitch ไม่นับรวม, ระเบิดปกติไม่ mutate เป็น glitch |

### 🐛 รายละเอียดบั๊กข้อ 35 (สำคัญ — เป็นบั๊กจริงที่ผู้ใช้เจอ)
เดิม `engine.ts` **ลบระเบิดทิ้ง** 2 จุด ทำให้ระเบิดในกระดานลดลงเรื่อย ๆ ระหว่างเล่น:
1. เปิดโดน glitch → `bombs.delete(cell)` เฉย ๆ (ไม่ย้าย)
2. กู้สำเร็จตอนไม่มีช่องว่าง → ทำลายระเบิดจริงถาวร

**แก้เป็น:** `relocateBomb()` ย้ายไปช่องที่ยังไม่เปิดจริง ๆ + `enforceRealBombQuota()`
บังคับโควตาทุกครั้งที่จบ turn ถ้าช่องว่างไม่พอแต่ยังมี glitch จองที่อยู่ →
**ให้ระเบิดจริงแทนที่ glitch** (glitch เป็นส่วนเกิน ไม่ควรกันที่จนโควตาไม่ครบ)

**เทสคุม:** `playthrough.test.ts` → `describe('FIX #35/#40 ...')` 3 เทส ครอบคลุม 27 seed
เช็กทุก dispatch ว่า `ระเบิดจริง === ทีมรอด − 1`

---

## ✅ เฟส 3 — UI ตอนเล่นเกม (commit `758fac3`)

| ข้อ | สิ่งที่แก้ |
|-----|-----------|
| 15 | มาร์กช่องที่เปิดแล้วได้การ์ด (`cardCells` ใน state + ขอบเหลือง + 🃏) |
| 16 | ปุ่มยืนยันกันลั่นกดผิดช่อง + panel ขวา sticky + พิมพ์เลขต้องกด Enter (ตัด auto-open 700ms) |
| 17 | เอาเมนู "ตานี้จะทำอะไร?" ออก → "ทีม X กรุณาเลือกแผ่นป้ายหรือใช้ item" |
| 18 | ปุ่ม pause เวลา + ปุ่ม "↩ ย้อนทีม" ให้กรรมการ |
| 19 | ชื่อเกมอยู่หัวเว็บตอนเล่น (`GameHeader`) |
| 20 | ที่เก็บการ์ดใหม่ — หัวแถบบอกจำนวน + ปุ่มหุบเก็บ กันรกจอ |
| 21 | ปุ่มจบเกมเป็น **icon ประตูออก** (`ExitIcon`) |
| 26 | layout คงที่ ไม่ดิ้น — เลิกใช้ `place-content-center` |
| 27 | นับถอยหลังตอนตัดสาย + เสียง tick (ตั้งค่าได้ `defuseSeconds`, 0 = ไม่จับเวลา) |
| 28 | แสดงโอกาสโดนระเบิดระหว่างเล่น (แถบสีใน `StatusPanel`) |
| 29 | 🐛 แก้เสียงระเบิดดัง **2 ครั้ง** — `DefuseModal` เล่น `defuseFailed` ซ้อนกับ `explosion` จาก `GameEffects` |
| 30 | บอกทิศทางเกม (→ ตามลำดับ / ← ย้อนกลับ) + ทีมถัดไป |
| 31 | log "ทีม X **กู้ระเบิดพลาด ถูกคัดออก**" สีแดง (`level: 'danger'`) |
| 32 | log "ทีม X **เจอระเบิด ต้องตัดสาย**" สีเหลือง (`level: 'warn'`) |
| 33 | log มี timestamp ทุกบรรทัด (`at` + `logTime()`) |
| 34 | กันขอบขาวโผล่ตอนจอสั่นเวลาระเบิด (`inset: -40px` + `overflow-x: hidden`) |

**เทสใหม่:** `src/components/game/GameScreen.render.test.tsx` (7 เทส)
กัน layout rewrite crash แบบบั๊ก B1 เดิม (เทส logic ผ่านหมดแต่จอว่างเปล่า)

---

## หมายเหตุทางเทคนิคที่ควรรู้ก่อนทำต่อ

- **การ์ดเพิ่มเป็น 7 ใบ** — ถ้าแก้ `CARD_WEIGHTS` ใน `config.ts` ต้องรวมได้ 100
- **`Phase` เพิ่ม `'blocking'`** — ถ้าเขียนลูปสุ่มเล่น (เทส/สคริปต์) **ต้องจัดการ phase นี้**
  ไม่งั้นเกมค้าง (เคยทำให้เทส smoke flaky มาแล้ว)
- **`GameSettings` เพิ่ม `defuseSeconds`** — fixture ในเทสทุกไฟล์ต้องมีฟิลด์นี้
- **`PublicGameState` เพิ่ม `cardCells`, `pendingBlock`** และ `Team` เพิ่ม
  `shieldCharges`, `blockCharges` — snapshot เก่า default เป็น 0/{} ให้แล้วใน engine
- **`BombMark`, `MusicSettings`, `VolumeField` export จาก `SetupScreen.tsx`** — ใช้ซ้ำได้
- ลบ `src/components/rules/RulesScreen.tsx` ทิ้งแล้ว (กติกาเป็น modal)

---
---

# รอบ V3 (เก่า)

## สรุปสถานะ

| # | Task | สถานะ | Commit | หมายเหตุ |
|---|------|--------|--------|----------|
| W4 | ซ่อมตัวจับเวลา (TODO 17) | ✅ เสร็จ | `81891a6` | นับถอยหลังตั้งแต่ phase `cards` + timeout ทำงานช่วงคิด |
| W3 | จัดหน้าจอเล่นกลางจอ (TODO 15) | ✅ เสร็จ | `6f1066e` | wrapper `min-h-screen` + `place-content-center` |
| W1 | เลิกสไลด์ + ช่องเดียว + gate toggle + เปลี่ยนชื่อ Shrinking Mode (TODO 13,4,5,12,11) | ✅ เสร็จ | `0be481f` | `type="range"` ใน src = 0 |
| W2 | Popup ตั้งค่า + bar โอกาสโดนระเบิด + ข้อความสุดโต่ง + แยกสีระเบิดจริง/glitch (TODO 1,2,3,10) | ✅ เสร็จ | `45abc66` | Base UI Dialog, verdict thresholds ปรับเป็น 15/30/50% |
| W5 | มือไม่จำกัด + ไพ่คว่ำหน้า + ใช้/ทิ้ง + toast สีตอนจั่ว (TODO 7,9,16,8) | ✅ เสร็จ | `e498481` | `maxHandSize=0`=ไม่จำกัด, default 3 ใบ, `DISCARD_CARD`, toast อ่านจาก log |
| W6 | Scan adapt รัศมี + อธิบาย + effect + popup ผล (TODO 6) | ✅ เสร็จ | `9fb73b3` | `maxScanRadiusFor`/`suggestedScanRadius` + clamp ตอนเริ่มเกม, `cell-scan` animation, popup ผ่าน `infoDialog` |
| W7 | ใช้ไฟล์เสียงจริงใน `sounds/` (TODO 18) | ✅ เสร็จ | — | hook ครบทุกเหตุการณ์, `defuseFailedFallback` แยกจาก success, mute คุมทั้งสองทาง, 10 ไฟล์ใน dist |
| W8 | เพลง YouTube background + volume (TODO 14) | ✅ เสร็จ | — | IFrame API (ไม่มี CSP ปิดกั้น), `parseYouTubeId`, backward-compatible settings, cleanup ตอนออกเกม |
| W9 | อัปเดตเอกสารให้ตรงกับของใหม่ | ✅ เสร็จ | — | GAME_SPEC/README/RulesContent/TODO.md อัปเดต, `โหมดเร่ง` ในไฟล์ใช้งาน = 0 |

**ผลตรวจ baseline:** `bun test` 120/120 ผ่าน, `bun run tsc --noEmit` clean, `bun run build` สำเร็จ (10 ไฟล์เสียงใน `dist/sounds/`)

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

### W5 — ระบบการ์ด (ใหญ่สุด)
- `maxHandSize` 0 = ไม่จำกัด (ใช้ `0` ไม่ใช่ `Infinity` — กัน `JSON.stringify` พัง) + checkbox "จำกัดจำนวนใบในมือ"
- `DEFAULTS.startingHand` 3, `LIMITS.maxStartingHand` 5, `DEFAULTS.maxHandSize` 0
- ไพ่ในมือคว่ำหน้า (หลังไพ่ + `#index`) — กดเปิดทีละใบ → เลือก ใช้/ทิ้ง → เปิดแล้วปิดกลับไม่ได้ (กันเปิดซ้อนด้วย)
- action ใหม่ `DISCARD_CARD { index }` — เฉพาะ phase cards + ไม่ติด glitch/block, ทิ้งไม่จบตา ไม่ได้จั่วชดเชย, log บอกชื่อการ์ด
- `TeamStats.cardsDiscarded` + โชว์ที่ GameOverScreen
- `lastDraw` ตั้งตอนจั่วตอนจบตา + เคลียร์ใน `advanceToNext` (กันทีมถัดไปเห็น) — toast สีจาก **log kind='draw'** (เพราะ lastDraw เคลียร์ใน dispatch เดียวกัน UI เห็นเป็น null)
- ย้าย `CARD_COLORS` ไป `lib/game/cards.ts` ใช้ร่วม Hand + toast
- `PLAY_CARD` เพิ่ม field `index?` (ระบุใบที่เปิดอยู่ — backward compatible)
- tests: จั่วเกิน 7 ได้, discard (ปกติ/glitch/block), lastDraw เคลียร์ + มี log, playthrough เพิ่ม discard 30%

### W6 — Scan
- `config.ts`: `maxScanRadiusFor` (10% ของกระดาน, cap 20) + `suggestedScanRadius` (5%) + test
- clamp `scanRadius` ตอน `createGame` กัน settings เก่าใน localStorage
- อธิบาย Scan ว่าเป็นช่วงเลขซ้าย–ขวา (เลือก 20 รัศมี 3 = ตรวจ 17–23) ใน CARD_DESCRIPTIONS/Rules
- `Board` รับ prop `scanning: { center, radius } | null` → ช่องในช่วงเรืองแสงไล่จากกลางออกข้าง (class `.cell-scan` + animation-delay) เคารพ reduced-motion
- popup ผลสแกนผ่าน `infoDialog()` หลัง animation (~2.2 วิ): "⚠ มีระเบิดอยู่ใกล้ ๆ!" แดง / "✓ ไม่มีระเบิดอยู่ใกล้ ๆ" เขียว + บอกช่วง `ตรวจ 17–23`
- `CardResult.scan` เพิ่ม field `center` (engine เท่านั้น, UI รับแค่ center/radius + ผล boolean — ห้ามรู้ตำแหน่งระเบิด)
- setup: max ของช่องกรอก = `maxScanRadiusFor(cells)` + ปุ่ม "ใช้ค่าแนะนำ" + แสดงจำนวนช่องที่ครอบ (2R+1)
- หมายเหตุ: session.test เปรียบเทียบ settings กับ `h.getState().settings` (เพราะ createGame clamp scanRadius)

### W7 — ไฟล์เสียงจริง
- `git mv sounds public/sounds` (Vite copy เฉพาะ public/)
- `sfx.ts` ใหม่: `playFile(name)` preload + cloneNode + `sfxVolume` (localStorage `mn.sfxVolume`) + WebAudio เป็น fallback ถ้าไฟล์ 404/offline
- hook ครบทุกเหตุการณ์:
  - `GameEffects`: ทีมตกรอบ → `explosion` (bomb-hit) + red flash; จั่วการ์ดได้ (log kind='draw') → `gotItem`; ช่วงหด (rangeMin/Max เปลี่ยน) → `secureBlock`
  - `DefuseModal`: เฉลยว่าพลาด → `defuseFailed` (defuse-success เฉพาะกู้สำเร็จ) — เสียง bomb-hit ตามหลังตอนทีมตกรอบจริง กันเสียงซ้อน
  - `Hand`: เปิดหน้าไพ่ → `selectItem`; กดการ์ดตอนใช้ไม่ได้ → `itemUnavailable` (การ์ดยังคลิกได้เพื่อให้เสียงดัง แต่ทำอะไรไม่ได้)
- `defuseFailedFallback()` ใหม่ (เสียงต่ำลง) — เดิมใช้ fallback ของ defuseSuccess (เสียงดีดขึ้น) ผิด
- verify: `setMuted()` คุมทั้งไฟล์ (`playFile` return false) และ WebAudio (`tone`/`noise` return) — ตรวจแล้ว
- verify: `public/sounds/` มีครบ 10 ไฟล์ + อยู่ใน `dist/sounds/` หลัง `bun run build`

### W8 — เพลง YouTube background
- **ตัดสินใจ:** ใช้ YouTube IFrame Player API ฝัง player ซ่อน (ขนาด 0) — ห้าม download/แปลงไฟล์
- ใหม่ `src/lib/audio/music.ts`: `parseYouTubeId()` (watch?v= / youtu.be / playlist?list= / shorts / youtube-nocookie / ID 11 ตัว / input ขยะ → null) + `isPlaylistId()` + `youtubeEmbedUrl()` — test 12 ข้อ
- `GameSettings` เพิ่ม `musicUrl` (default `''`) + `musicVolume` (default 30, 0–100) — `loadSettings()` merge กับ `defaultSettings()` → settings เก่าไม่ crash (มี test)
- ใหม่ `MusicPlayer.tsx`: โหลด IFrame API ครั้งเดียว (module-level promise + timeout 8 วิ), ฝัง player ซ่อน, ▶/⏸ + slider volume (จำใน `mn.musicVolume`), วนลูป (loop + playlist param), แสดงชื่อเพลง
- setup modal: ช่อง URL YouTube + validate (แสดง ✓/✗ + เพลย์ลิสต์) + volume 0–100%
- ว่าง = ไม่มี iframe ไม่มี network request; ออกจากเกม → `player.destroy()` หยุดเพลง; API โหลดไม่ได้ → ซ่อน UI เกมไม่พัง
- **CSP:** `vercel.json` ยังไม่มี CSP header → ไม่มีอะไรบล็อก (ถ้าจะเพิ่มทีหลังต้องเปิด `youtube.com`/`ytimg.com` — เขียนไว้ใน GAME_SPEC/README)

### W9 — เอกสาร
- `docs/GAME_SPEC.md`: §2 ตาราง default เพิ่ม startingHand 3 / มือไม่จำกัด / scan radius adapt / เพลง background; §6 timer นับตั้งแต่ช่วงใช้การ์ด; §7.1 ไพ่คว่ำหน้า + ใช้/ทิ้ง + มือไม่จำกัด; §7.2 Scan ช่วงซ้าย–ขวา; §10 ตารางเสียง (ระบุไฟล์) + §10.1 เพลง background + หมายเหตุ CSP
- `README.md`: วิธีตั้งเพลง background + หมายเหตุ `public/sounds/` คือไฟล์เสียง + โครงสร้าง `lib/audio/` อัปเดต
- `RulesContent.tsx`: เพิ่มไพ่คว่ำหน้า/ใช้-ทิ้ง/มือไม่จำกัด
- `TODO.md`: เปลี่ยนเป็นสรุปว่างาน 18 ข้อจบครบ (ชี้ไป TASKS-V3/STATUS/GAME_SPEC)
- `grep -r 'โหมดเร่ง' src README.md docs/GAME_SPEC.md TODO.md` = 0 (เหลือเฉพาะใน docs/TASKS*.md + PLAN.md ที่เป็นประวัติเก่า)

---

## รอบแก้บั๊กจากการเทสเว็บ (2026-08-20)

หลังจบ W1–W9 มีการเทสจริงบนเว็บ เจอบั๊ก 8 ข้อ (B1–B8) — แก้ครบแล้ว รายละเอียดอยู่ใน `TODO.md`

| # | บั๊ก | commit |
|---|------|--------|
| B1 | หน้าจอว่างเปล่าตอนกดเริ่มเกม (`Dialog.Trigger` นอก `Dialog.Root`) — **blocker** | `2fac476` |
| B2 | LogPanel ค้างที่ 10 เหตุการณ์แรก (`slice(0,10)` → `slice(-10).reverse()`) | `2fac476` |
| B3 | โหมดใช้การ์ด/เปิดป้าย ไม่รีเซ็ตตอนขึ้นตาใหม่ | `2fac476` |
| B4 | StatusPanel โชว์ค่าดิบ `cards` | `2fac476` |
| B5 | toolbar มุมขวาบนทับ StatusPanel | `2fac476` |
| B6 | ข้อความซ้ำ "ทีม ทีม 6" | `2fac476` |
| B7 | มือการ์ดล้นจอแนวนอนเมื่อถือหลายใบ | รอบนี้ |
| B8 | กระดาน 200 ช่องสูงมาก + มือการ์ดบังกระดาน | รอบนี้ |

### B7 — มือการ์ดล้นจอ
- ย่อขนาดการ์ดตามจำนวนใบ: `>20 ใบ` = 36px, `>12 ใบ` = 48px, ปกติ 64px (`compact` ย่อ font/emoji ตาม)
- ห่อแถวมือด้วย `w-full overflow-x-auto` + แถวใน `w-max` → scroll แนวนอนได้เมื่อยังล้น
- คงเป็นแถวเดียวเสมอ (ไม่ใช้ `flex-wrap`) เพราะมือเป็น `fixed bottom` — ถ้า wrap จะสูงขึ้นไปบังกระดาน

### B8 — กระดานสูงเกิน
- ใหม่ `cellSizeFor(count)` ใน `Board.tsx` (export เพื่อเทสได้): `≤60`=56px, `61–120`=48px, `>120`=40px
- ขนาดช่องคุมด้วย `style={{ minHeight: size }}` แทน class `min-h-[56px]` (class คงที่ ย่อไม่ได้) + font ย่อตาม `small`
- Board scroll ในกรอบตัวเอง `max-h-[calc(100vh-14rem)] overflow-y-auto` → หน้าไม่ยาว และมือ (fixed) ไม่บังกระดานอีก
- test ใหม่ `src/components/board/Board.test.ts` 4 ข้อ (รวม monotonic: ช่องยิ่งเยอะขนาดยิ่งไม่โตขึ้น)

**ผลตรวจรอบนี้:** `bun test` 125/125 ผ่าน, `bun run tsc --noEmit` clean, `bun run build` สำเร็จ

---

## รอบเสริม — เพิ่ม DOM test environment (ปิดช่องโหว่ที่ B1/B7/B8 หลุดมาได้)

ปัญหาเดิม: repo ไม่มี jsdom/happy-dom/testing-library เลย → **ไม่มีเทสที่ render component**
บั๊กแบบ B1 (crash ตอน render = จอว่างเปล่า) จึงหลุดผ่านเทส 120 ตัวไปได้ทั้งหมด
และงาน layout อย่าง B7/B8 ก็ไม่มีอะไรจับนอกจากเปิดดูด้วยตา

- เพิ่ม devDeps: `@happy-dom/global-registrator`, `@testing-library/react`, `@testing-library/dom`
- `test-setup.ts` ลงทะเบียน happy-dom เป็น global DOM + ตั้ง `IS_REACT_ACT_ENVIRONMENT`
  โหลดผ่าน `bunfig.toml` (`[test] preload`) → ไม่กระทบ build (ยืนยันแล้วว่าไม่มี dep เทสหลุดเข้า `dist/`)
- **`SetupScreen.render.test.tsx`** — เทสกัน regression ของ B1 โดยตรง
  *ยืนยันแล้วว่าเทสนี้จับบั๊กได้จริง*: ลองใส่ `<Dialog.Trigger>` กลับเข้าไปนอก `<Dialog.Root>`
  เทสแดงทันทีด้วยข้อความเดียวกับตอนเจอบั๊กครั้งแรก แล้วจึงคืนโค้ดที่แก้แล้ว
- **`Board.render.test.tsx`** (4 ข้อ) — เทส DOM จริงของ B8: จำนวนปุ่มตรงกับจำนวนช่อง,
  Board มี `overflow-y-auto` + `max-h-[calc(100vh-14rem)]`, ขนาดช่องออกมาเป็น inline style จริง
  (กันคนย้ายกลับไปใช้ Tailwind class ที่ย่อตามตัวแปรไม่ได้), grid template ใช้ขนาดที่คำนวณ
- **`cardWidthFor()`** แยกออกจาก `Hand.tsx` เป็น pure function ที่ export (แพตเทิร์นเดียวกับ `cellSizeFor`)
  + `Hand.test.ts` 4 ข้อ รวม monotonic — เดิม threshold ของ B7 ฝังเป็น ternary inline ไม่มีเทสคุม
- **แก้ผลข้างเคียง:** happy-dom ให้ `localStorage` จริงซึ่งเป็น readonly accessor
  เทส storage 3 ไฟล์ที่ assign `globalThis.localStorage = mockStorage()` ตรง ๆ เลยพัง 20 ข้อ
  → เปลี่ยนเป็น `Object.defineProperty` (ทำงานได้ทั้งมีและไม่มี happy-dom)

**ผลตรวจ:** `bun test` **135/135 ผ่าน** (จาก 125), `tsc --noEmit` clean, `bun run build` สำเร็จ

---

## งานที่เหลือ

- ครบ W1–W9 + บั๊ก B1–B8 แล้ว
- **ยังไม่ได้ verify บนเบราว์เซอร์จริง** — Chrome extension (MCP) ไม่เชื่อมต่อทั้ง 2 รอบที่ลอง
  ส่วนที่เป็น CSS ล้วนจึงยังไม่มีหลักฐานจากจอจริง โดยเฉพาะค่า `14rem` ใน
  `max-h-[calc(100vh-14rem)]` ที่จับคู่กับ `pb-44` (11rem) ใน `GameScreen.tsx` — เป็นตัวเลขที่เดาจาก layout
  → ผู้ใช้เปิดเกม 200 ช่อง + จั่วการ์ดเกิน 20 ใบ ดูด้วยตาว่าลงตัวไหม
- branch `fix/setup-blank-screen` ยังไม่ merge เข้า `main`

---

## หมายเหตุ

- แต่ละ task = 1 commit (กฎเดิม)
- `docs/TASKS-V3.md` มีลำดับ: W4 → W3 → W1 → W2 → W5 → W6 → W7 → W8 → W9
- งานเสี่ยงสุด: W5 (engine/types/test) และ W8 (script ภายนอก + CSP)
- W8 caveat: ถ้า host เปิด adblock/offline → IFrame API โหลดไม่ได้ ระบบจะซ่อน UI เพลงเอง (เกมไม่พัง)
