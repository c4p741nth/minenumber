// FIX_LISTS ชุดใหม่ #2: โหมดจอ — Laptop (นั่งดูใกล้) vs TV (43" ดูไกล ๆ ในห้องประชุม)
//
// ปัญหา: เอาขึ้น TV 43" ต่อ HDMI จาก laptop 1920x1080 แล้วกด F11 — ตัวอักษรขนาด
// เดิม (body 17px) เล็กเกินกว่าจะอ่านจากระยะ 2–4 เมตร คนท้ายห้องมองไม่เห็นเลขบนกระดาน
//
// วิธีแก้: คูณขนาดทุกอย่างด้วย --mn-scale ตัวเดียว
//   - utility ของ Tailwind (text-lg, gap-4, p-3, …) เป็น rem อยู่แล้ว → ขยับตาม
//     html { font-size } อัตโนมัติ
//   - class ที่เขียนเองใน globals.css เป็น px → เขียนเป็น calc(px * var(--mn-scale))
// ทั้งสองทางใช้ตัวคูณเดียวกัน สัดส่วนหน้าจอจึงไม่เพี้ยน แค่ "ซูมทั้งหน้า"
//
// ไม่ใช้ browser zoom / CSS zoom เพราะ zoom ทำให้ layout breakpoint (lg:) เพี้ยนตาม
// viewport ที่หดลง — panel ขวาจะตกลงมาข้างล่างทั้งที่จอกว้างพอ

export type DisplayMode = 'laptop' | 'tv'

const KEY = 'mn.display'

// ตัวคูณของแต่ละโหมด — laptop = ขนาดเดิมเป๊ะ (1.0) ของเดิมจึงไม่มีอะไรเปลี่ยน
// tv = 1.5 มาจาก: TV 43" ที่ระยะ ~3 ม. ต้องการตัวอักษรราว 1.5 เท่าของระยะนั่งโต๊ะ
// ตัวเลขบนกระดาน 16px → 24px, ชื่อทีม 36px → 54px ซึ่งอ่านออกจากท้ายห้อง
export const DISPLAY_SCALE: Record<DisplayMode, number> = {
  laptop: 1,
  tv: 1.5,
}

// ขนาดฟอนต์ฐานของ html — Tailwind คิด rem จากค่านี้
// 16px คือค่าปกติของ browser; body ยังคุมขนาดตัวอักษรของตัวเองไว้ที่ 17px * scale
const BASE_FONT_PX = 16

export const DISPLAY_LABELS: Record<DisplayMode, { icon: string; name: string; hint: string }> = {
  laptop: { icon: '💻', name: 'โหมด Laptop', hint: 'ขนาดปกติ — นั่งดูหน้าจอใกล้ ๆ' },
  tv: { icon: '📺', name: 'โหมด TV', hint: 'ขยาย 1.5 เท่า — ฉายขึ้นจอใหญ่ให้คนทั้งห้องเห็น' },
}

function isMode(v: unknown): v is DisplayMode {
  return v === 'laptop' || v === 'tv'
}

// ค่าที่ผู้ใช้เลือกไว้ ถ้าไม่มี/เสีย → เดาจากขนาดจอ
export function loadDisplayMode(): DisplayMode {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (isMode(raw)) return raw
  } catch {
    // ignore
  }
  return 'laptop'
}

export function applyDisplayMode(m: DisplayMode): void {
  const root = globalThis.document?.documentElement
  if (!root) return
  const scale = DISPLAY_SCALE[m]
  root.style.setProperty('--mn-scale', String(scale))
  root.style.fontSize = `${BASE_FONT_PX * scale}px`
  // ใช้ทำ selector เฉพาะโหมด (เช่น ซ่อนคอลัมน์ที่ไม่จำเป็นตอนขึ้นจอใหญ่)
  root.dataset.display = m
}

export function setDisplayMode(m: DisplayMode): void {
  applyDisplayMode(m)
  try {
    globalThis.localStorage?.setItem(KEY, m)
  } catch {
    // ignore
  }
}

// bootstrap ระดับ module ตาม pattern เดียวกับ theme.ts — ทาก่อน render ไม่ให้จอกระพริบ
applyDisplayMode(loadDisplayMode())

// FIX_LISTS ชุดที่สาม #11/#13: บางส่วนของ UI ต้อง "หายไป" ตอนขึ้นจอใหญ่ ไม่ใช่แค่โตขึ้น
// (บันทึกใน panel ขวา, สถิติที่คนดูไม่ได้ใช้) — ซ่อนด้วย CSS ไม่ได้ทุกเคส เพราะบางที่
// ต้องเปลี่ยน layout จริง ๆ จึงต้องรู้โหมดใน React ด้วย
// อ่านจาก data-display บน <html> ที่ applyDisplayMode ตั้งไว้ แล้วเฝ้าด้วย MutationObserver
// (ปุ่มสลับโหมดอยู่คนละ subtree — ส่ง prop ลงมาไม่ได้ ต้องดูจาก DOM ตรง ๆ
//  แบบเดียวกับที่ Board ทำกับ --mn-scale)
export function readDisplayMode(): DisplayMode {
  const v = globalThis.document?.documentElement?.dataset?.display
  return isMode(v) ? v : 'laptop'
}

export function subscribeDisplayMode(cb: (m: DisplayMode) => void): () => void {
  const root = globalThis.document?.documentElement
  if (!root || typeof MutationObserver === 'undefined') return () => {}
  const obs = new MutationObserver(() => cb(readDisplayMode()))
  obs.observe(root, { attributes: true, attributeFilter: ['data-display'] })
  return () => obs.disconnect()
}
