import { beforeEach, describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, decrypt, deriveKey, encrypt, hmacNumber } from './crypto'

function mockStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v)
    },
    removeItem: (k) => {
      map.delete(k)
    },
    clear: () => {
      map.clear()
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size
    },
  }
}

beforeEach(() => {
  globalThis.localStorage = mockStorage()
})

const salt = new Uint8Array(16).fill(7)

describe('crypto', () => {
  it('deriveKey: sessionId + salt เดียวกัน → key เดียวกัน', async () => {
    const k1 = await deriveKey('game-1', salt)
    const k2 = await deriveKey('game-1', salt)
    const r1 = new Uint8Array(await crypto.subtle.exportKey('raw', k1))
    const r2 = new Uint8Array(await crypto.subtle.exportKey('raw', k2))
    expect(Array.from(r1)).toEqual(Array.from(r2))
  })

  it('deriveKey: sessionId ต่างกัน → key ต่างกัน', async () => {
    const k1 = await deriveKey('game-1', salt)
    const k2 = await deriveKey('game-2', salt)
    const r1 = new Uint8Array(await crypto.subtle.exportKey('raw', k1))
    const r2 = new Uint8Array(await crypto.subtle.exportKey('raw', k2))
    expect(Array.from(r1)).not.toEqual(Array.from(r2))
  })

  it('encrypt → decrypt ได้ข้อมูลกลับครบ', async () => {
    const key = await deriveKey('game-1', salt)
    const payload = await encrypt(key, { a: 1, b: 'text', c: [true, false] })
    const out = await decrypt<{ a: number; b: string; c: boolean[] }>(key, payload)
    expect(out).toEqual({ a: 1, b: 'text', c: [true, false] })
  })

  it('decrypt ข้อมูลปลอม/แก้ไข → null (ไม่ throw)', async () => {
    const key = await deriveKey('game-1', salt)
    const payload = await encrypt(key, { secret: 42 })
    const tampered = payload.slice(0, -4) + 'AAAA'
    expect(await decrypt(key, tampered)).toBeNull()
    expect(await decrypt(key, 'garbage')).toBeNull()
    expect(await decrypt(key, '')).toBeNull()
  })

  it('decrypt ด้วย key ผิด → null', async () => {
    const key1 = await deriveKey('game-1', salt)
    const key2 = await deriveKey('game-2', salt)
    const payload = await encrypt(key1, { x: 1 })
    expect(await decrypt(key2, payload)).toBeNull()
  })

  it('hmacNumber: deterministic และต่างกันต่อเลข', async () => {
    const key = await deriveKey('game-1', salt)
    const a1 = await hmacNumber(key, 5)
    const a2 = await hmacNumber(key, 5)
    const b = await hmacNumber(key, 6)
    expect(a1).toBe(a2)
    expect(a1).not.toBe(b)
    expect(a1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('base64 roundtrip', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255])
    const b64 = bytesToBase64(bytes.buffer)
    expect(Array.from(base64ToBytes(b64))).toEqual([0, 1, 2, 250, 255])
  })
})