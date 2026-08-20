# TASKS — Minenumber

**สำหรับ opencode:** ทำทีละ task ตามลำดับ แต่ละ task มี Definition of Done ชัดเจน
อ่าน `docs/GAME_SPEC.md` ก่อนเริ่มทุก task — เป็นแหล่งความจริงของกติกา
ถ้ากติกาใน spec ขัดกับสิ่งที่เขียนใน task ให้ถามก่อน อย่าเดา

**กฎทั่วไป:**
- TypeScript strict — ห้าม `any` ห้าม `@ts-ignore`
- ไฟล์ใน `lib/game/` ห้าม import React หรือ Next.js
- ห้ามเขียนบรรทัดยาวเกิน 120 ตัวอักษร (prototype เดิมยาว 800+ ตัวอักษรต่อบรรทัด — อย่าทำแบบนั้น)
- คอมเมนต์ภาษาไทยได้ ชื่อตัวแปร/ฟังก์ชันเป็นภาษาอังกฤษ
- แต่ละ task = 1 commit

---

## Task 1 — Foundation

**ไฟล์:** `lib/game/types.ts`, `lib/game/rng.ts`, `lib/game/config.ts`, `next.config.mjs`, `tsconfig.json`

### 1.0 ซ่อม .gitignore ก่อนเลย (ทำเป็นอย่างแรก)
`.gitignore` ปัจจุบันมีแค่ 2 บรรทัด (`.vscode`, `.env*`) — **ขาด `node_modules` และ `.next/`**
ส่วน `gitignore.txt` คือไฟล์ที่ v0 ทิ้งไว้และมีกฎที่ถูกต้องอยู่ครบ
→ ย้ายเนื้อหาจาก `gitignore.txt` ไปรวมใน `.gitignore` (เพิ่ม `out/` ด้วย) แล้วลบ `gitignore.txt` และ `env.development.download` (ไฟล์ว่าง) ทิ้ง
ทำก่อนอย่างอื่นเพื่อไม่ให้เผลอ commit `node_modules` เข้า repo

### 1.1 เปิด TypeScript strict
- `tsconfig.json`: `"strict": true`
- `next.config.mjs`: **ลบ** `typescript.ignoreBuildErrors` ออก (ตอนนี้ซ่อน error อยู่)
- เพิ่ม `output: 'export'` — เกมนี้ไม่ต้องมี server
- `app/page.tsx` เดิมอาจ error หลังเปิด strict — ปล่อยไว้ก่อน Task 5 จะเขียนทับทั้งไฟล์

### 1.2 `lib/game/types.ts`
```ts
export type CellState = 'hidden' | 'safe' | 'detonated' | 'defused' | 'glitched'
export type BombKind = 'real' | 'glitch'
export type CardType = 'scan' | 'skip' | 'block' | 'reverse' | 'shuffle' | 'attack'
export type Phase = 'setup' | 'cards' | 'opening' | 'defusing' | 'gameover'

export interface Team {
  id: string
  name: string
  alive: boolean
  hand: CardType[]
  glitchTurnsLeft: number    // >0 = ใช้/จั่วการ์ดไม่ได้
  blockedTurnsLeft: number   // >0 = ใช้การ์ดไม่ได้ (จาก Block)
  pendingOpens: number       // จำนวนป้ายที่ต้องเปิดในตานี้
  eliminatedAt: number | null // ลำดับการตกรอบ (1 = ตายคนแรก)
}

export interface GameSettings {
  teamNames: string[]
  rangeMin: number
  rangeMax: number
  turnSeconds: number        // 0 = ไม่จับเวลา
  glitchEnabled: boolean
  glitchRatio: number        // 0–0.5
  cardsEnabled: boolean
  scanRadius: number         // 1–5
  shrinkingEnabled: boolean  // "โหมดเร่ง" — default false
}

export interface PublicGameState {
  phase: Phase
  settings: GameSettings
  teams: Team[]
  currentTeamIndex: number
  direction: 1 | -1
  cells: Record<number, CellState>
  rangeMin: number           // เปลี่ยนได้ถ้าเปิดโหมดเร่ง
  rangeMax: number
  bombsRemaining: number     // จำนวนเท่านั้น ห้ามมีตำแหน่ง
  turnNumber: number
  log: LogEntry[]
  pendingDefuse: { cell: number } | null
  lastResult: OpenResult | null
}
```
**สำคัญที่สุด:** `PublicGameState` **ห้ามมี field ที่บอกตำแหน่งระเบิดเด็ดขาด** — นี่คือ state ที่ไหลเข้า React
ตำแหน่งระเบิดอยู่ใน private state ของ engine เท่านั้น (Task 3)

