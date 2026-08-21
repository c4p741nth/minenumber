import { describe, expect, it } from 'bun:test'
import {
  computeRankings,
  finalPlaceOfDead,
  medalClass,
  MEDAL_EMOJI,
  visibleMedal,
} from './ranking'
import type { CardType, Team } from './types'

function team(id: string, alive: boolean, eliminatedAt: number | null = null): Team {
  return {
    id,
    name: id,
    alive,
    hand: [],
    glitchTurnsLeft: 0,
    blockedTurnsLeft: 0,
    shieldCharges: 0,
    pendingAttacks: [],
    pendingOpens: 1,
    eliminatedAt,
    stats: {
      opens: 0,
      turnsSurvived: 0,
      defusesSucceeded: 0,
      cardsPlayed: {} as Record<CardType, number>,
      cardsDiscarded: 0,
    },
  }
}

describe('computeRankings', () => {
  it('เหลือทีมรอดหลายทีม → ทุกทีมที่รอดได้ที่ 1 + isDraw', () => {
    const { rankings, isDraw, noWinner } = computeRankings([
      team('A', true),
      team('B', true),
      team('C', false, 1),
    ])
    expect(isDraw).toBe(true)
    expect(noWinner).toBe(false)
    expect(rankings.filter((r) => r.rank === 1).map((r) => r.team.id).sort()).toEqual(['A', 'B'])
    expect(rankings.find((r) => r.team.id === 'C')?.rank).toBe(2)
  })

  it('เหลือทีมรอด 1 ทีม → ทีมตายเรียง eliminatedAt มาก→น้อย ได้ที่ 2+', () => {
    const { rankings, isDraw, noWinner } = computeRankings([
      team('A', false, 1),
      team('B', false, 2),
      team('C', true),
      team('D', false, 3),
    ])
    expect(isDraw).toBe(false)
    expect(noWinner).toBe(false)
    const byId = new Map(rankings.map((r) => [r.team.id, r.rank]))
    expect(byId.get('C')).toBe(1)
    // ตายทีหลังสุด (eliminatedAt 3) = อันดับดีกว่า
    expect(byId.get('D')).toBe(2)
    expect(byId.get('B')).toBe(3)
    expect(byId.get('A')).toBe(4)
  })

  it('ตายหมด → noWinner และตายทีหลังสุดได้ที่ 1', () => {
    const { rankings, isDraw, noWinner } = computeRankings([
      team('A', false, 1),
      team('B', false, 2),
    ])
    expect(noWinner).toBe(true)
    expect(isDraw).toBe(false)
    expect(rankings.find((r) => r.rank === 1)?.team.id).toBe('B')
    expect(rankings.find((r) => r.rank === 2)?.team.id).toBe('A')
  })

  it('teams ว่าง → ไม่ throw และคืนลิสต์ว่าง', () => {
    const { rankings, isDraw, noWinner } = computeRankings([])
    expect(rankings).toEqual([])
    expect(isDraw).toBe(false)
    expect(noWinner).toBe(true)
  })
})

describe('finalPlaceOfDead (FIX #38)', () => {
  it('4 ทีม: ตายคนแรกได้ที่ 4, ตายคนที่ 3 ได้ที่ 2', () => {
    expect(finalPlaceOfDead(4, 1)).toBe(4)
    expect(finalPlaceOfDead(4, 2)).toBe(3)
    expect(finalPlaceOfDead(4, 3)).toBe(2)
  })
})

describe('visibleMedal (FIX #38 — progressive reveal)', () => {
  it('ระหว่างเล่น: ทีมที่ยังรอดไม่ได้เหรียญ (ทอง/เงินยังไม่รู้ผล)', () => {
    // rank 1 ระหว่างเล่นคือ "ยังไม่ตาย" ไม่ใช่ "ชนะแล้ว" — ต้องไม่โชว์ทอง
    expect(visibleMedal(team('A', true), 4, false, 1)).toBeNull()
  })

  it('ระหว่างเล่น: ทีมที่ตายจนเหลือ 3 ทีม ได้ทองแดง', () => {
    // 4 ทีม ตายคนที่ 2 → อันดับสุดท้าย = 3 → ทองแดงโผล่ตอนเหลือ 3 ทีมพอดี
    expect(visibleMedal(team('B', false, 2), 4, false, 2)).toBe(3)
  })

  it('ระหว่างเล่น: ทีมที่ตายก่อนหน้านั้นไม่ได้เหรียญ (ที่ 4)', () => {
    expect(visibleMedal(team('C', false, 1), 4, false, 3)).toBeNull()
  })

  it('จบเกม: โชว์ครบ 1-2-3 และที่ 4+ ไม่มีเหรียญ', () => {
    expect(visibleMedal(team('A', true), 4, true, 1)).toBe(1)
    expect(visibleMedal(team('B', false, 3), 4, true, 2)).toBe(2)
    expect(visibleMedal(team('C', false, 2), 4, true, 3)).toBe(3)
    expect(visibleMedal(team('D', false, 1), 4, true, 4)).toBeNull()
  })
})

describe('medalClass / MEDAL_EMOJI', () => {
  it('อันดับ 1-3 มี class, อันดับ 4+ คืน ตัวว่าง', () => {
    expect(medalClass(1)).not.toBe('')
    expect(medalClass(2)).not.toBe('')
    expect(medalClass(3)).not.toBe('')
    expect(medalClass(4)).toBe('')
    expect(medalClass(0)).toBe('')
  })

  it('ทุกอันดับที่มีเหรียญต้องมีทั้งสีขอบและคู่ dark: (ข้อ 41 จะเปิดโหมดมืดจริง)', () => {
    for (const r of [1, 2, 3]) {
      expect(medalClass(r)).toContain('border-')
      expect(medalClass(r)).toContain('dark:')
    }
  })

  it('MEDAL_EMOJI มี 3 ตัวเรียงทอง เงิน ทองแดง', () => {
    expect(MEDAL_EMOJI).toEqual(['🥇', '🥈', '🥉'])
  })
})
