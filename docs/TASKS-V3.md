# TASKS V3 — แก้ตาม TODO.md (รอบที่ 3)

**อ่านก่อนเริ่ม:** `docs/GAME_SPEC.md` (แหล่งความจริงของกติกา), `docs/TASKS-V2.md` (งาน V1–V8 ที่ทำเสร็จแล้ว)
เอกสารนี้แปลง `TODO.md` (18 ข้อ) เป็น task ที่ทำได้จริง 9 task

**กฎทั่วไป (เหมือนเดิม):**
- TypeScript strict — ห้าม `any` ห้าม `@ts-ignore`
- ไฟล์ใน `src/lib/game/` ห้าม import React
- บรรทัดยาวไม่เกิน 120 ตัวอักษร
- คอมเมนต์ภาษาไทยได้ ชื่อตัวแปร/ฟังก์ชันเป็นภาษาอังกฤษ
- แต่ละ task = 1 commit
- `bun test` ต้องผ่านทุก task (**baseline ปัจจุบัน = 91 tests ผ่านหมด**)
- ห้ามทำให้ตำแหน่งระเบิดหลุดเข้า `PublicGameState` เด็ดขาด

---

## แผนที่ TODO.md → Task

| TODO # | เรื่อง | Task |
|---|---|---|
| 13, 4, 5, 12, 11 | ช่องกรอกเลขช่องเดียว / ลบเลขได้จนหมด / เลิกใช้สไลด์ / ตั้งค่าได้เมื่อ enabled / เปลี่ยนชื่อ Shrinking Mode | **W1** |
| 1, 2, 3, 10 | popup modal ตั้งค่า + bar โอกาสโดนระเบิด + ข้อความ 100% / ช่องไม่พอ + แยกสีระเบิดจริง/glitch | **W2** |
| 15 | จัดหน้าจอเล่นให้อยู่กึ่งกลาง | **W3** |
| 17 | ตัวจับเวลาไม่ทำงาน | **W4** |
| 7, 9, 16, 8 | มือไม่จำกัดใบ / เริ่มต้น ≥3 ใบ / การ์ดปิดหน้าไพ่ + ใช้/ทิ้ง / เปิดช่องได้การ์ดแสดงสี | **W5** |
| 6 | รัศมี scan adapt ตามช่อง + อธิบาย + effect + popup ผลสแกน | **W6** |
| 18 | เสียงใน `sounds/` เอามาใช้จริง | **W7** |
| 14 | เพลง background จาก YouTube + ปรับ volume | **W8** |
| — | อัปเดตเอกสาร GAME_SPEC/README ให้ตรงกับของใหม่ | **W9** |

---

## สถานะปัจจุบันที่ตรวจแล้ว (2026-08-20)

| # | ปัญหาที่ TODO บอก | หลักฐานในโค้ด |
|---|---|---|
| C1 | ตัวจับเวลาไม่ทำงาน | `TimerCircle.tsx:22` `active = phase === 'opening'` แต่ทุกตาเริ่มที่ phase `'cards'` (`engine.ts:368`) → นาฬิกาแช่นิ่งตลอดช่วงคิด พอเปิดช่องแรก phase ค่อยเป็น `'opening'` แล้วตาก็จบทันที |
| C2 | เสียงในโฟลเดอร์ `sounds/` ไม่ถูกใช้เลย | `src/lib/audio/sfx.ts` generate เสียงด้วย WebAudio ล้วน + `sounds/` อยู่ root ไม่ใช่ `public/` → Vite ไม่ copy ไป `dist/` |
| C3 | สไลด์ใช้ยาก | `SetupScreen.tsx` มี `<input type="range">` 5 ตัว (turnSeconds, scanRadius, glitchRatio, maxHandSize, startingHand) |
| C4 | ตัวเลขลบจนหมดไม่ได้ | `rangeMin`/`rangeMax`/`maxHandSize` เก็บเป็น `number` ตรง ๆ → พิมพ์ลบหมดกลายเป็น `NaN`/`0` ทันที (มีแค่ `countInput`, `glitchCountInput` ที่เก็บเป็น string ถูกแล้ว) |
| C5 | ตั้งค่าได้แม้ toggle ปิด | `glitchRatio`/`glitchCount` disable ตาม `glitchEnabled` แล้ว แต่ `scanRadius` (ควรผูกกับ cardsEnabled) ไม่ได้ disable |
| C6 | กรอก 2 ช่อง (จาก–ถึง) ทั้งที่เริ่มที่ 1 เสมอ | `SetupScreen.tsx` มี rangeMin + rangeMax แยกกัน |
| C7 | มือจำกัด 5 ใบ | `maxHandSize` 3–7 (`config.ts:LIMITS`) + `drawRandomCard` คืน null เมื่อมือเต็ม |
| C8 | ทุกคนเห็นการ์ดของทีมที่กำลังเล่น | `Hand.tsx` render `current.hand` แบบหงายไพ่ตลอดเวลา |
| C9 | ทิ้งการ์ดไม่ได้ | ไม่มี action `DISCARD_CARD` ใน `types.ts:GameAction` |
| C10 | หน้าเล่นชิดขอบบน | `GameScreen.tsx:75` `grid min-h-screen ... p-4` ไม่มี centering |
| C11 | scan ไม่มี effect / ไม่บอกทิศทาง | `playScan` (`engine.ts:470`) สแกน `[target−R, target+R]` (ซ้าย/ขวา) แต่ UI แสดงผลแค่บรรทัด log |

