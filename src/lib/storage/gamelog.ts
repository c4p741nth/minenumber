// FIX #36: ประวัติ log เต็มเกมย้อนหลัง — plain JSON เหมือน leaderboard (ไม่ใช่ความลับ)
//
// ทำไมต้องแยก key จาก 'mn.leaderboard':
// leaderboard เก็บ 1 record ต่อ 1 "ทีม" cap 200 แถว ถ้ายัด log เต็มเกมลงไปด้วย
// (~48KB ต่อเกม × 200) จะเกิน quota ~5MB — และ appendMatch เขียนทับทั้ง array
// ใน try/catch เปล่า พอ quota เต็มครั้งหนึ่ง การเขียน "คะแนน" ทุกครั้งต่อจากนั้น
// จะ throw แล้วถูกกลืนเงียบ ๆ leaderboard freeze ถาวร แยก key แล้ว log ล้น
// จะไม่บล็อกคะแนน
//
// key นี้ต้องไม่ทับ _nx_c / mn.sid / mn.salt (clearSnapshot ลบ 3 ตัวนั้นตอนเกมจบ
// พร้อมกันกับที่ GameOverScreen เขียน record — key แยกทำให้ race นี้ไม่มีผล)
import type { LogEntry } from '../game/types'

const KEY = 'mn.gamelogs'
const MAX_GAMES = 20

export interface GameLogRecord {
  id: string
  // null = เกมที่เล่นก่อนอัปเกรด (engine ยังไม่มี startedAt) — UI โชว์ '—'
  startedAt: number | null
  endedAt: number
  teamNames: string[]
  turnNumber: number
  log: LogEntry[]
}

function emptyRecord(): GameLogRecord {
  return { id: '', startedAt: null, endedAt: 0, teamNames: [], turnNumber: 0, log: [] }
}

export function loadGameLogs(): GameLogRecord[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    // additive-default idiom เดียวกับ loadSettings — ไม่ใช้ strict predicate
    // เพราะ .filter() ที่เข้มเกินไปจะ "ทิ้งประวัติผู้ใช้เงียบ ๆ" เมื่อรูป record
    // เปลี่ยนในอนาคต field ที่ขาดได้ default แทนที่จะทำให้ทั้งแถวหาย
    return parsed
      .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
      .map((r) => ({ ...emptyRecord(), ...r }) as GameLogRecord)
  } catch {
    return []
  }
}

export function appendGameLog(rec: GameLogRecord): void {
  const trimmed = [...loadGameLogs(), rec].slice(-MAX_GAMES)
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(trimmed))
  } catch {
    // ignore — log เก็บไม่ได้ต้องไม่ล้มอย่างอื่น
  }
}

export function clearGameLogs(): void {
  try {
    globalThis.localStorage?.removeItem(KEY)
  } catch {
    // ignore
  }
}
