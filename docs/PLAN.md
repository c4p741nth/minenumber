# PLAN — Minenumber

## สถานะปัจจุบันของ repo

| ส่วน | สถานะ |
|---|---|
| Next.js 16 + React 19 + Tailwind 4 | ✅ ติดตั้งแล้ว |
| shadcn (`components/ui/button.tsx`) | ✅ มีแค่ button ตัวเดียว |
| `app/page.tsx` | ⚠️ prototype จาก v0 — logic ทั้งเกมยัดใน component เดียว, บรรทัดยาวมาก, ไม่มี item/defuse/เสียง/persist |
| `lib/utils.ts` | ✅ มีแค่ `cn()` |
| Backend / API | ❌ ไม่มี และ **ไม่ต้องมี** |

---

## การตัดสินใจทางสถาปัตยกรรม

### 1. ใช้ React ต่อ ไม่ใช้ HTML เปล่า
State ของเกมนี้ซับซ้อนพอตัว — ทีม, ระเบิดหลายชนิด, มือการ์ด 12 ทีม, attack stack, glitch counter, timer, ทิศทาง turn
เขียนด้วย vanilla DOM ต้อง sync UI เองทุกจุด ราว 500+ บรรทัดของ boilerplate ที่ `useReducer` ตัวเดียวทำได้
บวกกับ Tailwind/fonts/shadcn ที่ติดตั้งไว้แล้ว — รื้อไปเป็น HTML คือถอยหลัง

### 2. Static export — ไม่มี server
MC กดเครื่องเดียว ผู้เล่นไม่ join session (`concept.md:20`) → ไม่ต้องมี API, DB, หรือ realtime
ตั้ง `output: 'export'` ใน `next.config.mjs` → deploy เป็น static site ได้ (GitHub Pages / Vercel / เปิดจากไฟล์ก็ได้)
ข้อดีเพิ่ม: เล่นได้แม้เน็ตหลุดกลางงาน

### 3. แยก game engine ออกจาก UI เด็ดขาด
```
lib/game/           ← pure TypeScript ไม่ import React เลย
  types.ts          ← type ทั้งหมด
  rng.ts            ← seeded RNG (ทำให้ test ได้)
  engine.ts         ← reducer: (state, action) => state
  cards.ts          ← logic การ์ดแต่ละใบ
  setup.ts          ← สร้าง state เริ่มต้น + validate settings
lib/storage/
  crypto.ts         ← AES-GCM ผ่าน WebCrypto
  session.ts        ← save/load/clear เกม
lib/audio/
  sfx.ts            ← เสียงทั้งหมด (WebAudio generated)
```
เหตุผล: engine ที่เป็น pure function ทำให้เขียน unit test ได้จริง และ opencode แก้กติกาได้โดยไม่แตะ UI

### 4. State ระเบิดไม่โผล่ใน React tree
ตำแหน่งระเบิดเก็บใน module-scope closure ของ engine ไม่ผ่าน `useState` — React DevTools จะเห็นแค่ `revealedCells` กับ `teams` ไม่เห็นว่าระเบิดอยู่ไหน
Component ถามได้แค่ผ่านฟังก์ชัน `resolveCell(n)` ที่คืนผลลัพธ์ ไม่คืนแผนที่

---

## เรื่อง localStorage encryption — พูดให้ตรง

**สิ่งที่ทำได้:** ทำให้การโกงต้องใช้ความรู้ระดับ reverse-engineer bundle ไม่ใช่แค่เปิด DevTools → Application → localStorage แล้วอ่าน
**สิ่งที่ทำไม่ได้:** กันคนที่ตั้งใจโกงจริงจัง เพราะ key อยู่ใน client code เสมอ ไม่มีทางเลี่ยงถ้าไม่มี server

สำหรับเกมในที่ประชุม ระดับแรกเพียงพอ — คนดูข้าง ๆ ที่แอบเปิด DevTools จะเห็นแค่ base64 มั่ว ๆ

**3 ชั้นที่จะทำ:**
1. **AES-GCM 256** — key จาก `PBKDF2(deviceSalt + sessionId, 100k iterations)`, IV สุ่มใหม่ทุกครั้งที่เขียน
2. **ไม่เก็บเลขระเบิดตรง ๆ** — เก็บ `HMAC-SHA256(number, sessionKey)` ของแต่ละช่องที่มีระเบิด ตอนเปิดป้ายค่อย HMAC เทียบ ต่อให้ decrypt ได้ก็เห็นแค่ hash (brute-force 200 เลขได้ในทางทฤษฎี แต่ต้องได้ sessionKey มาก่อน)
3. **ชื่อ key หลอก** — `_nx_c`, `ui.prefs.v2` ไม่ใช่ `bombs` / `gameState`

**สิ่งที่ localStorage ใช้จริง:** กู้เกมตอน browser refresh หลุด + เก็บ settings/ชื่อทีม/mute เท่านั้น ระหว่างเล่นปกติ state อยู่ใน memory

---

## เรื่อง range shrinking — ทำไมถึงปิดไว้ default

คำถามที่ถามมาถูกจุด ลองคำนวณ 6 ทีม (5 ระเบิด) เริ่ม 1–100:

| รอบ | ช่องเหลือ | ระเบิดเหลือ | density | โอกาสตายต่อการกด |
|---|---|---|---|---|
| 1 | 100 | 5 | 5% | 5% |
| 3 | ~50 | 5 | 10% | 10% |
| 5 | ~25 | 4 | 16% | 16% |
| 7 | ~12 | 3 | 25% | 25% |
| 9 | ~6 | 2 | 33% | 33% |