เพิ่ม `LogEntry`, `OpenResult`, `GameAction` (discriminated union ของทุก action) ตามที่เห็นสมควร

### 1.3 `lib/game/rng.ts`
Seeded RNG (mulberry32 หรือ xorshift128) — ต้อง deterministic เพื่อเขียน test ได้
```ts
export function createRng(seed: number): () => number
export function randomInt(rng: () => number, min: number, max: number): number
export function pickRandom<T>(rng: () => number, arr: T[]): T
export function shuffle<T>(rng: () => number, arr: T[]): T[]  // Fisher-Yates
export function weightedPick<T>(rng: () => number, items: [T, number][]): T
```
Seed มาจาก `crypto.getRandomValues()` ตอนเริ่มเกม (ไม่ใช่ `Date.now()`)

### 1.4 `lib/game/config.ts`
ค่า default และน้ำหนักการ์ดตาม `GAME_SPEC.md` §2 และ §7.2 — **ห้าม hardcode ตัวเลขเหล่านี้กระจายในไฟล์อื่น**

### DoD
- [ ] `pnpm build` ผ่านโดยไม่มี `ignoreBuildErrors`
- [ ] RNG เดียวกัน seed เดียวกัน → ผลเหมือนกันทุกครั้ง (พิสูจน์ด้วย test)
- [ ] `PublicGameState` ไม่มีตำแหน่งระเบิด (grep หา `bomb` ใน types ต้องเจอแค่ `bombsRemaining`, `BombKind`)

---

## Task 2 — Crypto storage layer

**ไฟล์:** `lib/storage/crypto.ts`, `lib/storage/session.ts`

> ทำคู่ขนานกับ Task 3 ได้ ไม่บล็อกกัน

### 2.1 `lib/storage/crypto.ts` — WebCrypto ล้วน ห้ามลง dependency
```ts
export async function deriveKey(sessionId: string, salt: Uint8Array): Promise<CryptoKey>
export async function encrypt(key: CryptoKey, data: unknown): Promise<string>  // → base64
export async function decrypt<T>(key: CryptoKey, payload: string): Promise<T | null>
export async function hmacNumber(key: CryptoKey, n: number): Promise<string>
```
- AES-GCM 256, IV สุ่ม 12 ไบต์ใหม่ทุกครั้งที่เขียน เก็บ IV ต่อหน้า ciphertext
- Key derivation: `PBKDF2(sessionId + deviceSalt, salt, 100_000, SHA-256)`
- `deviceSalt` สุ่มครั้งแรกแล้วเก็บใน localStorage key `ui.prefs.v2` (ตัวมันเองไม่ลับ)
- `decrypt` ต้องคืน `null` เมื่อ decrypt fail — ห้าม throw ให้ UI พัง

### 2.2 `lib/storage/session.ts`
```ts
export async function saveSnapshot(state: PublicGameState, secret: PrivateBombState): Promise<void>
export async function loadSnapshot(): Promise<{ state; secret } | null>
export async function clearSnapshot(): Promise<void>
export function saveSettings(s: GameSettings): void    // ไม่เข้ารหัส — ไม่ใช่ความลับ
export function loadSettings(): GameSettings | null
```

