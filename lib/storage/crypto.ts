// ============================================================
// ข้อจำกัด (ต้องอ่าน): นี่คือ OBFUSCATION ไม่ใช่ SECURITY
// key ถูก derive จากข้อมูลที่อยู่ใน client ทั้งหมด (sessionId +
// deviceSalt + salt อยู่ใน localStorage/bundle) ผู้ที่
// reverse-engineer ได้ยังถอดได้เสมอ
// เป้าหมายคือกันการเปิด DevTools → localStorage แล้วอ่านตำแหน่ง
// ระเบิดตรง ๆ เท่านั้น
// ============================================================
// WebCrypto ล้วน — ห้ามลง dependency ภายนอก

const PBKDF2_ITERATIONS = 100_000
const AES_IV_LENGTH = 12
const DEVICE_SALT_KEY = 'ui.prefs.v2'

export function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// deviceSalt — สุ่มครั้งแรกแล้วเก็บใน localStorage (ตัวมันเองไม่ลับ)
function getDeviceSalt(): string {
  try {
    const existing = globalThis.localStorage?.getItem(DEVICE_SALT_KEY)
    if (existing) return existing
  } catch {
    // localStorage ไม่มี (เช่น test/SSR) — ข้ามไป
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const salt = bytesToBase64(bytes.buffer)
  try {
    globalThis.localStorage?.setItem(DEVICE_SALT_KEY, salt)
  } catch {
    // ignore
  }
  return salt
}

// Key derivation: PBKDF2(sessionId + deviceSalt, salt, 100k, SHA-256) → AES-GCM 256
export async function deriveKey(sessionId: string, salt: Uint8Array): Promise<CryptoKey> {
  const deviceSalt = getDeviceSalt()
  const material = new TextEncoder().encode(sessionId + deviceSalt)
  const baseKey = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    // extractable true — hmacNumber ต้อง export raw เพื่อ import เป็น HMAC key
    true,
    ['encrypt', 'decrypt'],
  )
}

// AES-GCM 256, IV สุ่ม 12 ไบต์ใหม่ทุกครั้งที่เขียน — เก็บ IV ต่อหน้า ciphertext
// รูปแบบ: base64(iv) + ':' + base64(ciphertext)
export async function encrypt(key: CryptoKey, data: unknown): Promise<string> {
  const iv = new Uint8Array(AES_IV_LENGTH)
  crypto.getRandomValues(iv)
  const plaintext = new TextEncoder().encode(JSON.stringify(data))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return `${bytesToBase64(iv.buffer)}:${bytesToBase64(ct)}`
}

// decrypt fail → คืน null เสมอ ห้าม throw ให้ UI พัง
export async function decrypt<T>(key: CryptoKey, payload: string): Promise<T | null> {
  try {
    const sep = payload.indexOf(':')
    if (sep <= 0) return null
    const iv = base64ToBytes(payload.slice(0, sep))
    const ct = base64ToBytes(payload.slice(sep + 1))
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
    return JSON.parse(new TextDecoder().decode(plaintext)) as T
  } catch {
    return null
  }
}

// HMAC-SHA256 ของเลขช่อง → hex — ใช้เป็น key ใน snapshot แทนเลขดิบ
export async function hmacNumber(key: CryptoKey, n: number): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  const hmacKey = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const sig = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(String(n)))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}