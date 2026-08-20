import { beforeEach, describe, expect, it } from 'bun:test'
import { createGame, createGameFromState } from '../game/engine'
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

  it('settings เก่า (ไม่มี musicUrl/musicVolume) → เติม default ให้ (W8.2 backward-compat)', () => {
    const old = {
      teamNames: ['A', 'B'],
      rangeMin: 1,
      rangeMax: 20,
      turnSeconds: 60,
      glitchEnabled: true,
      glitchMode: 'auto',
      glitchRatio: 0.3,
      glitchCount: 0,
      cardsEnabled: true,
      maxHandSize: 0,
      startingHand: 3,
      scanRadius: 3,
      shrinkingEnabled: false,
    }
    globalThis.localStorage.setItem('mn.prefs', JSON.stringify(old))
    const loaded = loadSettings()
    expect(loaded).not.toBeNull()
    expect(loaded?.musicUrl).toBe('')
    expect(loaded?.musicVolume).toBe(30)
    // field เดิมยังครบ
    expect(loaded?.teamNames).toEqual(['A', 'B'])
    expect(loaded?.rangeMax).toBe(20)
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
    // เปรียบเทียบกับ settings ที่เกมใช้จริง (createGame clamp scanRadius ให้พอดีกระดาน)
    expect(loaded?.state.settings).toEqual(h.getState().settings)
    void settings
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

  it('save → load → createGameFromState กู้เกมกลางคันต่อได้จริง (Task 10 resume)', async () => {
    const { h } = freshGame()
    // เล่นไป 2 ตา
    for (let i = 0; i < 2; i++) {
      const s = h.getState()
      const secret = h.serializeSecret()
      for (let n = s.rangeMin; n <= s.rangeMax; n++) {
        if (!(n in secret) && !(n in s.cells)) {
          h.dispatch({ type: 'OPEN_CELL', cell: n })
          break
        }
      }
    }
    await saveSnapshot(h.getState(), h.serializeSecret())

    const loaded = await loadSnapshot()
    expect(loaded).not.toBeNull()
    const resumed = createGameFromState(loaded!.state, loaded!.secret, 55)
    expect(resumed.getState()).toEqual(loaded!.state)

    // เล่นต่อได้จริง ไม่ crash
    const s2 = resumed.getState()
    const sec2 = resumed.serializeSecret()
    for (let n = s2.rangeMin; n <= s2.rangeMax; n++) {
      if (!(n in sec2) && !(n in s2.cells)) {
        resumed.dispatch({ type: 'OPEN_CELL', cell: n })
        break
      }
    }
  })
})