**กติกาการเก็บที่ต้องทำตามเป๊ะ:**
| ข้อมูล | key | เข้ารหัส |
|---|---|---|
| settings, ชื่อทีม, mute | `mn.prefs` | ไม่ |
| game state + ตำแหน่งระเบิด | `_nx_c` | **ใช่ (AES-GCM)** |
| deviceSalt | `ui.prefs.v2` | ไม่ (เป็น salt ไม่ใช่ secret) |

**ตำแหน่งระเบิดใน snapshot ที่เข้ารหัสแล้ว ให้เก็บเป็น HMAC ไม่ใช่เลขดิบ:**
```ts
// { "a3f2...": "real", "8b1c...": "glitch" }  ← key คือ hmacNumber(n)
```
ตอน resume: HMAC ทุกเลขใน range แล้ว lookup กลับ (range ≤ 200 → เร็วมาก)

**ข้อจำกัดที่ต้องเขียนคอมเมนต์ไว้ในไฟล์ให้ชัด:**
> นี่คือ obfuscation ไม่ใช่ security key อยู่ใน client bundle ผู้ที่ reverse-engineer ได้ยังถอดได้
> เป้าหมายคือกันการเปิด DevTools → localStorage แล้วอ่านตำแหน่งระเบิดตรง ๆ เท่านั้น

### 2.3 Hygiene
- `console.log` ที่แตะ state ระเบิด ต้องห่อ `if (process.env.NODE_ENV !== 'production')`
- ห้ามใส่ตำแหน่งระเบิดใน `data-*` attribute หรือ React props เด็ดขาด

### DoD
- [ ] เปิด DevTools → Application → localStorage แล้ว**หาตำแหน่งระเบิดไม่เจอ** (พิสูจน์ด้วย screenshot ใน PR)
- [ ] refresh กลางเกม → กู้ state กลับได้ครบ รวมตำแหน่งระเบิด
- [ ] แก้ค่าใน localStorage มั่ว ๆ → เกมไม่ crash แค่เริ่มใหม่
- [ ] React DevTools ไม่โชว์ตำแหน่งระเบิดใน props/state ใด ๆ

---

## Task 3 — Game engine (core loop)

**ไฟล์:** `lib/game/engine.ts`, `lib/game/setup.ts`, `lib/game/engine.test.ts`

> ยังไม่ต้องทำการ์ด — Task 7 ค่อยเติม

### 3.1 โครงสร้าง private state
```ts
interface PrivateBombState {
  bombs: Map<number, BombKind>   // ห้ามหลุดออกนอก engine
}
```
Engine export **เฉพาะ** `PublicGameState` + ฟังก์ชันที่คืนผลลัพธ์ ห้าม export `bombs` หรืออะไรที่อนุมานตำแหน่งได้

### 3.2 API
```ts
export function createGame(settings: GameSettings, seed: number): GameHandle
export interface GameHandle {
  getState(): PublicGameState
  dispatch(action: GameAction): PublicGameState
  serializeSecret(): Record<number, BombKind>  // ใช้เฉพาะตอน save เท่านั้น
}
```

### 3.3 Action ที่ต้องรองรับใน task นี้
- `OPEN_CELL(n)` — ตรวจชนิดช่อง → resolve ตาม §4
- `CHOOSE_WIRE('red' | 'blue')` — จบโหมด defuse ตาม §5
- `TIMEOUT` — สุ่มเปิดช่อง hidden ให้ 1 ช่อง
- `END_TURN` — ส่งต่อทีมถัดไปตาม direction