---

## Task W1 — หน้าตั้งค่า: เลิกใช้สไลด์ + ช่องเดียว + gate ตาม toggle

**ไฟล์:** `src/components/setup/SetupScreen.tsx`, `src/lib/game/config.ts`

### W1.1 ช่องตัวเลขช่องเดียว (TODO 13)
เลขเริ่มต้นคือ 1 เสมอ → ตัด input "จาก" ทิ้ง เหลือช่องเดียวชื่อ **"จำนวนช่องทั้งหมด"** = `rangeMax`
- `rangeMin` ยังอยู่ใน `GameSettings` (engine + shrinking mode ใช้) แต่หน้า setup ล็อกเป็น `1`
- `handleStart()` ส่ง `rangeMin: 1` ตายตัว
- **ห้ามลบ field `rangeMin` ออกจาก type** — snapshot เก่าและ `applyShrink()` พึ่งอยู่

### W1.2 พิมพ์เลขลบจนหมดได้ (TODO 4)
ทุก numeric input เก็บ state เป็น **string** (แบบเดียวกับ `countInput` ที่มีอยู่แล้ว) ไม่ใช่ `number`:
```ts
const [cellsInput, setCellsInput] = useState(String(initial.rangeMax))
// ค่าที่เอาไปใช้จริง — ว่าง = ใช้ค่าต่ำสุด แต่ไม่ดีดค่าใน input ระหว่างพิมพ์
const cells = clamp(Number(cellsInput) || LIMITS.minRange, ...)
```
กฎ: **ระหว่างพิมพ์ห้าม clamp** (จะดีดค่าทิ้งขณะพิมพ์) — clamp ตอน `onBlur` และตอน `handleStart()` เท่านั้น
ตอน blur ถ้าว่างให้เซ็ตกลับเป็นค่า default ของช่องนั้น (= "ลบจนหมดแล้วดีดกลับเป็น 1 อัตโนมัติ" ที่ TODO ขอ)

### W1.3 ทุกสไลด์เป็นช่องกรอกเลข (TODO 5)
แทน `<input type="range">` ทั้ง 5 ตัวด้วย `<input type="number">` + ข้อความบอกช่วงที่รับได้:
`turnSeconds`, `scanRadius`, `glitchRatio` (แสดงเป็น **% จำนวนเต็ม 0–50** ไม่ใช่ 0.0–0.5), `maxHandSize`, `startingHand`
ทำ component ย่อยในไฟล์เดียวกันเพื่อลดโค้ดซ้ำ:
```tsx
function NumberField(props: {
  label: string; hint: string; value: string; onChange: (v: string) => void
  min: number; max: number; suffix?: string; disabled?: boolean; onBlurFix: () => void
}) { … }
```

### W1.4 ตั้งค่าได้ต่อเมื่อ toggle เปิด (TODO 12)
- `glitchEnabled` ปิด → glitch mode / ratio / count disable **และจางลง** (มีบางส่วนแล้ว ทำให้ครบ)
- `cardsEnabled` ปิด → `maxHandSize`, `startingHand`, **`scanRadius`** disable (ตอนนี้ scanRadius ไม่ได้ผูก)
- `shrinkingEnabled` ไม่มีค่าย่อย — ข้าม
ใช้ `<fieldset disabled>` ครอบเป็นกลุ่ม สั้นกว่าใส่ `disabled` ทีละอัน

### W1.5 เปลี่ยนชื่อเป็น Shrinking Mode (TODO 11)
`'โหมดเร่ง (วงหด)'` → `'Shrinking Mode (วงหด)'` ทุกที่: `SetupScreen.tsx`, `RulesPanel.tsx`, `RulesContent.tsx`,
`docs/GAME_SPEC.md` §9, `README.md`

### DoD
- [ ] setup มี input เลขช่องเดียว และไม่มี `type="range"` เหลือในไฟล์ (`grep 'type="range"' src/ | wc -l` = 0)
- [ ] ลบเลขในทุกช่องจนว่างได้ ไม่มี `NaN` โผล่ใน UI, blur แล้วเด้งกลับเป็นค่า default
- [ ] toggle ปิด → ช่องลูกกดไม่ได้
- [ ] `bun test` ผ่าน (`config.test.ts` ต้องยังผ่าน)

