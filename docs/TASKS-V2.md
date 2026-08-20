# TASKS V2 — แก้ตาม STATUS.md

**อ่านก่อนเริ่ม:** `docs/GAME_SPEC.md` (แหล่งความจริงของกติกา) และ `docs/TASKS.md` (งานเดิม T1–T10 ที่ทำเสร็จแล้ว)
เอกสารนี้คือรอบแก้ที่ 2 จาก feedback ใน `STATUS.md`

**กฎทั่วไป (เหมือนเดิม):**
- TypeScript strict — ห้าม `any` ห้าม `@ts-ignore`
- ไฟล์ใน `lib/game/` ห้าม import React หรือ Next.js
- บรรทัดยาวไม่เกิน 120 ตัวอักษร
- คอมเมนต์ภาษาไทยได้ ชื่อตัวแปร/ฟังก์ชันเป็นภาษาอังกฤษ
- แต่ละ task = 1 commit
- `npx vitest run` ต้องผ่านทุก task (baseline ปัจจุบัน = 56 tests ผ่านหมด)

---

## สรุปสถานะปัจจุบัน (ตรวจแล้ว 2026-08-20)

**มีอยู่แล้ว:** หน้า setup (`components/setup/SetupScreen.tsx`) + RulesPanel (พับได้),
engine ครบ (`lib/game/engine.ts` 561 บรรทัด), ระบบการ์ด 6 ใบ, defuse modal, game over + podium,
autosave เข้ารหัส (`lib/storage/`), test 56 เคสผ่านหมด

**ยังไม่มี / พัง:**

| # | ปัญหา | หลักฐาน |
|---|-------|---------|
| B1 | **คลิกเปิดช่องไม่ได้ตอนเริ่มตา** | `GameScreen.tsx:69` ส่ง `disabled={state.phase !== 'opening'}` แต่ engine เริ่ม turn ที่ phase `'cards'` (`engine.ts:95,359`) → กระดานถูก disable ทุกต้นตา ต้องกดการ์ดก่อนถึงจะคลิกได้ ทั้งที่ `openCell()` (`engine.ts:241-245`) รับ phase `'cards'` อยู่แล้ว |
| B2 | **ตัว A ของ Attack หาย / Skip เหลือ "kip"** | `Hand.tsx:139-143` ใช้ `slice(0,2)`/`slice(3)` กับ `CARD_LABELS` แต่ `⚔`/`⏭` เป็น emoji 1 code unit ไม่ใช่ 2 → ได้ `⚔ ` + `ttack` |
| B3 | ไม่มีเมนู index จริง (เข้ามาเจอหน้าตั้งค่ายาวเลย) | `app/page.tsx` render `SetupScreen` ตรง ๆ |
| B4 | ไม่มี clear storage ใน UI | ไม่มีปุ่มไหนเรียก `clearSnapshot` นอกจากตอนเริ่มเกม |
| B5 | ใช้ `window.confirm` | `GameScreen.tsx:55` |
| B6 | ปรับจำนวนทีมต้องกด +/ลบ ทีละอัน, default name เป็น "ทีม A/B/C" ไม่ใช่ "ทีม 1/2/3" | `config.ts:defaultTeamNames` ใช้ `String.fromCharCode(65+i)` |
| B7 | shuffle ลำดับทีมก่อนเริ่มเกมไม่ได้ | ไม่มีปุ่มใน SetupScreen |
| B8 | จำนวน glitch / การ์ด custom ไม่ได้ | glitch คุมได้แค่ ratio, การ์ดไม่มี setting เลย |
| B9 | ไม่มี leaderboard ข้ามเกม | grep `leaderboard` = 0 hit |
| B10 | คำอธิบาย shrinking / glitch / card ในหน้าตั้งค่ามีน้อย | มีแค่ warning ของ shrinking |
| B11 | timer เป็นวงกลมอย่างเดียว ไม่มีตัวเลข | `TimerCircle.tsx` |
| B12 | ยังใช้ pnpm + Next.js | `package.json` |

**หมายเหตุเรื่อง "แต่ละกลุ่มเปิดเกมไม่ได้":** สาเหตุคือ B1 (กระดานถูก disable) ไม่ใช่ปัญหา build/deploy

