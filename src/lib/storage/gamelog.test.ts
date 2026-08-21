import { beforeEach, describe, expect, it } from 'bun:test'
import {
  appendGameLog,
  clearGameLogs,
  loadGameLogs,
  orderedTeamNames,
  type GameLogRecord,
} from './gamelog'

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
  // happy-dom (preload ผ่าน test-setup.ts) ให้ localStorage จริงซึ่งเป็น readonly accessor
  // assign ตรง ๆ จะ throw "Attempted to assign to readonly property" → ต้องใช้ defineProperty
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage(),
    configurable: true,
    writable: true,
  })
  clearGameLogs()
})

function rec(i: number): GameLogRecord {
  return {
    id: `g-${i}`,
    startedAt: 1000 + i,
    endedAt: 2000 + i,
    teamNames: ['A', 'B'],
    turnNumber: i,
    log: [{ id: 1, turn: 1, teamId: null, message: `เกม ${i}`, at: 1500 + i }],
  }
}

describe('gamelog storage (FIX #36)', () => {
  it('roundtrip ครบทุก field รวม log[]', () => {
    appendGameLog(rec(1))
    const out = loadGameLogs()
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual(rec(1))
    expect(out[0].log[0].message).toBe('เกม 1')
  })

  it('เกิน 20 เกม → เหลือ 20 เกมล่าสุด (ตัดหัวทิ้ง ไม่ใช่ตัดท้าย)', () => {
    for (let i = 1; i <= 25; i++) appendGameLog(rec(i))
    const out = loadGameLogs()
    expect(out).toHaveLength(20)
    expect(out[0].id).toBe('g-6')
    expect(out[19].id).toBe('g-25')
  })

  it('record เก่าที่ไม่มี startedAt → โหลดได้ ไม่ถูกทิ้ง (ได้ null แทน)', () => {
    const legacy = { id: 'old', endedAt: 999, teamNames: ['X'], turnNumber: 3, log: [] }
    globalThis.localStorage.setItem('mn.gamelogs', JSON.stringify([legacy]))
    const out = loadGameLogs()
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('old')
    expect(out[0].startedAt).toBeNull()
    expect(out[0].endedAt).toBe(999)
  })

  it('JSON เสีย / ไม่ใช่ array → คืน [] ไม่ throw', () => {
    globalThis.localStorage.setItem('mn.gamelogs', '{ไม่ใช่ json')
    expect(loadGameLogs()).toEqual([])
    globalThis.localStorage.setItem('mn.gamelogs', '{"a":1}')
    expect(loadGameLogs()).toEqual([])
    globalThis.localStorage.setItem('mn.gamelogs', 'null')
    expect(loadGameLogs()).toEqual([])
  })

  // blast radius: ล้าง log ต้องไม่พาคะแนนหายไปด้วย (คนละ key คนละ lifecycle)
  it('clearGameLogs ไม่แตะ mn.leaderboard', () => {
    appendGameLog(rec(1))
    globalThis.localStorage.setItem('mn.leaderboard', '[{"id":"keep"}]')
    clearGameLogs()
    expect(loadGameLogs()).toEqual([])
    expect(globalThis.localStorage.getItem('mn.leaderboard')).toBe('[{"id":"keep"}]')
  })
})

describe('orderedTeamNames', () => {
  it('เรียงชื่อทีมตามอันดับ ที่ 1 → ท้าย', () => {
    const r = rec(1)
    r.rankings = [
      { teamName: 'ทีม 4', rank: 3 },
      { teamName: 'ทีม 2', rank: 2 },
      { teamName: 'ทีม 1', rank: 1 },
    ]
    expect(orderedTeamNames(r)).toEqual(['ทีม 1', 'ทีม 2', 'ทีม 4'])
  })

  it('record เก่าไม่มี rankings → คืนลำดับเดิม (ไม่พัง)', () => {
    expect(orderedTeamNames(rec(1))).toEqual(['A', 'B'])
  })

  it('roundtrip เก็บ rankings ครบ', () => {
    const r = rec(2)
    r.rankings = [
      { teamName: 'X', rank: 2 },
      { teamName: 'Y', rank: 1 },
    ]
    appendGameLog(r)
    expect(loadGameLogs()[0].rankings).toEqual([
      { teamName: 'X', rank: 2 },
      { teamName: 'Y', rank: 1 },
    ])
  })
})