### 3.4 กฎที่พลาดง่าย ระวังให้ดี
1. **Defuse: สุ่มผล ไม่ใช่สุ่มสี** — `survived = rng() < 0.5` ตัดสินตั้งแต่ตอน `OPEN_CELL` ก่อนแสดง modal สีที่เลือกไม่มีผลต่อผลลัพธ์ (§5)
2. **กู้สำเร็จ → ระเบิดย้าย** ไปช่อง `hidden` อื่นแบบสุ่ม ช่องเดิมเป็น `defused` **จบ turn ทันที** ไม่ต้องเปิดต่อแม้ `pendingOpens` ยังเหลือ
3. **กู้ไม่สำเร็จ → ระเบิดหายไป** ไม่ย้าย และทีมตาย
4. **Glitch bomb ไม่ตาย** ติด `glitchTurnsLeft = 2` จบ turn ทันที ไม่ได้จั่วการ์ด
5. **Glitch bomb ไม่นับในโควตา `ทีม−1`** — เป็นระเบิดส่วนเกิน (§4.2)
6. **ทีมตายกลางคัน** → ยกเลิก `pendingOpens` ที่เหลือ
7. **ระเบิดหมดแต่เหลือ >1 ทีม** → เติมระเบิดใหม่ให้ครบ `ทีมที่รอด − 1` + log แจ้ง (§8)
8. **ช่อง hidden หมด** → ทุกทีมที่รอดเสมอกัน
9. **`glitchTurnsLeft` ลดตอนเริ่ม turn ของทีมนั้นเอง** ไม่ใช่ทุก turn ของทุกทีม

### 3.5 Test ที่ต้องมี (vitest — เพิ่ม devDependency)
```
✓ createGame สร้างระเบิด = ทีม−1 พอดี (ไม่นับ glitch)
✓ เปิดช่อง safe → cells[n] = 'safe', turn เดินต่อ
✓ เปิด real bomb → phase = 'defusing'
✓ defuse สำเร็จ → ช่องเป็น defused, bombsRemaining เท่าเดิม, turn จบ
✓ defuse ล้มเหลว → ทีมตาย, bombsRemaining ลด 1
✓ glitch bomb → ทีมไม่ตาย, glitchTurnsLeft = 2
✓ ทีมสุดท้ายรอด → phase = 'gameover', อันดับถูกต้อง
✓ ระเบิดหมดแต่เหลือ 3 ทีม → เติมระเบิดใหม่ 2 ลูก
✓ seed เดียวกัน + action ชุดเดียวกัน → state เหมือนกันทุกครั้ง
✓ getState() ไม่มี field ไหนบอกตำแหน่งระเบิดได้
```

### DoD
- [ ] test ผ่านหมด
- [ ] `grep -r "bombs" lib/game/engine.ts` — `bombs` ไม่เคยหลุดออกนอก module
- [ ] engine ไม่ import React

---

## Task 4 — Setup screen

**ไฟล์:** `components/setup/*`, `app/page.tsx` (route)

- ตั้งชื่อทีม (แก้ inline, เพิ่ม/ลบได้ 2–12 ทีม)
- เลื่อนช่วงตัวเลข a–b พร้อม preview จำนวนช่อง
- แสดง **จำนวนระเบิด = ทีม − 1** (อ่านอย่างเดียว แก้ไม่ได้ พร้อมคำอธิบายว่าทำไม)
- Toggle: glitch bomb, ระบบการ์ด, **โหมดเร่ง (พร้อมคำเตือนว่าเกมจะจบเร็วและความเสี่ยงไม่เท่ากันทุกทีม)**
- Slider: เวลา/turn, scan radius, สัดส่วน glitch
- ปุ่ม "เริ่มเกม" **disable พร้อมข้อความอธิบาย** เมื่อ `ช่อง < ทีม × 4`
- โหลด settings ล่าสุดจาก localStorage อัตโนมัติ
- ถ้าเจอ snapshot ค้าง → ถาม "เล่นเกมเดิมต่อ หรือ เริ่มใหม่?"

### DoD
- [ ] แก้ทุกค่าแล้วเริ่มเกมได้จริง
- [ ] refresh แล้ว settings ยังอยู่
- [ ] ตั้ง 12 ทีมกับช่วง 1–20 → ปุ่มเริ่มถูก disable พร้อมบอกเหตุผล