---

## Task V1 — ซ่อมบั๊กบล็อกเกม (ทำก่อนอย่างอื่น)

**ไฟล์:** `components/game/GameScreen.tsx`, `components/cards/Hand.tsx`, `lib/game/cards.ts`

### V1.1 กระดานคลิกได้ตั้งแต่ต้นตา (B1)
`GameScreen.tsx:69` เปลี่ยนเป็น:
```tsx
disabled={state.phase !== 'opening' && state.phase !== 'cards'}
```
ให้ตรงกับ guard ใน `openCell()` — ทีมเลือกได้เองว่าจะใช้การ์ดก่อนหรือเปิดป้ายเลย
(ตรงกับ STATUS: "แต่ละทีมจะมี action ให้เลือกระหว่างใช้ item หรือเปิดป้าย")

### V1.2 แยก emoji ออกจากชื่อการ์ด (B2)
เลิก slice string ใน `Hand.tsx` — แก้ `lib/game/cards.ts` ให้แยกฟิลด์:
```ts
export const CARD_META: Record<CardType, { emoji: string; name: string; th: string }> = {
  scan:    { emoji: '🔍', name: 'Scan',    th: 'สแกน' },
  skip:    { emoji: '⏭',  name: 'Skip',    th: 'ข้ามตา' },
  block:   { emoji: '🛡',  name: 'Block',   th: 'บล็อก' },
  reverse: { emoji: '🔄', name: 'Reverse', th: 'ย้อนทิศ' },
  shuffle: { emoji: '🎲', name: 'Shuffle', th: 'สับระเบิด' },
  attack:  { emoji: '⚔',  name: 'Attack',  th: 'โจมตี' },
}
```
เก็บ `CARD_LABELS` ไว้เป็น derived (`emoji + ' ' + name`) เพื่อไม่ให้ที่อื่นพัง แล้วลบ
`cardEmoji()`/`cardName()` ใน `Hand.tsx:139-143` ทิ้ง
ตรวจทุกที่ที่ใช้ `CARD_LABELS`: `Hand.tsx`, `GameOverScreen.tsx`, `RulesPanel.tsx`

### DoD
- [ ] test ใหม่ใน `lib/game/cards.test.ts`: ทุก card ต้องมี `name` ที่ match `/^[A-Z][a-z]+$/` และ emoji ยาว ≥ 1
- [ ] test ใหม่ใน `engine.test.ts`: เกมใหม่ (cardsEnabled: true) → `dispatch(OPEN_CELL)` ทันทีโดยไม่ใช้การ์ด ต้องได้ผล (cell เปลี่ยนสถานะ)
- [ ] เล่นจริง: เริ่มเกม → คลิกเลขได้เลยโดยไม่ต้องแตะการ์ด

---

## Task V2 — หน้า index + เมนู (B3, B4, B5)

**ไฟล์:** `app/page.tsx`, `components/menu/MainMenu.tsx` (ใหม่), `components/ui/alert.ts` (ใหม่)

### V2.1 SweetAlert2
ติดตั้ง `sweetalert2` แล้วสร้าง wrapper `components/ui/alert.ts` ห่อไว้ที่เดียว
(theme ให้เข้ากับ token ใน `app/globals.css`):
```ts
export function confirmDialog(opts: { title: string; text?: string; confirmText?: string }): Promise<boolean>
export function infoDialog(opts: { title: string; text?: string; icon?: 'info' | 'success' | 'error' }): Promise<void>
```
แทนที่ `window.confirm` ใน `GameScreen.tsx:55` และใช้กับทุก dialog ใหม่ในเอกสารนี้
**ห้าม** import `sweetalert2` ตรง ๆ นอก wrapper

### V2.2 MainMenu
`app/page.tsx` เพิ่ม screen state: `'menu' | 'setup' | 'rules' | 'leaderboard' | 'game'`
เริ่มที่ `'menu'` เสมอ หน้าเมนูมีปุ่มใหญ่:

