import { beforeEach, describe, expect, it } from 'vitest'
import { createGame } from '../game/engine'
import { defaultSettings } from '../game/config'
import {
  clearSnapshot,
  loadSettings,
  loadSnapshot,
  saveSettings,
  saveSnapshot,
} from './session'

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

describe('settings', () => {
  it('saveSettings → loadSettings ได้ครบ (ไม่เข้ารหัส)', () => {
    const s = defaultSettings()
    saveSettings(s)
    expect(loadSettings()).toEqual(s)
  })

  it('loadSettings ข้อมูลเสีย → null', () => {
    globalThis.localStorage.setItem('mn.prefs', 'not-json{{{')
    expect(loadSettings()).toBeNull()
    globalThis.localStorage.setItem('mn.prefs', JSON.stringify({ foo: 1 }))
    expect(loadSettings()).toBeNull()
  })

  it('ไม่มี settings → null', () => {
    expect(loadSettings()).toBeNull()
  })
})

describe('snapshot', () => {
  function freshGame() {
    const settings = defaultSettings()
    settings.teamNames = ['A', 'B', 'C']
    settings.rangeMin = 1
    settings.rangeMax = 20
    settings.glitchEnabled = true
    settings.glitchRatio = 0.3
    const h = createGame(settings, 1234)
    return { h, settings, secret: h.serializeSecret() }
  }

  it('saveSnapshot → loadSnapshot กู้ state + ตำแหน่งระเบิดกลับครบ', async () => {
    const { h, settings, secret } = freshGame()
    const state = h.getState()
    await saveSnapshot(state, secret)
    const loaded = await loadSnapshot()
    expect(loaded).not.toBeNull()
    expect(loaded?.state).toEqual(state)
    expect(loaded?.secret).toEqual(secret)
    expect(loaded?.state.settings).toEqual(settings)
  })

  it('ค่าใน localStorage เป็น ciphertext — ตำแหน่งระเบิดไม่อยู่ในรูปแบบอ่านได้', async () => {
    const { h, secret } = freshGame()
    await saveSnapshot(h.getState(), secret)
    const raw = globalThis.localStorage.getItem('_nx_c')
    expect(raw).not.toBeNull()
    // ถ้าเป็น plaintext JSON จะ parse ผ่าน — ciphertext ต้อง parse ไม่ได้
    expect(() => JSON.parse(raw ?? '')).toThrow()
    // โครงสร้าง state (เช่น ชื่อทีม) ต้องไม่หลุดมาเป็น plain text
    expect(raw).not.toContain('teamNames')
    expect(raw).not.toContain('"bombs"')
  })

  it('แก้ค่าใน localStorage มั่ว ๆ → loadSnapshot คืน null (ไม่ crash)', async () => {
    globalThis.localStorage.setItem('_nx_c', 'garbage-!!')
    globalThis.localStorage.setItem('mn.sid', 'whatever')
    globalThis.localStorage.setItem('mn.salt', 'AAAA')
    expect(await loadSnapshot()).toBeNull()
  })

  it('clearSnapshot ลบทุก key ที่ใช้กู้เกม', async () => {
    const { h, secret } = freshGame()
    await saveSnapshot(h.getState(), secret)
    saveSettings(h.getState().settings)
    await clearSnapshot()
    expect(globalThis.localStorage.getItem('_nx_c')).toBeNull()
    expect(globalThis.localStorage.getItem('mn.sid')).toBeNull()
    expect(globalThis.localStorage.getItem('mn.salt')).toBeNull()
    // settings ยังอยู่ (คนละ key)
    expect(globalThis.localStorage.getItem('mn.prefs')).not.toBeNull()
  })
})