---

## Task 5 — Board UI + turn flow

**ไฟล์:** `components/board/*`, `components/game/GameProvider.tsx`

Layout 3 คอลัมน์: `[รายชื่อทีม] [กระดานตัวเลข] [log + สถานะ]`

- **กระดาน** — grid responsive ตามขนาด range, ช่องใหญ่พอฉายโปรเจกเตอร์ (ขั้นต่ำ 56px)
- **สีตาม `CellState`** ตาม §3 — ต้องแยกออกจากกันชัดแม้มองไกล
- **ทีมปัจจุบันต้องเด่นมาก** — border เรืองแสง + ชื่อทีมตัวใหญ่ด้านบนกระดาน
- **Timer วงกลม** นับถอยหลัง เปลี่ยนสีเมื่อ <10 วิ (นับเฉพาะ phase `opening`)
- **`pendingOpens` > 1** ต้องเห็นชัด: "ทีม B ต้องเปิดอีก 2 ป้าย"
- **Log** ล่าสุดอยู่บน แสดง 10 รายการ
- ป้าย badge บนชื่อทีม: `glitchTurnsLeft` ⚡, `blockedTurnsLeft` 🛡, `pendingOpens` ⚔

**GameProvider:** ถือ `GameHandle` ใน `useRef` (ไม่ใช่ `useState` — กัน state ระเบิดเข้า React tree), expose แค่ `PublicGameState` + `dispatch`

### DoD
- [ ] เล่นจบเกมได้จริงตั้งแต่ต้นจนจบ (ยังไม่มีการ์ด/เสียงก็ได้)
- [ ] ทีมตกรอบตามลำดับถูกต้อง
- [ ] React DevTools ไม่เห็นตำแหน่งระเบิด
- [ ] ดูบนจอ 1920×1080 แล้วอ่านออกจากระยะ 5 เมตร

---

## Task 6 — Defuse modal

**ไฟล์:** `components/defuse/DefuseModal.tsx`

1. เข้า modal เต็มจอ พื้นหลังมืด + vignette แดงเต้นตามจังหวะ
2. สายแดง/น้ำเงินวาดด้วย SVG ขนาดใหญ่
3. กดเลือก → กรรไกรตัด → **หน่วง 2.5 วินาที** พร้อมเสียง tick (ช่วงลุ้น)
4. เฉลย:
   - **รอด** → สายขาด ไฟดับ, confetti เขียว, ข้อความ "กู้สำเร็จ! ระเบิดย้ายที่แล้ว"
   - **ตาย** → flash แดง + screen shake, "ทีม X ตกรอบ"
5. กด "รับทราบ" → ปิด modal ไปทีมถัดไป

**ห้าม:** เขียนโค้ดที่ผลลัพธ์ขึ้นกับสีที่เลือก ผลถูกตัดสินมาแล้วจาก engine (§5) — modal แค่แสดงผล

### DoD
- [ ] ทดสอบ 20 ครั้ง ผลออกประมาณ 50/50
- [ ] เลือกแดงตลอด 20 ครั้ง ยังได้ประมาณ 50/50 (พิสูจน์ว่าสีไม่มีผล)
- [ ] `prefers-reduced-motion` → ลด animation แต่ยังบอกผลได้ชัด

---

## Task 7 — ระบบการ์ด

**ไฟล์:** `lib/game/cards.ts`, `components/cards/*`, แก้ `engine.ts`

### 7.1 Engine actions เพิ่ม
`PLAY_CARD({ type, targetTeamId?, targetCell? })`, `DRAW_CARD(teamId)`

### 7.2 การ์ดทั้ง 6 ใบตาม §7.2 — จุดที่ต้องระวัง

