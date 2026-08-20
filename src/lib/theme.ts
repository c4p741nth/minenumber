// FIX #41: ธีมสว่าง/มืด + ปุ่มสลับ
//
// ก่อนหน้านี้ `dark:` ทุกจุดในโค้ดเป็น dead code — ไม่มีที่ไหนใส่ class 'dark'
// ให้ element ไหนเลย @custom-variant dark (&:is(.dark *)) จึงไม่เคยยิง
// การเปิดใช้ปุ่มสลับ = `dark:` ทั้งหมดเริ่มทำงานจริงครั้งแรก
export type Theme = 'light' | 'dark'

const KEY = 'mn.theme'
// สีแถบ browser (address bar บนมือถือ) ต้องตรงกับ --background ของแต่ละโหมด
const META_COLOR: Record<Theme, string> = { light: '#f5f3ee', dark: '#0d1117' }

function isTheme(v: unknown): v is Theme {
  return v === 'light' || v === 'dark'
}

// ค่าที่ผู้ใช้เลือกไว้ ถ้าไม่มี/เสีย → ตามการตั้งค่าของเครื่อง
export function loadTheme(): Theme {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (isTheme(raw)) return raw
  } catch {
    // ignore
  }
  try {
    if (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch {
    // ignore — jsdom/happy-dom บางเวอร์ชันไม่มี matchMedia
  }
  return 'light'
}

export function applyTheme(t: Theme): void {
  const root = globalThis.document?.documentElement
  if (!root) return
  root.classList.toggle('dark', t === 'dark')
  // index.html มี meta 2 ตัว (คู่ media light/dark) เป็นค่าตั้งต้นก่อน JS รัน
  // ต้องเขียนทับ "ทุกตัว" + ถอด media ออก ไม่งั้นเครื่องที่ตั้งโหมดมืดไว้แต่ผู้ใช้
  // เลือกธีมสว่าง จะยังเห็นแถบ browser สีเข้มจาก meta ตัวที่ media ยัง match อยู่
  const metas = globalThis.document?.querySelectorAll('meta[name="theme-color"]')
  metas?.forEach((m) => {
    m.removeAttribute('media')
    m.setAttribute('content', META_COLOR[t])
  })
}

export function setTheme(t: Theme): void {
  applyTheme(t)
  try {
    globalThis.localStorage?.setItem(KEY, t)
  } catch {
    // ignore
  }
}

// bootstrap ระดับ module ตาม pattern เดียวกับ loadSfxVolume() ใน sfx.ts
// import ไฟล์นี้ใน main.tsx ก่อน render → ธีมถูกทาก่อน paint ไม่มีจอกระพริบขาว
applyTheme(loadTheme())
