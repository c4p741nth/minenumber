import { beforeEach, describe, expect, it } from 'bun:test'
import {
  aggregateByTeam,
  appendMatch,
  clearLeaderboard,
  loadLeaderboard,
  pointsForRank,
  type MatchRecord,
} from './leaderboard'

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
  clearLeaderboard()
})

function record(i: number, teamName: string, rank: number, totalTeams: number): MatchRecord {
  return {
    id: `r-${i}`,
    playedAt: 1000 + i,
    teamName,
    rank,
    totalTeams,
    opens: i,
    defusesSucceeded: 0,
    cardsPlayed: 0,
    survived: rank === 1,
  }
}

describe('pointsForRank', () => {
  it('ชนะ = 3, อันดับ 2 = 2, อันดับ 3 = 1, นอกนั้น 0', () => {
    expect(pointsForRank(1)).toBe(3)
    expect(pointsForRank(2)).toBe(2)
    expect(pointsForRank(3)).toBe(1)
    expect(pointsForRank(4)).toBe(0)
    expect(pointsForRank(9)).toBe(0)
  })
})

describe('appendMatch / loadLeaderboard', () => {
  it('append เกิน 200 → เหลือ 200 แถวล่าสุด', () => {
    const many: MatchRecord[] = []
    for (let i = 0; i < 250; i++) many.push(record(i, 'A', 1, 4))
    appendMatch(many)
    const all = loadLeaderboard()
    expect(all).toHaveLength(200)
    expect(all[0].id).toBe('r-50')
    expect(all[all.length - 1].id).toBe('r-249')
  })

  it('append ครั้งเดียวตอนจบเกม ไม่ซ้ำจาก double mount (เรียก 2 ครั้งก็ไม่ทับ)', () => {
    appendMatch([record(1, 'A', 1, 2), record(2, 'B', 2, 2)])
    appendMatch([record(1, 'A', 1, 2), record(2, 'B', 2, 2)])
    expect(loadLeaderboard()).toHaveLength(4)
  })
})

describe('aggregateByTeam', () => {
  it('คำนวณแต้ม + เกม + ชนะ + เรียงตามแต้มรวม', () => {
    appendMatch([
      record(1, 'A', 1, 3), // A: 3 แต้ม
      record(2, 'B', 2, 3), // B: 2 แต้ม
      record(3, 'C', 3, 3), // C: 1 แต้ม
      record(4, 'B', 1, 3), // B: +3 → 5 แต้ม
      record(5, 'C', 1, 3), // C: +3 → 4 แต้ม
    ])
    const agg = aggregateByTeam(loadLeaderboard())
    expect(agg[0]).toMatchObject({ teamName: 'B', games: 2, wins: 1, points: 5 })
    expect(agg[1]).toMatchObject({ teamName: 'C', games: 2, wins: 1, points: 4 })
    expect(agg[2]).toMatchObject({ teamName: 'A', games: 1, wins: 1, points: 3 })
  })
})