---

## Task W2 — Popup ตั้งค่า + bar โอกาสโดนระเบิด

**ไฟล์:** `src/components/setup/SetupScreen.tsx`, `src/lib/game/balance.ts`, `src/lib/game/balance.test.ts`,
`src/components/game/GameScreen.tsx`

### W2.1 ตั้งค่าเป็น popup modal (TODO 1)
หน้า setup ปัจจุบันยาวมาก (507 บรรทัด, 4 panel) → แยกกลุ่มตั้งค่าออกเป็น modal:
- หน้าหลักเหลือ: จำนวนช่อง, รายชื่อทีม, สรุป preview, ปุ่ม **⚙ ตั้งค่าเพิ่มเติม**, ปุ่มเริ่มเกม
- modal ครอบ: Glitch / ระบบการ์ด / Shrinking Mode / เวลา / scan radius
- ใช้ `@base-ui/react` Dialog (ติดตั้งแล้วใน `package.json`) — **อย่าเพิ่ม dependency ใหม่**
- ต้องปิดด้วย Esc ได้ + focus trap + ค่าที่แก้ใน modal มีผลทันทีต่อ preview ข้างนอก (state ยังอยู่ที่ `SetupScreen`)

### W2.2 Bar โอกาสโดนระเบิด (TODO 2)
เพิ่มใน `balance.ts` (pure function + test):
```ts
// โอกาสที่ "การเปิดช่องถัดไปแบบสุ่ม" จะโดนระเบิด = ระเบิดทั้งหมด / ช่องที่ยังไม่เปิด
export function hitChance(totalBombs: number, hiddenCells: number): number
```
UI: bar สีไล่ตามระดับ (เขียว < 15% / เหลือง 15–30% / ส้ม 30–50% / แดง > 50%) พร้อม **ตัวเลข % อยู่ข้างบนหลอด**
สีต้องมาจากเกณฑ์เดียวกับ `verdictFor()` — อย่าตั้งเกณฑ์ซ้อนกันคนละชุด ถ้าเกณฑ์ไม่ตรงให้ปรับ `verdictFor` แล้วอัปเดต test

### W2.3 ข้อความกรณีสุดโต่ง (TODO 3)
- `hitChance >= 1` (ระเบิดเต็มทุกช่อง) → bar แสดง **"หลบยังไงก่อน (100%)"** สีแดง
- `cells < teams * LIMITS.minCellsPerTeam` → แสดง **"เล่นยังไงก่อน (มันเล่นไม่ได้ ช่องน้อยไป๊)"** แทน bar
  + ปุ่มเริ่มเกม disable (มี gate อยู่แล้วที่ `canStart` — เปลี่ยนแค่ข้อความ)
ทำเป็น pure function ใน `balance.ts` จะได้ test ตรง ๆ:
```ts
export type ChanceDisplay =
  | { kind: 'unplayable'; text: string }
  | { kind: 'certain'; text: string; percent: 100 }
  | { kind: 'normal'; percent: number; level: BalanceVerdict }
export function chanceDisplay(bombs: number, cells: number, teams: number): ChanceDisplay
```

### W2.4 แยกสีระเบิดจริง vs glitch (TODO 10)
ตอนนี้ `SetupScreen.tsx` แสดง `{quota + glitchCount}` เป็นเลขแดงก้อนเดียว → แยกเป็นสองก้อน:
- ระเบิดจริง = **แดง** (`text-destructive`)
- glitch = **ม่วง** (`text-purple-600 dark:text-purple-400`) ให้ตรงกับสีช่อง `glitched` ใน `Board.tsx`
ทำเหมือนกันใน `PreviewStat`
⚠️ **ห้ามแยกจำนวน real/glitch ที่เหลือระหว่างเกมใน `StatusPanel`** — เป็นการรั่วข้อมูลลับ
แยกสีเฉพาะหน้า setup (ก่อนวางระเบิด) เท่านั้น

### DoD
- [ ] test ใหม่ใน `balance.test.ts` คลุม `hitChance` + `chanceDisplay` ทั้ง 3 kind
- [ ] modal เปิด/ปิดด้วย Esc ได้, ค่าที่แก้สะท้อนที่ preview ทันที
- [ ] หน้า setup หลักสั้นลงชัดเจน
- [ ] `StatusPanel` ยังแสดงแค่ `bombsRemaining` รวม ไม่แยกชนิด
- [ ] `bun test` ผ่าน

---

## Task W3 — จัดหน้าจอเล่นให้อยู่กึ่งกลาง (TODO 15)

**ไฟล์:** `src/components/game/GameScreen.tsx`, `src/globals.css`