| การ์ด | จุดพลาดง่าย |
|---|---|
| **Scan** | ตอบแค่ **มี/ไม่มี** ห้ามบอกจำนวนหรือตำแหน่ง; นับช่วง `[n−R, n+R]` ตัดที่ขอบ range; ต้องนับ glitch bomb ด้วย |
| **Skip** | จบ turn ทันที ไม่ต้องเปิดป้าย; **ไม่ได้จั่วการ์ด** (ไม่งั้นจั่วฟรีวนไม่จบ) |
| **Block** | มีผลใน turn **ถัดไป**ของเป้าหมาย ไม่ใช่ทันที; ซ้อนชั้นได้ (`blockedTurnsLeft += 1`) |
| **Reverse** | สลับ direction **แล้วจบ turn ทันที**; ถ้าเหลือ 2 ทีม = Skip เฉย ๆ (ต้องไม่ทำให้ทีมเดิมเล่นซ้ำ) |
| **Shuffle** | ย้ายระเบิดทุกลูกไปช่อง `hidden` ใหม่; ห้ามย้ายไปช่องที่เปิดแล้ว; ไม่ stack |
| **Attack** | เป้าหมาย `pendingOpens += 1`; **โอนกองต่อได้** — ดู 7.3 |

### 7.3 Attack transfer (กลไกสำคัญที่สุด — ทำให้ถูก)
```
สถานะ: A ใช้ Attack ใส่ B สองใบ → B.pendingOpens = 3 (1 ฐาน + 2)
ถึงตา B → B ใช้ Attack ใส่ C
ผล: C.pendingOpens = 1 + 2 + 1 = 4    ← รับกองทั้งหมด + ใบใหม่
     B.pendingOpens = 1                ← กลับเป็นปกติ
     turn จบทันที ไปทีมถัดไป
```
ทีมที่ไม่มี Attack ต้องเปิดเต็มจำนวน
**ต้องมี test เคสนี้โดยเฉพาะ** — เป็นจุดที่ off-by-one พลาดง่ายที่สุด

### 7.4 UI
- มือการ์ดทีมปัจจุบันอยู่ล่างจอ การ์ดหงายเห็นชัด (MC กดคนเดียว ไม่ต้องซ่อน)
- Hover → เห็นคำอธิบาย, กด → เลือกเป้าหมาย (ถ้าต้อง) → ยืนยัน
- ติด glitch/block → การ์ดเทาพร้อมบอกเหตุผลและจำนวน turn ที่เหลือ
- มือเต็ม 5 ใบ → เตือนว่าจั่วไม่เข้าแล้ว

### DoD
- [ ] การ์ดทั้ง 6 ทำงานถูกตาม spec
- [ ] test: attack transfer ตามตัวอย่าง 7.3
- [ ] test: block ซ้อน 2 ชั้น = แบน 2 turn
- [ ] test: reverse ตอนเหลือ 2 ทีม ไม่ทำให้ทีมเดิมเล่นซ้ำ
- [ ] test: scan ที่ขอบ range ไม่ index หลุด
- [ ] test: skip แล้วไม่ได้จั่วการ์ด

---

## Task 8 — Audio + effects

**ไฟล์:** `lib/audio/sfx.ts`, `components/effects/*`

### 8.1 เสียง — generate ด้วย WebAudio API ไม่ใช้ไฟล์ภายนอก
เหตุผล: ไม่ต้องหา asset, ไม่มีปัญหาลิขสิทธิ์, bundle เล็ก, ทำงานได้ offline
```ts
export const sfx = {
  click, tick, explosion, defuseSuccess,
  glitch, cardPlay, timeout, fanfare
}
```
- `explosion` — white noise + lowpass sweep ลง
- `glitch` — square wave + bitcrush + random pitch jump
- `defuseSuccess` — sine chime ไล่ขึ้น 3 โน้ต
- `tick` — short click loop 1Hz
- `fanfare` — arpeggio major

