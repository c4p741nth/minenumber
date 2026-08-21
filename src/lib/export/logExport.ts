// ดาวน์โหลดบันทึกเกม (game log) — ใช้จากหน้า Leaderboard (กางดูบันทึก → Download log)
// รองรับ JSON / TXT / Markdown / CSV (เปิด Excel ได้) — ไม่พึ่งไลบรารีเพิ่ม
import type { GameLogRecord } from '../storage/gamelog'
import type { LogEntry } from '../game/types'

export type LogFormat = 'json' | 'txt' | 'md' | 'csv'

export const LOG_FORMATS: LogFormat[] = ['json', 'txt', 'md', 'csv']

// teamId ใน log เป็น index ของ teamNames (เก็บเฉพาะชื่อ — ไม่มีทีมอะไรเกินนั้น)
export function teamNameOf(record: GameLogRecord, teamId: string | null): string {
  if (teamId === null) return 'ระบบ'
  return record.teamNames[Number(teamId)] ?? teamId
}

function fmtTime(at?: number): string {
  if (!at) return '--:--:--'
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function fmtDateTime(at?: number | null): string {
  if (!at) return '—'
  return new Date(at).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const LEVEL_TAG: Record<string, string> = {
  warn: 'WARN',
  danger: 'DANGER',
  good: 'GOOD',
  info: 'INFO',
}

// หนึ่งบรรทัดของเหตุการณ์ — ใช้ร่วมกันทั้ง txt และ md (markdown เปลี่ยนแค่หัว/ตัวคั่น)
function logLine(record: GameLogRecord, l: LogEntry, markdown: boolean): string {
  const level = l.level ? LEVEL_TAG[l.level] ?? '' : ''
  const tag = `[${fmtTime(l.at)} · รอบ ${l.turn} · ${teamNameOf(record, l.teamId)}]`
  const marker = markdown ? '- ' : '· '
  const levelPrefix = level ? `[${level}] ` : ''
  return `${marker}${tag} ${levelPrefix}${l.message}`
}

export function buildLogText(record: GameLogRecord, markdown: boolean): string {
  const hr = markdown ? '---' : '══════════════════════════════════════════'
  const header = markdown ? '# Minenumber — บันทึกผลการเล่น' : 'Minenumber — บันทึกผลการเล่น'
  const field = (label: string, value: string) => (markdown ? `- **${label}:** ${value}` : `${label}: ${value}`)
  const lines: string[] = [header, hr]
  lines.push(field('เริ่มเกม', fmtDateTime(record.startedAt)))
  lines.push(field('จบเกม', fmtDateTime(record.endedAt)))
  lines.push(field('ทีม', record.teamNames.join(' · ')))
  lines.push(field('จำนวนรอบ', String(record.turnNumber)))
  lines.push('')
  if (markdown) lines.push('## ลำดับเหตุการณ์')
  if (record.log.length === 0) {
    lines.push(markdown ? '- ไม่มีเหตุการณ์ในเกมนี้' : '· ไม่มีเหตุการณ์ในเกมนี้')
  } else {
    for (const l of record.log) lines.push(logLine(record, l, markdown))
  }
  return lines.join('\n')
}

// CSV — คอลัมน์ turn/time/team/level/message เปิดใน Excel/Sheets ได้
function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export function buildLogCsv(record: GameLogRecord): string {
  const rows = ['turn,time,team,level,message']
  for (const l of record.log) {
    rows.push(
      [
        String(l.turn),
        fmtTime(l.at),
        csvEscape(teamNameOf(record, l.teamId)),
        csvEscape(l.level ?? 'info'),
        csvEscape(l.message),
      ].join(','),
    )
  }
  return rows.join('\n')
}

export function buildLogJson(record: GameLogRecord): string {
  return JSON.stringify(record, null, 2)
}

export function buildLogFile(record: GameLogRecord, format: LogFormat): { content: string; ext: string; mime: string } {
  switch (format) {
    case 'json':
      return { content: buildLogJson(record), ext: 'json', mime: 'application/json' }
    case 'txt':
      return { content: buildLogText(record, false), ext: 'txt', mime: 'text/plain' }
    case 'md':
      return { content: buildLogText(record, true), ext: 'md', mime: 'text/markdown' }
    case 'csv':
      return { content: buildLogCsv(record), ext: 'csv', mime: 'text/csv' }
  }
}

// สร้างไฟล์ + กระตุ้นดาวน์โหลดผ่านเบราว์เซอร์
export function downloadLog(record: GameLogRecord, format: LogFormat): void {
  const { content, ext, mime } = buildLogFile(record, format)
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const stamp = record.startedAt ?? record.endedAt
  const date = stamp ? new Date(stamp).toISOString().slice(0, 10) : 'unknown'
  const a = document.createElement('a')
  a.href = url
  a.download = `minenumber-log-${date}.${ext}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}