`GameScreen.tsx:75` ปัจจุบัน:
```tsx
<div className="mx-auto grid min-h-screen w-full max-w-375 gap-4 p-4 pb-44 lg:grid-cols-[240px_1fr_300px]">
```
`min-h-screen` + grid ทำให้เนื้อหาเกาะขอบบนเสมอ แม้กระดานเล็ก
- ครอบด้วย wrapper `min-h-screen` ที่ `place-content-center` แล้วให้ตัว grid เป็น `h-max`
- กระดานเล็ก (ช่องน้อย) → อยู่กลางจอแนวตั้ง; กระดานใหญ่ (200 ช่อง) → scroll ได้ปกติ **ห้ามตัดเนื้อหา**
- `pb-44` มีไว้กัน Hand ที่ fixed ทับ — ถ้า W5 เปลี่ยน Hand เป็น layout ปกติ ให้ลดค่านี้ลง
- ตรวจที่ 1280×720 และ 1920×1080 ทั้งกรณี 20 ช่องและ 200 ช่อง

### DoD
- [ ] 20 ช่อง → เนื้อหาอยู่กลางจอแนวตั้ง
- [ ] 200 ช่อง → scroll ได้ครบ ไม่มีอะไรถูกตัด
- [ ] Hand ไม่ทับกระดาน

---

## Task W4 — ซ่อมตัวจับเวลา (TODO 17) 🔴 บั๊ก

**ไฟล์:** `src/components/board/TimerCircle.tsx`, `src/lib/game/engine.ts`, `src/lib/game/engine.test.ts`

**สาเหตุ:** `TimerCircle.tsx:22`
```ts
const active = phase === 'opening' && duration > 0
```
แต่ทุกตาเริ่มที่ phase `'cards'` (`engine.ts:368`) → นาฬิกาไม่เดินตลอดช่วงคิด ซึ่งเป็นช่วงที่ควรจับเวลาที่สุด
พอเปิดช่องแรก phase ค่อยเป็น `'opening'` แล้วนาฬิกาเพิ่งเริ่มเดิน (แล้วตาก็จบทันที)

**แก้:**
```ts
const active = (phase === 'cards' || phase === 'opening') && duration > 0
```
- หยุดนับตอน `'defusing'` (โมดอลตัดสายมีจังหวะของตัวเอง) และ `'gameover'`
- `TIMEOUT` ที่ dispatch ตอน phase `'cards'` ต้องทำงานด้วย: `timeout()` (`engine.ts:388`) guard `phase !== 'opening'` แล้ว
  `return` → ต้องรับ `'cards'` ด้วย ไม่งั้นหมดเวลาช่วงคิดแล้วเงียบ ไม่มีอะไรเกิดขึ้น (เกมค้าง)
- **ต้องมี unit test ใน `engine.test.ts`:** dispatch `TIMEOUT` ตอน phase `'cards'` แล้วต้องมีช่องถูกเปิด + ขึ้นตาถัดไป
- ตรวจ `turnKey`: `turnNumber * 1000 + currentTeamIndex` (`GameScreen.tsx:170`) — ทีมสูงสุด 12 < 1000 จึงไม่ชนกัน
  แต่ใส่คอมเมนต์บอกเงื่อนไขนี้ไว้กันคนเพิ่ม `maxTeams` ทีหลัง
- ตรวจว่า timer ไม่ reset กลางตาตอน state อัปเดตจากเหตุอื่น (เช่น เล่นการ์ด) — `turnKey` ต้องคงเดิม

### DoD
- [ ] นาฬิกาเดินตั้งแต่ต้นตา (phase `'cards'`)
- [ ] หมดเวลาตอนยังไม่เปิดช่อง → สุ่มเปิดให้ + ขึ้นตาถัดไป
- [ ] เล่นการ์ดกลางตาแล้วนาฬิกาไม่รีเซ็ต
- [ ] test ใหม่จับบั๊กนี้ได้ (revert แล้วต้องแดง)

---

## Task W5 — ระบบการ์ด: มือไม่จำกัด + ปิดหน้าไพ่ + ใช้/ทิ้ง

**ไฟล์:** `src/lib/game/config.ts`, `src/lib/game/types.ts`, `src/lib/game/engine.ts`,
`src/lib/game/cards.ts`, `src/components/cards/Hand.tsx`, `src/components/setup/SetupScreen.tsx`,
`src/components/gameover/GameOverScreen.tsx`, `src/lib/game/playthrough.test.ts`

### W5.1 มือไม่จำกัดใบ (TODO 7)
- `maxHandSize` ยอมรับค่า `0 = ไม่จำกัด` **ห้ามใช้ `Infinity`** (`JSON.stringify` → `null` ทำ snapshot พัง)
- `drawRandomCard()` (`cards.ts:12`): `if (maxHandSize > 0 && hand.length >= maxHandSize) return null`
- แก้ทุกจุดที่เทียบ `hand.length >= maxHandSize`: `engine.ts:86, 363, 405`, `Hand.tsx:31`
- setup: default เปลี่ยนเป็น **ไม่จำกัด** (`maxHandSize: 0`) + checkbox "จำกัดจำนวนใบในมือ" ที่ปลดล็อกช่องกรอก
- **ต้องอัปเดต invariant ใน `playthrough.test.ts`** ("ไม่มีทีมไหนถือการ์ดเกิน maxHandSize") ให้ข้ามเมื่อ `maxHandSize === 0`

