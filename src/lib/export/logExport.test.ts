import { describe, expect, it } from 'bun:test'
import {
  buildLogCsv,
  buildLogFile,
  buildLogJson,
  buildLogText,
  teamNameOf,
} from './logExport'
import type { GameLogRecord } from '../storage/gamelog'

function sampleRecord(): GameLogRecord {
  return {
    id: 'g1',
    startedAt: 1755730000000,
    endedAt: 1755730600000,
    teamNames: ['ทีมเอ', 'ทีมบี'],
    turnNumber: 4,
    log: [
      { id: 0, turn: 1, teamId: '0', message: 'ทีมเอ เปิด 7 — ปลอดภัย', at: 1755730001000 },
      { id: 1, turn: 2, teamId: '1', message: 'ทีมบี เจอระเบิด ต้องตัดสาย', at: 1755730010000, level: 'warn' },
      { id: 2, turn: 2, teamId: '1', message: 'ทีมบี กู้สำเร็จ! แต่ไม่มีที่ว่างให้ย้ายระเบิด — ระเบิดยังอยู่ที่เดิม', at: 1755730015000, level: 'good' },
      { id: 3, turn: 3, teamId: '0', message: 'ทีมเอ กู้ระเบิดพลาด ถูกคัดออก', at: 1755730020000, level: 'danger' },
      { id: 4, turn: 4, teamId: null, message: 'ทีมบี ชนะ!', at: 1755730030000, level: 'good' },
    ],
  }
}

describe('teamNameOf', () => {
  it('แมป teamId → ชื่อทีม และ null → ระบบ', () => {
    const r = sampleRecord()
    expect(teamNameOf(r, '0')).toBe('ทีมเอ')
    expect(teamNameOf(r, '1')).toBe('ทีมบี')
    expect(teamNameOf(r, null)).toBe('ระบบ')
    // teamId ไม่อยู่ในช่วง → คืนตัวเลขเดิม ไม่ crash
    expect(teamNameOf(r, '9')).toBe('9')
  })
})

describe('buildLogText', () => {
  const txt = buildLogText(sampleRecord(), false)

  it('มีหัวเกมและรายละเอียดเกม', () => {
    expect(txt).toContain('Minenumber — บันทึกผลการเล่น')
    expect(txt).toContain('ทีม: ทีมเอ · ทีมบี')
    expect(txt).toContain('จำนวนรอบ: 4')
    expect(txt).toContain('เริ่มเกม:')
    expect(txt).toContain('จบเกม:')
  })

  it('ทุกบรรทัดมีเวลา รอบ และชื่อทีม', () => {
    expect(txt).toContain('· [22:46:41 · รอบ 1 · ทีมเอ] ทีมเอ เปิด 7 — ปลอดภัย')
    expect(txt).toContain('· [22:46:50 · รอบ 2 · ทีมบี] [WARN] ทีมบี เจอระเบิด ต้องตัดสาย')
    expect(txt).toContain('· [22:47:00 · รอบ 3 · ทีมเอ] [DANGER] ทีมเอ กู้ระเบิดพลาด ถูกคัดออก')
    expect(txt).toContain('· [22:47:10 · รอบ 4 · ระบบ] [GOOD] ทีมบี ชนะ!')
  })

  it('เกมที่ไม่มี log → บอกว่าไม่มีเหตุการณ์', () => {
    const empty = { ...sampleRecord(), log: [] }
    expect(buildLogText(empty, false)).toContain('ไม่มีเหตุการณ์ในเกมนี้')
  })
})

describe('buildLogText markdown', () => {
  const md = buildLogText(sampleRecord(), true)

  it('ใช้ syntax markdown', () => {
    expect(md).toContain('# Minenumber — บันทึกผลการเล่น')
    expect(md).toContain('## ลำดับเหตุการณ์')
    expect(md).toContain('- **ทีม:** ทีมเอ · ทีมบี')
    expect(md).toContain('- [')
    expect(md).toContain('---')
  })
})

describe('buildLogCsv', () => {
  it('มี header และข้อมูลครบทุกแถว', () => {
    const csv = buildLogCsv(sampleRecord())
    const rows = csv.split('\n')
    expect(rows[0]).toBe('turn,time,team,level,message')
    expect(rows).toHaveLength(6)
    expect(rows[1]).toContain('1,')
    expect(rows[1]).toContain('ทีมเอ')
    expect(rows[2]).toContain(',warn,')
    expect(rows[4]).toContain(',danger,')
    expect(rows[5]).toContain('ระบบ')
  })

  it('escape เครื่องหมายจุลภาค/คำพูดในข้อความ', () => {
    const r: GameLogRecord = {
      ...sampleRecord(),
      log: [{ id: 0, turn: 1, teamId: '0', message: 'ข้อความ,มีคอมม่า "และคำพูด"', at: 1 }],
    }
    const csv = buildLogCsv(r)
    expect(csv).toContain('"ข้อความ,มีคอมม่า ""และคำพูด"""')
  })
})

describe('buildLogJson', () => {
  it('ได้ JSON ครบทั้ง record (pretty print)', () => {
    const r = sampleRecord()
    const parsed = JSON.parse(buildLogJson(r)) as GameLogRecord
    expect(parsed.id).toBe('g1')
    expect(parsed.teamNames).toEqual(['ทีมเอ', 'ทีมบี'])
    expect(parsed.log).toHaveLength(5)
    expect(buildLogJson(r)).toContain('\n  "id"')
  })
})

describe('buildLogFile', () => {
  it('map format → ext/mime ถูกต้อง', () => {
    const r = sampleRecord()
    expect(buildLogFile(r, 'json').ext).toBe('json')
    expect(buildLogFile(r, 'txt').ext).toBe('txt')
    expect(buildLogFile(r, 'md').ext).toBe('md')
    expect(buildLogFile(r, 'csv').ext).toBe('csv')
    expect(buildLogFile(r, 'csv').mime).toBe('text/csv')
  })
})