| ปุ่ม | ทำอะไร |
|------|--------|
| ▶ เริ่มเกม | ไป `'setup'` |
| ⏵ เล่นต่อ | โผล่เฉพาะเมื่อ `loadSnapshot()` ไม่ null → resume ตรง ๆ |
| 🏆 Leaderboard | ไป `'leaderboard'` (Task V6) |
| 📖 กฎกติกา | ไป `'rules'` (เต็มหน้า ไม่ใช่ panel พับ) |
| 🗑 ล้างข้อมูล | `confirmDialog` → ล้าง snapshot + settings + leaderboard → `infoDialog` ยืนยัน |

`ResumePrompt.tsx` ที่เด้งเป็น modal เองไม่ต้องใช้แล้ว — ย้าย "เล่นต่อ" ไปไว้ในเมนูแทน (ลบไฟล์ทิ้ง)
`RulesPanel.tsx` แยกเนื้อหาออกเป็น component ที่ reuse ได้ทั้งหน้าเต็มและ panel

### DoD
- [ ] เปิดเว็บครั้งแรก → เจอเมนู ไม่ใช่ฟอร์มตั้งค่า
- [ ] "ล้างข้อมูล" แล้ว reload → ไม่มี "เล่นต่อ", settings กลับเป็น default, leaderboard ว่าง
- [ ] grep `window.confirm|window.alert` ใน `app/` `components/` = 0 hit

---

## Task V3 — ปรับหน้าตั้งค่า (B6, B7, B10)

**ไฟล์:** `components/setup/SetupScreen.tsx`, `lib/game/config.ts`, `lib/game/rng.ts`

### V3.1 default name เป็นตัวเลข
`config.ts`:
```ts
export function defaultTeamNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `ทีม ${i + 1}`)
}
```
แก้ `letterName()` ใน `SetupScreen.tsx` ให้ใช้ตัวเลขด้วย
(ตอนนี้มี logic ซ้ำอยู่ 2 ที่ — ให้เหลือที่เดียวใน `config.ts`)

### V3.2 ช่องคีย์จำนวนทีม + ปุ่มยืนยัน
เหนือรายชื่อทีม เพิ่ม: `จำนวนทีม [ 6 ] (2–12)  [ยืนยัน]`

กด "ยืนยัน" แล้ว:
- ถ้าเพิ่ม → เติมชื่อ default ต่อท้าย (`ทีม 7`, `ทีม 8`, …)
- ถ้าลด → ตัดท้ายออก **แต่ต้อง `confirmDialog` ก่อนถ้าชื่อที่จะถูกตัดถูกแก้เอง** (ไม่ใช่ default)
- clamp `LIMITS.minTeams`–`LIMITS.maxTeams`

ปุ่ม +/ลบ ทีละทีมยังเก็บไว้ได้

### V3.3 ปุ่มสุ่มลำดับทีม (B7)
ปุ่ม "🎲 สุ่มลำดับ" ข้างหัวข้อทีม → `shuffle(rng, names)` จาก `lib/game/rng.ts`
ลำดับในลิสต์ = ลำดับการเล่นจริง ให้มีข้อความกำกับว่า "ลำดับนี้คือลำดับการเล่น (ทีมบนสุดเริ่มก่อน)"
สุ่มแล้วต้องเห็นลิสต์สลับทันที (สุ่มใน UI ไม่ใช่ตอน `createGame` — MC ต้องเห็นก่อนกดเริ่ม)

### V3.4 คำอธิบายในหน้าตั้งค่า (B10)
ทุก toggle/slider ต้องมีข้อความอธิบายใต้ label (ไม่ใช่แค่ tooltip):
- **Glitch bomb** — "ระเบิดปลอม เปิดโดนแล้วไม่ตาย แต่ทีมนั้นใช้การ์ดไม่ได้ 2 ตา เป็นระเบิดส่วนเกินจากระเบิดจริง"
- **โหมดเร่ง (วงหด)** — "เมื่อเปิดช่องปลอดภัย ขอบซ้าย/ขวาของกระดานจะหดเข้า ช่องเหลือน้อยลงเรื่อย ๆ เกมจบเร็วขึ้น แต่ทีมที่เล่นทีหลังเสี่ยงกว่า"
- **ระบบการ์ด** — "ทีมที่รอดจบตาจะได้จั่วการ์ด 1 ใบ (ถือได้สูงสุด 5 ใบ) ใช้ในตาตัวเองได้ไม่จำกัดจำนวนใบ"
- **รัศมี Scan** — "การ์ด Scan บอกว่ามีระเบิดในช่วง ±R รอบเลขที่เลือกหรือไม่ ยิ่งกว้างยิ่งเจอง่ายแต่ระบุตำแหน่งยาก"
- **เวลา/ตา** — "หมดเวลาแล้วระบบจะสุ่มเปิดช่องให้อัตโนมัติ ตั้ง 0 = ไม่จับเวลา"