### W5.2 การ์ดเริ่มต้นขั้นต่ำ 3 ใบ (TODO 9)
- `DEFAULTS.startingHand: 0` → `3`
- `LIMITS.maxStartingHand: 3` → `5` (ไม่งั้นตั้ง 3 แล้วปรับขึ้นไม่ได้เลย)
- setup: ช่วงที่รับ 0–5 แต่ default 3 (ยังตั้ง 0 ได้ถ้า MC อยากปิด)

### W5.3 ปิดหน้าไพ่ + ใช้หรือทิ้ง (TODO 16) — ข้อนี้ใหญ่สุดของ task
ตอนนี้ `Hand.tsx` หงายไพ่ของทีมที่กำลังเล่นให้ทุกคนในห้องเห็นตลอด TODO ขอว่า
"แต่ละทีมจะไม่เห็นเลยว่าได้การ์ดอะไรไปจนกว่าจะกดใช้งาน และเลือกได้ว่าจะใช้หรือทิ้ง เก็บกลับไม่ได้"

**โมเดลที่ตกลง:** ไพ่ในมือ **คว่ำหน้าทั้งหมด** (แสดงเป็นหลังไพ่ + เลขใบที่) ทีมเลือกใบ → เปิดหน้าไพ่ให้เห็น
→ ตัดสินใจ **ใช้** หรือ **ทิ้ง** → **กดเปิดแล้วปิดกลับไม่ได้** (เก็บกลับไม่ได้ตาม TODO)
- state ใหม่ใน `Hand.tsx`: `revealed: number | null` (index ใบที่เปิดอยู่) — reset เมื่อขึ้นตาใหม่
- ปุ่ม "ทิ้งการ์ด" ต้องมี action ใหม่ใน engine:
```ts
| { type: 'DISCARD_CARD'; index: number }
```
  - ทิ้งได้เฉพาะ phase `'cards'` + เป็นทีมตัวเอง + **ไม่ติด glitch/block** (ล็อกเดียวกับใช้การ์ด)
  - ทิ้งแล้ว **ไม่จบตา** และ **ไม่ได้จั่วชดเชย**
  - **ตัดสินใจ:** log บอกชื่อการ์ดที่ทิ้งได้ (ทิ้งไปแล้วไม่เป็นความลับอีก)
  - เพิ่ม `cardsDiscarded: number` ใน `TeamStats` แล้วโชว์ที่ `GameOverScreen`
- ⚠️ `Hand.tsx` ต้องกันคลิกรัว: ระหว่างเปิดใบอยู่ ห้ามเปิดใบอื่นซ้อน

### W5.4 เปิดช่องแล้วได้การ์ด → แสดงสี (TODO 8)
ตอนนี้จั่วการ์ดเงียบ ๆ ใน `endTurn()` — ไม่มีอะไรบอกผู้เล่น
- `PublicGameState` เพิ่ม `lastDraw: { teamId: string; card: CardType } | null`
  ⚠️ **ต้องเคลียร์เป็น null เมื่อขึ้นตาถัดไป** ไม่งั้นทีมถัดไปเห็นการ์ดที่ทีมก่อนหน้าจั่ว (ข้อมูลรั่ว + ขัดกับ W5.3)
- toast สั้น ๆ (~1.5 วิ) ใช้สีตาม `CARD_COLORS` ที่มีอยู่ใน `Hand.tsx:12`
  → **ย้าย `CARD_COLORS` ไป `lib/game/cards.ts`** จะได้ใช้ร่วมกันทั้ง toast และ Hand
- **ตัดสินใจ: toast บอกแค่ "ได้การ์ด 1 ใบ" + สีของการ์ด ไม่บอกชื่อ** — ตรงกับ W5.3 ที่ไม่ให้เห็นว่าได้อะไรจนกว่าจะเปิด
  (TODO ข้อ 8 ขอ "แสดงสีไว้ด้วย" พอดี)

### DoD
- [ ] ตั้งมือไม่จำกัดได้ จั่วเกิน 7 ใบได้จริง, snapshot save/load รอด (`session.test.ts` ผ่าน)
- [ ] เกมใหม่แจก 3 ใบ/ทีม เป็น default
- [ ] ไพ่คว่ำหน้า → เปิดได้ทีละใบ → ใช้/ทิ้ง → ปิดกลับไม่ได้
- [ ] `DISCARD_CARD` มี test ใน `engine.test.ts` (รวมเคส glitch/block ต้องทิ้งไม่ได้)
- [ ] `lastDraw` เคลียร์เมื่อขึ้นตาใหม่ — มี test
- [ ] `playthrough.test.ts` อัปเดต invariant มือ แล้วยังผ่าน