### 8.2 ข้อบังคับ
- **Unlock ด้วย user gesture แรก** (`AudioContext.resume()` ตอนกดเริ่มเกม) ไม่งั้น browser block
- ปุ่ม mute มุมจอ จำค่าใน localStorage
- **`prefers-reduced-motion` → ปิด shake/flash** แต่ยังเล่นเสียงและแสดงข้อความผล

### 8.3 Visual effects (ตาม §10)
screen shake, red flash, confetti (canvas ธรรมดา ไม่ต้องลง lib), RGB split สำหรับ glitch

### DoD
- [ ] ทุกเหตุการณ์มีเสียงตาม §10
- [ ] เปิดหน้าเว็บครั้งแรกแล้วกดเริ่มเกม → เสียงดังทันที ไม่ติด autoplay policy
- [ ] mute แล้วเงียบสนิท และจำค่าหลัง refresh
- [ ] เปิด reduced-motion → ไม่มี shake แต่ยังรู้ผลชัดเจน

---

## Task 9 — Game over + podium

**ไฟล์:** `components/gameover/*`

- Podium อันดับ 1-2-3 + รายการที่เหลือ
- อันดับจาก `eliminatedAt` ย้อนกลับ (ตายท้ายสุด = อันดับสูงกว่า)
- สถิติ: จำนวนป้ายที่เปิด, defuse สำเร็จกี่ครั้ง, การ์ดที่ใช้เยอะสุด
- ปุ่ม "เล่นอีกรอบ" (เก็บ settings + ชื่อทีมเดิม) และ "กลับหน้าตั้งค่า"
- เคสเสมอ (ช่อง hidden หมด) → แสดงว่าเสมอกัน ไม่ใช่บังคับจัดอันดับ

### DoD
- [ ] เล่น 4 ทีมจนจบ → อันดับ 1-4 ถูกต้องตามลำดับตกรอบ
- [ ] "เล่นอีกรอบ" ได้กระดานใหม่ ระเบิดตำแหน่งใหม่ ชื่อทีมเดิม
- [ ] เคสเสมอแสดงผลถูก

---

## Task 10 — Persist + polish

- ต่อ Task 2 เข้ากับ engine — autosave ทุกครั้งที่ state เปลี่ยน (debounce 300ms)
- Resume flow: เปิดหน้าเว็บเจอ snapshot → ถามต่อเกมเดิมไหม
- **Guard `beforeunload`** ระหว่างเกม — กันปิดแท็บพลาดกลางงาน
- ปุ่ม "จบเกมนี้" สำหรับ MC (มี confirm)
- Keyboard: `Esc` ปิด modal, `Space` ยืนยัน, ตัวเลขพิมพ์ตรง ๆ เพื่อเลือกช่อง (MC พิมพ์เร็วกว่าคลิก)
- อัปเดต `README.md` — วิธีเล่น, วิธี deploy, กติกาย่อ
- (การล้าง `gitignore.txt` / `.gitignore` ทำไปแล้วใน Task 1.0)

### DoD
- [ ] refresh กลางเกม → กู้กลับได้ครบทุกอย่างรวมตำแหน่งระเบิด
- [ ] localStorage อ่านไม่ออกด้วยตาเปล่า (screenshot ประกอบ)
- [ ] `pnpm build` ผ่าน สร้าง `out/` ได้
- [ ] เปิด `out/index.html` ตรง ๆ แล้วเล่นได้ (ไม่ต้องมี server)

---

## สรุปลำดับ

```
T1 Foundation
 ├─ T2 Crypto ────────────────┐
 └─ T3 Engine ──┬─ T4 Setup   │
                ├─ T5 Board ──┼─ T6 Defuse
                │             ├─ T7 Cards
                │             ├─ T8 Audio
                │             └─ T9 GameOver
                └─────────────┴─ T10 Persist + polish
```

**เล่นได้เร็วสุด:** T1 → T3 → T5 → T6
**T2 ทำคู่ขนานกับ T3 ได้**