เพิ่ม preview box สรุปก่อนเริ่ม: จำนวนช่อง / ระเบิดจริง / glitch / การ์ดในสำรับ / ทีม

### DoD
- [ ] `lib/game/config.test.ts` (ใหม่): `defaultTeamNames(3)` = `['ทีม 1','ทีม 2','ทีม 3']`
- [ ] คีย์ 8 กดยืนยัน → ได้ 8 ทีม ชื่อ ทีม 1–8
- [ ] กดสุ่มลำดับหลายครั้ง ลำดับต้องเปลี่ยน (ไม่ค้างอันเดิม)

---

## Task V4 — custom จำนวนระเบิด + การ์ด + balance (B8)

**ไฟล์:** `lib/game/types.ts`, `lib/game/config.ts`, `lib/game/setup.ts`, `lib/game/cards.ts`, `SetupScreen.tsx`

### V4.1 glitch เป็นจำนวนลูก ไม่ใช่แค่ ratio
เพิ่มใน `GameSettings`:
```ts
glitchMode: 'auto' | 'manual'   // auto = ใช้ ratio เหมือนเดิม
glitchCount: number             // ใช้เมื่อ manual
```
`glitchCountFor()` รับ mode เข้าไปด้วย — manual ให้ clamp ด้วยจำนวนช่องว่างที่เหลือ (`totalCells - realBombs`)
UI: radio "อัตโนมัติ (ตามสัดส่วน)" / "กำหนดเอง" + number input

**ระเบิดจริงยังล็อกที่ `ทีม − 1` ตาม GAME_SPEC §2** — ห้ามเปิดให้แก้ (ไม่งั้นเกมไม่จบ)
ให้เขียนเหตุผลกำกับใน UI

### V4.2 ตั้งจำนวนการ์ดได้
เพิ่ม:
```ts
maxHandSize: number      // 3–7, default 5
startingHand: number     // 0–3, default 0 — การ์ดแจกตอนเริ่มเกม
cardWeights?: Partial<Record<CardType, number>>  // optional override
```
`LIMITS.maxHandSize` เดิมเป็น const → เปลี่ยนเป็น `LIMITS.minHandSize` / `LIMITS.maxHandSizeCap`
แล้วให้ engine อ่านจาก `settings.maxHandSize` แทน (ตอนนี้ hardcode ที่ `engine.ts:353`, `Hand.tsx:32`)

### V4.3 ตอบคำถาม "การ์ดได้จากไหน" ให้ชัดใน UI
กติกาปัจจุบัน: **จั่ว 1 ใบเมื่อจบตาโดยรอด และไม่ติด glitch** (`engine.ts:352-360`)
→ เขียนลง RulesPanel + tooltip ในเกม ไม่ใช่ให้ผู้เล่นเดา
ถ้า `startingHand > 0` ให้แจกตอน `createGame` ด้วย

### V4.4 balance ให้สัมพันธ์กับ range
เพิ่ม `lib/game/balance.ts`:
```ts
// ความหนาแน่นระเบิด = ระเบิดทั้งหมด / ช่องทั้งหมด
export function bombDensity(totalBombs: number, totalCells: number): number
export type BalanceVerdict = 'too-easy' | 'good' | 'risky' | 'brutal'
export function verdictFor(density: number): BalanceVerdict
// แนะนำช่วงตัวเลขที่เหมาะกับจำนวนทีม
export function suggestRange(teamCount: number): { min: number; max: number }
```
เกณฑ์แนะนำ (ปรับได้ แต่ต้องมี test ล็อกไว้):
- density < 0.08 → `too-easy` (เปิดกันยาว น่าเบื่อ)
- 0.08–0.20 → `good`
- 0.20–0.35 → `risky`
- \> 0.35 → `brutal`