---

## Task W6 — Scan: รัศมี adapt + อธิบาย + effect (TODO 6)

**ไฟล์:** `src/lib/game/config.ts`, `src/lib/game/config.test.ts`, `src/lib/game/engine.ts`,
`src/lib/game/cards.ts`, `src/components/cards/Hand.tsx`, `src/components/board/Board.tsx`,
`src/components/game/GameScreen.tsx`, `src/globals.css`

### W6.1 อธิบายว่าสแกนแบบไหน
กระดานเป็น **แถวเลข 1 มิติ** (ไม่ใช่ตาราง 2 มิติ) — `playScan` (`engine.ts:470`) สแกนช่วง `[target−R, target+R]`
คือ **ซ้าย/ขวารอบเลขที่เลือก** ไม่ใช่รอบทิศ ไม่ใช่บน/ล่าง
เขียนให้ชัดใน `CARD_DESCRIPTIONS.scan`, `RulesContent.tsx`, `GAME_SPEC.md` §7:
> Scan ตรวจ **ช่วงเลขซ้าย–ขวา** รอบเลขที่เลือก (เช่น เลือก 20 รัศมี 3 = ตรวจ 17–23 รวม 7 ช่อง)
> บอกแค่ **มี/ไม่มี** ระเบิดในช่วงนั้น ไม่บอกว่าอยู่ช่องไหนหรือกี่ลูก

### W6.2 รัศมี adapt ตามจำนวนช่อง
ตอนนี้ `scanRadius` fix 1–5 ไม่ว่ากระดานจะ 20 หรือ 200 ช่อง → ±3 บนกระดาน 200 ช่องแทบไร้ค่า
```ts
// config.ts — รัศมีสูงสุดที่มีความหมาย ≈ 10% ของกระดาน (clamp 1–20)
export function maxScanRadiusFor(totalCells: number): number {
  return Math.min(Math.max(Math.round(totalCells * 0.1), LIMITS.minScanRadius), LIMITS.maxScanRadiusCap)
}
// แนะนำอัตโนมัติ ≈ 5% ของกระดาน
export function suggestedScanRadius(totalCells: number): number
```
- `LIMITS.maxScanRadius: 5` → `maxScanRadiusCap: 20`
- setup: max ของช่องกรอก = `maxScanRadiusFor(cells)` + ปุ่ม "ใช้ค่าแนะนำ" + ข้อความว่าครอบกี่ช่อง (`2R+1`)
- **ต้อง clamp ตอนเริ่มเกม** ไม่ใช่แค่ที่ UI — กัน settings เก่าใน localStorage ที่ radius ใหญ่เกินกระดานใหม่
- ต้องมี test ใน `config.test.ts`

### W6.3 Effect + popup ผลสแกน
- ช่องในช่วง `[target−R, target+R]` **เรืองแสงไล่ทีละช่องจากกลางออกข้าง** (~600ms) แล้วค้างไว้ ~1.5 วิ
  - `Board.tsx` รับ prop ใหม่ `scanning: { center: number; radius: number } | null`
  - CSS: class `.cell-scan` + `animation-delay` ตามระยะห่างจาก center
  - ต้องเคารพ `prefers-reduced-motion` (มี pattern อยู่แล้วใน `DefuseModal`)
- popup ผลสแกนหลัง animation จบ:
  - เจอ → **"⚠ มีระเบิดอยู่ใกล้ ๆ!"** พื้นแดง
  - ไม่เจอ → **"✓ ไม่มีระเบิดอยู่ใกล้ ๆ"** พื้นเขียว
  - ต้องบอกช่วงที่ตรวจด้วย เช่น "ตรวจ 17–23"
  - ใช้ `infoDialog()` จาก `src/components/ui/alert.ts` (SweetAlert2 wrapper ที่มีอยู่) — **อย่าเพิ่ม dependency**
  - ห้าม import `sweetalert2` ตรง ๆ นอก `alert.ts` (กฎเดิมในไฟล์นั้น)
- ⚠️ **ห้ามให้ animation รู้ตำแหน่งระเบิด** — `Board` รับแค่ center/radius กับผล boolean เท่านั้น

### DoD
- [ ] `maxScanRadiusFor` / `suggestedScanRadius` มี test
- [ ] settings เก่าที่ radius เกิน → clamp ตอนเริ่มเกม ไม่ crash
- [ ] เล่น Scan แล้วเห็นช่องเรืองแสงเป็นช่วง + popup บอกผล
- [ ] `prefers-reduced-motion` → ไม่มี animation แต่ยังเห็นผล
- [ ] `PublicGameState` ยังไม่มีตำแหน่งระเบิด

