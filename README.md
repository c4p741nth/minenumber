# วงระเบิด (Minenumber)

เกมกระดานเลือกตัวเลขสำหรับเล่นในที่ประชุม/งานอีเวนต์ — **MC กดหน้าจอคนเดียว**
ผู้เล่นไม่ต้อง join session ไม่มี network ไม่มี backend เปิดจากไฟล์ก็เล่นได้

---

## วิธีเล่น

1. **ตั้งค่า** — ตั้งชื่อทีม (2–12 ทีม), เลือกจำนวนช่องทั้งหมด (เริ่มจากเลข 1), toggle glitch/การ์ด/Shrinking Mode, ปรับเวลา สแกนรัศมี สัดส่วน glitch แล้วกด **เริ่มเกม**
   - จำนวนระเบิด = ทีม − 1 (ล็อกไว้ เพื่อให้เกมจบเมื่อเหลือ 1 ทีม)
   - ปุ่มเริ่มจะ disable ถ้าช่องน้อยกว่า ทีม × 4
2. **ผลัดกันเปิดป้าย** — แต่ละทีมเลือกเลขบนกระดาน (หรือ MC พิมพ์เลขตรง ๆ)
   - `safe` → ผ่าน ไปทีมถัดไป
   - `real bomb` → เข้าโหมด **ตัดสาย** เลือกแดง/น้ำเงิน (ผลสุ่ม 50/50 ตัดสินไว้ก่อนแล้ว)
   - `glitch bomb` → ไม่ตาย แต่ทีมติด glitch 2 turn ใช้/จั่วการ์ดไม่ได้
3. **การ์ด** — จั่ว 1 ใบเมื่อรอดจบ turn (มือเต็มจั่วไม่เข้า; ถ้าตั้ง "การ์ดเริ่มต้น" ไว้จะแจกตอนเริ่มเกม)
   - 🔍 Scan: มี/ไม่มีระเบิดในช่วง ±R
   - ⏭ Skip: จบ turn ทันที (ไม่ได้จั่ว)
   - 🛡 Block: เป้าหมายใช้การ์ดไม่ได้ในตาถัดไป (ซ้อนชั้นได้)
   - 🔄 Reverse: สลับทิศทาง + จบ turn
   - 🎲 Shuffle: สุ่มย้ายระเบิดทั้งหมด
   - ⚔ Attack: เป้าหมายต้องเปิดเพิ่ม +1 — โอนกองต่อได้ (ใส่คนอื่น รับกองทั้งหมด)
4. **จบเกม** — เหลือ 1 ทีม = ชนะ ทีมที่ตายทีหลังได้อันดับดีกว่า (podium 1-2-3)
   - ช่องหมดแต่เหลือหลายทีม = เสมอกัน

## วิธี run / deploy

```bash
bun install
bun dev          # dev server (Vite)
bun test         # bun test (RNG / engine / cards / crypto / session / playthrough)
bun run build    # สร้าง static build ไปที่ dist/
```

Deploy: เอาไฟล์ใน `dist/` ขึ้น static hosting ใดก็ได้ (GitHub Pages / Vercel / Netlify)
— หรือเปิด `dist/index.html` ตรง ๆ ก็เล่นได้ (ไม่ต้องมี server)

Stack: **Bun + Vite + React + Tailwind** (ไม่ใช้ pnpm/Next อีกแล้ว)
ส่วน `src/lib/` เป็น logic บริสุทธิ์ที่ framework-agnostic — ย้ายไปใช้ที่อื่นได้โดยไม่แก้

## หมายเหตุ (anti-cheat)

- ตำแหน่งระเบิดถูกเก็บใน private state ของ engine (อยู่นอก React tree)
- ตอน autosave ใช้ AES-GCM 256 + เก็บตำแหน่งเป็น HMAC — เปิด DevTools แล้วอ่าน localStorage
  ไม่เห็นตำแหน่งระเบิด
- ข้อจำกัด: นี่คือ **obfuscation ไม่ใช่ security** — key อยู่ใน client bundle ผู้ที่ตั้งใจ
  reverse-engineer ยังถอดได้ เป้าหมายคือกันการแอบดูผ่าน DevTools กลางวงเท่านั้น

## Keyboard (สำหรับ MC)

- พิมพ์เลขตรง ๆ เพื่อเลือกช่อง (หรือกด Enter, พิมพ์ทิ้งไว้ 0.7 วิเปิดอัตโนมัติ)
- `Esc` ยกเลิกตัวเลขที่พิมพ์
- `Space` ยืนยันผลตอนจบโหมดตัดสาย

## โครงสร้าง

```
src/lib/game/        engine บริสุทธิ์ (types, rng, config, engine, setup, cards, balance)
src/lib/storage/     crypto + session + leaderboard (save/load/clear snapshot, settings)
src/lib/audio/       เสียงทั้งหมด generate ด้วย WebAudio API
src/components/      menu, setup, board, game, defuse, cards, effects, gameover, rules
src/App.tsx          สลับหน้าเมนู/ตั้งค่า/กติกา/leaderboard/เกม
```