`suggestRange` ให้ target density ≈ 0.13 → `max ≈ min + round((teams - 1) / 0.13)`
SetupScreen แสดง badge สี + ปุ่ม "ใช้ค่าแนะนำ"

### DoD
- [ ] `lib/game/balance.test.ts`: ทดสอบทุก verdict boundary + `suggestRange(6)` ต้องได้ density ในโซน good
- [ ] `lib/game/setup.test.ts` (ใหม่): manual glitch = 5 → นับ bomb kind `'glitch'` ได้ 5 ลูกจริง และไม่เกินช่องว่าง
- [ ] `maxHandSize: 3` → จั่วใบที่ 4 ไม่เข้า (test ที่ engine)

---

## Task V5 — turn flow: ใช้ item กี่ใบก็ได้ + block

**ไฟล์:** `lib/game/engine.ts`, `components/cards/Hand.tsx`, `components/game/GameScreen.tsx`

### V5.1 ยืนยันพฤติกรรมที่ต้องการ
STATUS ระบุ: *"จะใช้กี่ item ก็ได้ แล้วแต่เลยใน turn ตัวเอง"* และ
*"บาง item จะ skip turn ไปเลย หรือบางไอเท็มกดใช้แล้วค่อยเปิดช่องต่อ"*

engine ปัจจุบันทำถูกแล้วบางส่วน: `playCard()` ไม่จำกัดจำนวนใบต่อตา,
`cardEndsTurn()` = skip/reverse/attack จบตาทันที

**สิ่งที่ต้องตัดสินใจ:** V1.1 ทำให้เปิดป้ายก่อนใช้การ์ดได้ → เปิดป้ายแล้วยังใช้การ์ดต่อได้ไหม
→ **ข้อสรุป: ไม่ได้** เปิดป้ายแล้วจบช่วงการ์ดของตานั้น (phase `cards` → `opening` ทางเดียว)
ต้องมี UI บอกชัดเจนก่อนคลิกช่องแรก: "เปิดป้ายแล้วจะใช้การ์ดในตานี้ไม่ได้อีก"

### V5.2 UI action bar
เหนือกระดานเพิ่มแถบ 2 ทางเลือกตอน phase `'cards'`:
```
[ 🃏 ใช้การ์ด (n ใบในมือ) ]   [ 🔢 เปิดป้ายเลย ]
```
กด "เปิดป้ายเลย" → **ไม่ต้อง** `dispatch({ type: 'END_TURN' })` ให้แค่ set local state ซ่อนการ์ด
แล้วรอ `OPEN_CELL` (engine เปลี่ยน phase เองที่ `engine.ts:245`)
`Hand.tsx` ต้องแสดงตลอดเวลาที่ phase = `'cards'` และเทาเมื่อ `'opening'` พร้อมเหตุผล

### V5.3 Block ทำงานถูกต้อง
STATUS: *"สามารถ block ทีมอื่นได้เมื่อทีมนั้นใช้ item ในรอบนั้น"*
ปัจจุบัน Block = ทีมเป้าหมายใช้การ์ดไม่ได้ใน turn ถัดไป
→ ยืนยันว่าตรงเจตนา ให้เขียนคำอธิบายให้ตรงกันทั้ง `CARD_DESCRIPTIONS`, RulesPanel และ badge 🛡 ใน TeamList
ถ้าต้องการ interrupt แบบ real-time (block ตอนอีกทีมกำลังใช้) — **อย่าทำ**
เพราะเป็น hotseat 1 จอ ไม่มี concurrency ให้บันทึกข้อสรุปนี้ลง `GAME_SPEC.md`

