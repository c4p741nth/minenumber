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

describe('pointsForRank (FIX #37)', () => {
  it('8 ทีม → ที่ 1 ได้ 7 แต้ม ลดหลั่นทีละ 1 ทีมสุดท้ายได้ 0', () => {
    expect(pointsForRank(1, 8)).toBe(7)
    expect(pointsForRank(2, 8)).toBe(6)
    expect(pointsForRank(7, 8)).toBe(1)
    expect(pointsForRank(8, 8)).toBe(0)
  })

  it('จำนวนทีมน้อยลง แต้มสูงสุดก็ลดตาม', () => {
    expect(pointsForRank(1, 2)).toBe(1)
    expect(pointsForRank(2, 2)).toBe(0)
    expect(pointsForRank(1, 4)).toBe(3)
  })

  it('อันดับเกินจำนวนทีม → 0 (ไม่ติดลบ)', () => {
    expect(pointsForRank(9, 8)).toBe(0)
    expect(pointsForRank(12, 4)).toBe(0)
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
    // FIX #37: เกม 3 ทีม → ที่ 1 ได้ 2 แต้ม, ที่ 2 ได้ 1, ที่ 3 ได้ 0
    appendMatch([
      record(1, 'A', 1, 3), // A: 2 แต้ม
      record(2, 'B', 2, 3), // B: 1 แต้ม
      record(3, 'C', 3, 3), // C: 0 แต้ม
      record(4, 'B', 1, 3), // B: +2 → 3 แต้ม
      record(5, 'C', 1, 3), // C: +2 → 2 แต้ม
    ])
    const agg = aggregateByTeam(loadLeaderboard())
    expect(agg[0]).toMatchObject({ teamName: 'B', games: 2, wins: 1, points: 3 })
    // C กับ A ได้ 2 แต้มเท่ากัน → เรียงตามชนะ (เท่ากัน) แล้วชื่อ
    expect(agg[1]).toMatchObject({ teamName: 'A', games: 1, wins: 1, points: 2 })
    expect(agg[2]).toMatchObject({ teamName: 'C', games: 2, wins: 1, points: 2 })
  })
})