---

## Task W7 — ใช้ไฟล์เสียงจริงใน `sounds/` (TODO 18)

**ไฟล์:** ย้าย `sounds/` → `public/sounds/`, แก้ `src/lib/audio/sfx.ts`,
`src/components/effects/GameEffects.tsx`, `src/components/defuse/DefuseModal.tsx`, `src/components/cards/Hand.tsx`

### W7.1 ย้ายไฟล์ให้ Vite เห็น
`sounds/` อยู่ที่ root → **ไม่ถูก copy เข้า `dist/`** ตอน build (Vite copy เฉพาะ `public/`)
```bash
git mv sounds public/sounds
```
รวม ~656 KB — โอเคสำหรับ static host

### W7.2 map เสียง → เหตุการณ์
| ไฟล์ | เหตุการณ์ | จุดที่ trigger |
|---|---|---|
| `bomb-hit.mp3` | ตัดสายพลาด / ระเบิด | `chooseWire` survived=false |
| `defuse-success.mp3` | กู้สำเร็จ | `chooseWire` survived=true |
| `defuse-failed.mp3` | จังหวะเฉลยว่าพลาด (ก่อน bomb-hit) | `DefuseModal` reveal |
| `glitch-bomb-hit.mp3` | เจอ glitch bomb | `lastResult.kind === 'glitch'` |
| `got-item.mp3` | จั่วการ์ดได้ | `lastDraw` เปลี่ยน (W5.4) |
| `select-item.mp3` | เปิดหน้าไพ่ | `Hand` reveal (W5.3) |
| `use-item.mp3` | ใช้การ์ด | `lastCardResult` เปลี่ยน |
| `item-unavailable.mp3` | กดการ์ดตอน glitch/block | `Hand` คลิกทั้งที่ `!canPlay` |
| `select-block.mp3` | คลิกเลือกช่อง | `lastResult.kind === 'safe'` |
| `secure-block.mp3` | ช่องปลอดภัยยืนยันแล้ว / shrink | หลัง `applyShrink` |

### W7.3 โครง loader
- เพิ่ม `playFile(name)` ใน `sfx.ts` — preload `Audio` object ครั้งเดียวแล้ว `cloneNode()` ตอนเล่น (เล่นซ้อนได้)
- **เก็บเสียง WebAudio เดิมไว้เป็น fallback** ถ้าไฟล์โหลดไม่ขึ้น (offline / 404) — อย่าลบ `tone()`/`noise()` ทิ้ง
- `setMuted()` ต้องคุมทั้งสองทาง
- เพิ่ม volume ของ sfx แยกจากเพลง background (W8) — `sfxVolume` 0–1 เก็บใน localStorage

### DoD
- [ ] `public/sounds/` มีครบ 10 ไฟล์ และอยู่ใน `dist/` หลัง `bun run build`
- [ ] ทุกเหตุการณ์ในตารางมีเสียงจริง
- [ ] ปุ่ม mute ปิดได้ทั้งไฟล์เสียงและ WebAudio fallback
- [ ] ไฟล์เสียงโหลดไม่ขึ้น → fallback ทำงาน ไม่มี error หลุด console

---

## Task W8 — เพลง background จาก YouTube + ปรับ volume (TODO 14)

**ไฟล์:** ใหม่ `src/lib/audio/music.ts`, `src/lib/audio/music.test.ts`, `src/components/effects/MusicPlayer.tsx`,
แก้ `src/components/setup/SetupScreen.tsx`, `src/components/game/GameScreen.tsx`, `src/lib/game/types.ts`,
`src/lib/storage/session.ts`

### W8.1 ข้อจำกัดที่ต้องรู้ก่อนเขียน
- **ห้าม download/แปลง YouTube เป็นไฟล์** (ผิด ToS) — ต้องใช้ **YouTube IFrame Player API** ฝัง player ซ่อนไว้
- IFrame API โหลดจาก `https://www.youtube.com/iframe_api` = **script ภายนอก** ต้องเช็ค CSP ใน `vercel.json`
- **autoplay จะถูกบล็อก** จนกว่าจะมี user gesture — เริ่มเพลงตอนกด "เริ่มเกม" (มี `unlockAudio()` อยู่แล้วที่ `App.tsx:35`)
- ต้องมี **fallback**: ถ้า iframe API โหลดไม่ได้ → ซ่อน UI เพลง ไม่ให้เกมพัง

### W8.2 ที่ตั้งค่า
- ช่องกรอก **URL YouTube** ในหน้าตั้งค่า (ใน modal ของ W2) + validate
```ts
// music.ts — pure function, ต้องมี test
export function parseYouTubeId(url: string): string | null
```
  รองรับ `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/playlist?list=`, id เปล่า ๆ 11 ตัว