### DoD
- [ ] test: ในตาเดียวใช้ scan 2 ใบ + block 1 ใบ ได้ (ไม่มีลิมิตต่อตา)
- [ ] test: หลัง `OPEN_CELL` แล้ว `PLAY_CARD` ต้องไม่มีผล (การ์ดไม่หายจากมือ)
- [ ] test: block ทีม B → ตาถัดไปของ B `currentBlocked === true` และตาถัดไปอีกตาเป็น false

---

## Task V6 — leaderboard + timer (B9, B11)

**ไฟล์:** `lib/storage/leaderboard.ts` (ใหม่), `components/leaderboard/LeaderboardScreen.tsx` (ใหม่),
`components/board/TimerCircle.tsx`, `GameOverScreen.tsx`

### V6.1 เก็บผลเกมข้ามรอบ
```ts
export interface MatchRecord {
  id: string
  playedAt: number          // Date.now()
  teamName: string
  rank: number
  totalTeams: number
  opens: number
  defusesSucceeded: number
  cardsPlayed: number
  survived: boolean
}
export function loadLeaderboard(): MatchRecord[]
export function appendMatch(records: MatchRecord[]): void   // เก็บ ≤ 200 แถวล่าสุด
export function clearLeaderboard(): void
export function aggregateByTeam(records: MatchRecord[]): TeamAggregate[]  // เรียงตามแต้ม
```
**ไม่ต้องเข้ารหัส** (ไม่ใช่ความลับเหมือนตำแหน่งระเบิด) — plain JSON ใน localStorage key แยก
แต้ม: ชนะ = 3, อันดับ 2 = 2, อันดับ 3 = 1, นอกนั้น 0

### V6.2 บันทึกตอนจบเกม
`GameOverScreen` เรียก `appendMatch` **ครั้งเดียว** ตอน mount
(ระวัง React 19 StrictMode double-mount → ใช้ ref guard หรือทำที่ engine transition)
เพิ่มปุ่ม "🏆 ดู leaderboard" ในหน้าจบเกม

### V6.3 หน้า Leaderboard
ตารางรวมทุกทีม: ชื่อ / เล่นกี่เกม / ชนะ / แต้มรวม / ป้ายที่เปิด / ตัดสายรอด
\+ ประวัติ 20 เกมล่าสุด + ปุ่มล้าง leaderboard (ยืนยันด้วย SweetAlert)

### V6.4 timer แสดงตัวเลข (B11)
`TimerCircle.tsx` ใส่เลขวินาทีที่เหลือกลางวง (font mono ขนาดใหญ่)
- ≤ 10 วิ → สีแดง + เต้น
- ≤ 5 วิ → เสียง tick (มี `lib/audio/sfx.ts` อยู่แล้ว)
- `turnSeconds === 0` → แสดง "∞" ไม่นับถอยหลัง

### DoD
- [ ] `lib/storage/leaderboard.test.ts`: append เกิน 200 → เหลือ 200 แถวล่าสุด, aggregate คำนวณแต้มถูก
- [ ] เล่นจบ 2 เกม → leaderboard สะสมทั้ง 2 (ไม่ทับกัน ไม่ซ้ำจาก double-mount)
- [ ] เห็นเลขนับถอยหลังชัดจากท้ายห้อง

---

## Task V7 — เปลี่ยน stack (B12) ⚠️ ตัดสินใจก่อนทำ

STATUS ขอ: *"กลับไปใช้ html ได้ไหม หรือ bun elysia หรือ bun + vite ก็ดีนะ ไม่อยากใช้ pnpm"*

**ข้อเท็จจริง:** เกมนี้ export เป็น static อยู่แล้ว (`next.config.mjs` มี `output: 'export'`, มี `out/index.html`)
ไม่มี server-side อะไรเลย — Next.js ให้แค่ bundler + routing ที่ไม่ได้ใช้

**ทางเลือก:**

