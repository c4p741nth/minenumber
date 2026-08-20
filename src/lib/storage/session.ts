// ============================================================
// ข้อจำกัด (ต้องอ่าน): เช่นเดียวกับ crypto.ts — นี่คือ OBFUSCATION
// ไม่ใช่ SECURITY key อยู่ใน client bundle ผู้ที่ reverse-engineer
// ได้ยังถอดได้ เป้าหมายคือกันการอ่าน localStorage ตรง ๆ
// ============================================================
import { base64ToBytes, bytesToBase64, decrypt, deriveKey, encrypt, hmacNumber } from './crypto'
import type { BombKind, GameSettings, PrivateBombState, PublicGameState } from '../game/types'
import { defaultSettings } from '../game/config'

// ตารางกติกาการเก็บ:
// | settings, ชื่อทีม, mute | mn.prefs        | ไม่เข้ารหัส |
// | game state + ตำแหน่งระเบิด | _nx_c        | เข้ารหัส AES-GCM |
// | deviceSalt               | ui.prefs.v2     | ไม่ (เป็น salt) |
// | sessionId                | mn.sid          | ไม่ (ส่วนหนึ่งของ obfuscation) |
// | per-session salt         | mn.salt         | ไม่ (เป็น salt) |

const SETTINGS_KEY = 'mn.prefs'
const SNAPSHOT_KEY = '_nx_c'
const SESSION_KEY = 'mn.sid'
const SALT_KEY = 'mn.salt'

let keyCache: CryptoKey | null = null
let cachedSessionId: string | null = null

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function getSessionId(): string {
  try {
    const existing = globalThis.localStorage?.getItem(SESSION_KEY)
    if (existing) return existing
  } catch {
    // ignore
  }
  const id = randomHex(16)
  try {
    globalThis.localStorage?.setItem(SESSION_KEY, id)
  } catch {
    // ignore
  }
  return id
}

function readSalt(): Uint8Array | null {
  try {
    const raw = globalThis.localStorage?.getItem(SALT_KEY)
    if (!raw) return null
    return base64ToBytes(raw)
  } catch {
    return null
  }
}

function getOrCreateSalt(): Uint8Array {
  const existing = readSalt()
  if (existing) return existing
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  try {
    globalThis.localStorage?.setItem(SALT_KEY, bytesToBase64(salt.buffer))
  } catch {
    // ignore
  }
  return salt
}

// key เดิม cache ไว้ใน memory — autosave ไม่ต้อง PBKDF2 ซ้ำทุกครั้ง
async function getKey(): Promise<CryptoKey> {
  const sessionId = getSessionId()
  if (keyCache && cachedSessionId === sessionId) return keyCache
  const salt = getOrCreateSalt()
  const key = await deriveKey(sessionId, salt)
  keyCache = key
  cachedSessionId = sessionId
  return key
}

export async function saveSnapshot(state: PublicGameState, secret: PrivateBombState): Promise<void> {
  const key = await getKey()
  // ตำแหน่งระเบิด → HMAC ไม่ใช่เลขดิบ: { "a3f2...": "real" }
  const bombs: Record<string, BombKind> = {}
  for (const [nStr, kind] of Object.entries(secret)) {
    bombs[await hmacNumber(key, Number(nStr))] = kind
  }
  const cipher = await encrypt(key, { state, bombs })
  try {
    globalThis.localStorage?.setItem(SNAPSHOT_KEY, cipher)
  } catch {
    // ignore
  }
}

// ถอด HMAC กลับเป็นเลขจริงโดย HMAC ทุกเลขใน range แล้ว lookup (range ≤ 200 → เร็วมาก)
export async function loadSnapshot(): Promise<{
  state: PublicGameState
  secret: PrivateBombState
} | null> {
  const sessionId = getSessionId()
  const salt = readSalt()
  if (!salt) return null
  try {
    const key = await deriveKey(sessionId, salt)
    const cipher = globalThis.localStorage?.getItem(SNAPSHOT_KEY)
    if (!cipher) return null
    const data = await decrypt<{ state: PublicGameState; bombs: Record<string, BombKind> }>(key, cipher)
    if (!data || !data.state || typeof data.bombs !== 'object') return null

    const { rangeMin, rangeMax } = data.state
    const secret: PrivateBombState = {}
    for (let n = rangeMin; n <= rangeMax; n++) {
      const h = await hmacNumber(key, n)
      const kind = data.bombs[h]
      if (kind) secret[n] = kind
    }
    return { state: data.state, secret }
  } catch {
    return null
  }
}

export async function clearSnapshot(): Promise<void> {
  keyCache = null
  cachedSessionId = null
  try {
    globalThis.localStorage?.removeItem(SNAPSHOT_KEY)
    globalThis.localStorage?.removeItem(SESSION_KEY)
    globalThis.localStorage?.removeItem(SALT_KEY)
  } catch {
    // ignore
  }
}

// settings ไม่เข้ารหัส — ไม่ใช่ความลับ
export function saveSettings(s: GameSettings): void {
  try {
    globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}

export function loadSettings(): GameSettings | null {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<GameSettings>
    if (!parsed || !Array.isArray(parsed.teamNames)) return null
    // backward-compatible: เติม default ให้ field ใหม่ที่ settings เก่าไม่มี (W8.2)
    return { ...defaultSettings(), ...parsed }
  } catch {
    return null
  }
}