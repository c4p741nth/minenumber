import { describe, expect, it } from 'bun:test'
import { defaultTeamNames } from './config'

describe('defaultTeamNames', () => {
  it('ชื่อทีม default เป็นตัวเลข ทีม 1, ทีม 2, …', () => {
    expect(defaultTeamNames(3)).toEqual(['ทีม 1', 'ทีม 2', 'ทีม 3'])
  })

  it('รองรับ 1 ทีมขึ้นไปตามจำนวนที่ขอ', () => {
    expect(defaultTeamNames(1)).toEqual(['ทีม 1'])
    expect(defaultTeamNames(8)).toHaveLength(8)
    expect(defaultTeamNames(8)[7]).toBe('ทีม 8')
  })
})