- เก็บใน `GameSettings`: `musicUrl: string` (default `''` = ไม่เปิดเพลง), `musicVolume: number` (0–100, default 30)
- ⚠️ **field ใหม่ใน `GameSettings` ต้อง backward-compatible** — `loadSettings()` (`storage/session.ts`) ต้องเติม
  default ให้ settings เก่าที่ไม่มี field นี้ ไม่งั้น resume เกมเก่าพัง **ต้องมี test**

### W8.3 ตัวเล่นระหว่างเกม
- แถบเล็กมุมจอ (ข้าง `MuteButton`): ปุ่ม ▶/⏸ + slider volume + ชื่อเพลง
- volume slider ตัวนี้ **ใช้ slider ได้** (TODO 5 พูดถึงหน้าตั้งค่า ไม่ใช่ volume) — แต่ต้องมีตัวเลข % กำกับ
- เพลงเล่นวนลูป, ค่า volume จำใน localStorage
- หยุดเพลงตอนออกจากหน้าเกม (`exitGame`) — **ต้อง cleanup iframe** ไม่งั้นเพลงเล่นต่อในหน้าเมนู

### DoD
- [ ] `parseYouTubeId` มี test คลุมทุกรูปแบบ URL + input ขยะ
- [ ] ใส่ URL → เพลงเล่นตอนเริ่มเกม, ปรับ volume ได้, ปิดได้
- [ ] ไม่ใส่ URL → ไม่มี iframe, ไม่มี network request ไป youtube
- [ ] settings เก่า (ไม่มี `musicUrl`) โหลดได้ ไม่ crash — มี test
- [ ] ออกจากเกม → เพลงหยุด

---

## Task W9 — อัปเดตเอกสารให้ตรงกับของใหม่

**ไฟล์:** `docs/GAME_SPEC.md`, `README.md`, `src/components/rules/RulesContent.tsx`,
`src/components/setup/RulesPanel.tsx`, `TODO.md`

- `GAME_SPEC.md` §2 ตารางค่า default: `startingHand` 3, `maxHandSize` ไม่จำกัด, scan radius adapt, เพลง background
- §7 Scan: อธิบายว่าเป็นช่วงซ้าย–ขวา + ทิ้งการ์ดได้ + ไพ่คว่ำหน้า
- §9: เปลี่ยนชื่อเป็น Shrinking Mode
- `RulesContent.tsx` / `RulesPanel.tsx`: ให้ตรงกับ spec ใหม่ทุกข้อ
- `README.md`: เพิ่มวิธีตั้งเพลง background + หมายเหตุว่า `public/sounds/` คือไฟล์เสียง
- `TODO.md`: ติ๊กข้อที่ทำเสร็จ หรือลบทิ้งถ้าทำครบ

### DoD
- [ ] ไม่มีที่ไหนเขียนว่า "โหมดเร่ง" อีก (`grep -r 'โหมดเร่ง' src docs README.md | wc -l` = 0)
- [ ] ค่า default ในเอกสารตรงกับ `config.ts` จริง

---

## ลำดับที่แนะนำ

```
W4 ซ่อม timer (บั๊ก, เล็ก, อิสระ — ทำก่อนได้เลย)
W3 จัดกลางจอ (เล็ก, อิสระ)
 │
W1 setup: เลิกสไลด์ + ช่องเดียว ──┐
                                  ├─ W2 popup + bar โอกาสระเบิด
W5 ระบบการ์ด (ใหญ่สุด) ───────────┤
 │                                └─ W6 scan (รอ W1 เพราะแก้ input เดียวกัน)
 └─ W7 เสียงจริง (รอ W5 เพราะ hook เข้า event การ์ด)
     └─ W8 เพลง background (รอ W2 เพราะช่อง URL อยู่ใน modal)
         └─ W9 เอกสาร (ท้ายสุด)
```

**ทำน้อยที่สุดให้ดีขึ้นชัดเจน:** W4 → W3 → W1
**เสี่ยงสุด/ใหญ่สุด:** W5 (แตะ engine + type + test) และ W8 (script ภายนอก + CSP)

---

## เรื่องที่ต้องตัดสินใจก่อนเริ่ม W8

1. เพลง background: **YouTube IFrame API** (ตาม TODO) หรือให้ MC เปิดเพลงเองแล้วเรามีแค่ volume ของ sfx?
   IFrame API ต้องพึ่ง network + CSP + อาจโดน adblock — ถ้า MC มักเล่น offline อาจไม่คุ้ม
2. ถ้าเลือก IFrame API: ต้องแก้ `vercel.json` เปิด CSP ให้ `youtube.com` / `ytimg.com` หรือไม่
   (`vercel.json` ตอนนี้มีแค่ framework/build/output/install — **ยังไม่มี CSP header เลย** ถ้าไม่เพิ่มก็ไม่มีอะไรบล็อก
   แต่ถ้าจะเพิ่ม CSP ทีหลังต้องจำข้อนี้ไว้)
