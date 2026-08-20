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