| ตัวเลือก | งานที่ต้องทำ | ข้อดี | ข้อเสีย |
|---------|-------------|------|--------|
| **A. Bun + Vite + React** (แนะนำ) | ลบ `next`/`app/`, เพิ่ม `index.html` + `src/main.tsx`, ย้าย `app/globals.css`, ตั้ง `@/` alias ใน `vite.config.ts`, `bun install` | ทิ้ง pnpm ได้, dev เร็วกว่ามาก, component reuse ได้ 100% (ลบแค่ `'use client'`), ใช้ `bun test` แทน vitest ได้ | ต้องแก้ deploy config ของ Vercel |
| B. Bun + Elysia | เหมือน A + server | เผื่อทำ multiplayer/ห้องออนไลน์ทีหลัง | เกมนี้ไม่ต้องใช้ server เลย — over-engineering |
| C. HTML ล้วน | เขียน UI ใหม่หมดด้วย DOM API | ไม่มี build step | ทิ้ง component ~1,400 บรรทัด, ต้องทำ state management เอง, **ไม่แนะนำ** |

**ทำตามลำดับนี้ถ้าเลือก A:**
1. ทำ V1–V6 ให้เสร็จบน stack ปัจจุบันก่อน (logic อยู่ใน `lib/` ซึ่ง framework-agnostic อยู่แล้ว)
2. ค่อยย้าย stack เป็น commit แยก — จะได้แยกแยะว่าพังเพราะ feature ใหม่หรือเพราะย้าย stack
3. `lib/` ทั้งหมดย้ายได้โดยไม่แก้ (ไม่มี import React/Next ตามกฎเดิม) — ตรวจด้วย
   `grep -rn "next/\|from 'react'" lib/` ต้องได้ 0 hit

### DoD
- [ ] `bun run dev` ใช้ได้, `bun run build` ได้ static output
- [ ] ลบ `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `packageManager` field
- [ ] test เดิมทั้งหมดยังผ่าน
- [ ] deploy ขึ้น Vercel แล้วเปิดเล่นได้จริง

---

## Task V8 — E2E test ว่าเล่นได้จริง

**ไฟล์:** `lib/game/playthrough.test.ts` (ใหม่), (ถ้าเลือกทำ) `e2e/` ด้วย Playwright

### V8.1 Headless playthrough (บังคับ — ทำก่อน)
test ที่เล่นเกมจบจริงผ่าน engine ล้วน ไม่แตะ DOM:
```
// สุ่ม seed 50 ค่า แต่ละ seed เล่นจนจบ
// - เลือก action แบบสุ่ม (เปิดช่อง / ใช้การ์ดที่ใช้ได้)
// - ตัดสายแบบสุ่มสี
// invariant ที่ต้องจริงเสมอ:
//   1. เกมจบภายใน N turn (ไม่ infinite loop)
//   2. phase สุดท้าย = 'gameover'
//   3. ทีมที่รอด ≤ 1 หรือ ช่องหมด
//   4. bombsRemaining ไม่เคยติดลบ
//   5. ไม่มีทีมไหนถือการ์ดเกิน maxHandSize
//   6. eliminatedAt ต้องไม่ซ้ำกัน
```
เคสที่ต้องคลุม: cardsEnabled on/off × glitch on/off × shrinking on/off × ทีม 2/6/12

### V8.2 E2E ผ่าน browser (ถ้ามีเวลา)
Playwright: เมนู → ตั้งค่า 3 ทีม → เริ่มเกม → คลิกช่องจนจบ → เห็นหน้า game over → leaderboard มีข้อมูล
คุม RNG ให้ deterministic ด้วย seed จาก query string (`?seed=12345`) เพื่อให้ test ไม่ flaky

### DoD
- [ ] `npx vitest run` — playthrough test ผ่านทุก config combination
- [ ] test จับ B1 ได้ (ถ้า revert V1.1 test ต้องแดง)

---

## ลำดับที่แนะนำ

```
V1 ซ่อมบั๊ก (บล็อกทุกอย่าง — ทำก่อน)
 ├─ V2 เมนู + SweetAlert
 ├─ V3 หน้าตั้งค่า ─┐
 ├─ V4 balance ────┼─ V6 leaderboard + timer
 └─ V5 turn flow ──┘
                    └─ V8 E2E test
                        └─ V7 ย้าย stack (ทำท้ายสุด)
```

**ทำน้อยที่สุดให้เล่นได้:** V1 → V2 → V3
**ตัดสินใจก่อนเริ่ม:** V7 จะเอาทางเลือกไหน (A / B / C)