**ปัญหา 3 ข้อ:**
1. **จบเร็วเกินไป** — ประมาณ 8-12 รอบก็เหลือทีมเดียว จั่วการ์ดยังไม่ทันครบมือ ระบบการ์ดที่ออกแบบมาแทบไม่ได้ใช้
2. **ไม่แฟร์** — ทีมที่เล่นรอบท้ายเสี่ยง 33% ทีมรอบแรกเสี่ยง 5% ทั้งที่ไม่ได้ทำอะไรผิด แพ้เพราะลำดับที่นั่ง
3. **ระเบิดเกาะกลุ่มโดยธรรมชาติ** — พอ range แคบ ระเบิดถูกบีบให้อยู่ใกล้กัน การเดาแบบ "เว้นระยะจากจุดที่เพื่อนโดน" ใช้ไม่ได้

**บั๊กใน prototype ปัจจุบัน** (`app/page.tsx:29`): เรียก `randomBombs()` ใหม่ทุกครั้งที่หด = สุ่มระเบิดใหม่ทั้งหมดทุกตา ข้อมูลที่ผู้เล่นสะสมถูกล้างทุกรอบ และการ์ด Scan จะไร้ความหมายสิ้นเชิง

**สรุปการตัดสินใจ:**
- **เก็บไว้เป็น setting** ชื่อ "โหมดเร่ง" ปิดไว้ default (ไม่ทิ้งของที่ทำมา)
- ถ้าเปิด ต้องคุม density ตามกฎใน `GAME_SPEC.md` ข้อ 9 (ไม่ย้ายระเบิดที่ยังอยู่ใน range, หยุดหดที่ density 30%)
- **ทางที่แนะนำกว่าถ้าอยากให้เกมสั้น:** ลด range เริ่มต้นเป็น 1–30 หรือ 1–40 แทน — สั้นเหมือนกันแต่ density คงที่ตลอดเกม ผมตั้ง default ไว้ที่ **1–60** ซึ่งสมดุลสำหรับ 6 ทีม

---

## ข้อตัดสินใจอื่นที่ concept.md เปิดค้างไว้

| ประเด็นใน concept.md | ตัดสินใจ | เหตุผล |
|---|---|---|
| Ability point หรือการ์ดสุ่ม | **การ์ดสุ่ม** ตัด ability point ทิ้ง | ไม่ต้อง design economy ทั้งระบบ, ลด UI, จั่วอัตโนมัติเมื่อรอด — เข้าใจง่ายกว่าสำหรับผู้เล่นที่เพิ่งเจอเกมครั้งแรก |
| Card stack ได้ไหม | **ได้** — Attack โอนกองต่อได้, Block ซ้อนชั้นได้ | ตรงกับข้อ 14 "ไม่ให้เกมเงียบ" การส่งต่อ attack คือจุดที่ทีมจะเถียงกันเสียงดังที่สุด |
| Glitch bomb เอาไหม | **เอา** เป็นระเบิดชนิดที่ 2 | เพิ่มความหลากหลายโดยไม่เพิ่มความเสี่ยงตาย และเป็นตัวถ่วงคนที่กองการ์ดไว้เยอะ |
| Scan radius เท่าไหร่ | **±3** ปรับได้ใน settings | balance ทีหลังได้โดยไม่แก้โค้ด |
| ทำยังไงไม่ให้เกมเงียบ | ดูตารางล่าง | — |

### กลไกกันเกมเงียบ (concept.md ข้อ 14)
1. **Timer นับถอยหลัง** — บีบให้ต้องตัดสินใจ ไม่ให้คิดเงียบ ๆ ยาว
2. **Attack ส่งต่อได้** — สร้างการเจรจา/แก้แค้นระหว่างทีม
3. **Scan ให้ข้อมูลไม่ครบ** (บอกแค่ มี/ไม่มี ไม่บอกตำแหน่ง) — ทีมต้องเถียงกันว่าจะตีความยังไง
4. **Defuse modal หน่วง 2-3 วินาที** — ช่วงเงียบก่อนเฉลยคือช่วงที่คนลุ้นเสียงดังที่สุด
5. **เสียงและ effect ทุกเหตุการณ์** — ตามข้อ 18 ของ concept.md

---

## Phase overview

| Phase | Task | ผลลัพธ์ | พึ่งพา |
|---|---|---|---|
| 0 | 1 | Foundation — types, RNG, config, static export | — |
| 1 | 2 | Crypto storage layer | T1 |
| 1 | 3 | Game engine (core loop, ไม่มีการ์ด) | T1 |
| 2 | 4 | Setup screen | T1, T3 |
| 2 | 5 | Board UI + turn flow | T3 |
| 3 | 6 | Defuse modal | T3, T5 |
| 3 | 7 | ระบบการ์ดครบ 6 ใบ | T3, T5 |
| 4 | 8 | Audio + effects | T5, T6 |
| 4 | 9 | Game over + podium | T3, T5 |
| 5 | 10 | Persist + resume + polish | T2, ทั้งหมด |

**เส้นทางที่เล่นได้เร็วที่สุด:** T1 → T3 → T5 → T6 (จบแล้วเกมเล่นได้จริงแบบไม่มีการ์ด/เสียง)
T2 (crypto) ทำคู่ขนานกับ T3 ได้ ไม่บล็อกกัน

รายละเอียดแต่ละ task อยู่ใน `TASKS.md`
