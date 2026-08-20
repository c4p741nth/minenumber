export type CellState = 'hidden' | 'safe' | 'detonated' | 'defused' | 'glitched'
export type BombKind = 'real' | 'glitch'
// ตำแหน่งระเบิด (secret) — ใช้เฉพาะตอน save เข้ารหัส ห้ามโผล่ใน UI
export type PrivateBombState = Record<number, BombKind>
export type CardType = 'scan' | 'skip' | 'block' | 'reverse' | 'shuffle' | 'attack'
export type Phase = 'setup' | 'cards' | 'opening' | 'defusing' | 'gameover'

export interface Team {
  id: string
  name: string
  alive: boolean
  hand: CardType[]
  glitchTurnsLeft: number // >0 = ใช้/จั่วการ์ดไม่ได้
  blockedTurnsLeft: number // >0 = ใช้การ์ดไม่ได้ (จาก Block)
  pendingOpens: number // จำนวนป้ายที่ต้องเปิดในตานี้
  eliminatedAt: number | null // ลำดับการตกรอบ (1 = ตายคนแรก)
  stats: TeamStats
}

export interface TeamStats {
  opens: number // จำนวนป้ายที่เปิด (รวมที่ทำให้ตาย)
  defusesSucceeded: number
  cardsPlayed: Record<CardType, number>
  cardsDiscarded: number // จำนวนการ์ดที่ทิ้ง (W5.3)
}

export interface GameSettings {
  teamNames: string[]
  rangeMin: number
  rangeMax: number
  turnSeconds: number // 0 = ไม่จับเวลา
  glitchEnabled: boolean
  glitchMode: 'auto' | 'manual' // auto = ตามสัดส่วน, manual = กำหนดจำนวนเอง
  glitchRatio: number // 0–0.5 (ใช้เมื่อ auto)
  glitchCount: number // จำนวน glitch (ใช้เมื่อ manual)
  cardsEnabled: boolean
  maxHandSize: number // 3–7 จำนวนการ์ดที่ถือได้สูงสุด
  startingHand: number // 0–3 การ์ดแจกตอนเริ่มเกม
  cardWeights?: Partial<Record<CardType, number>> // optional override น้ำหนักจั่ว
  scanRadius: number // 1–5
  shrinkingEnabled: boolean // "Shrinking Mode" — default false
}

export type LogEntry = {
  id: number
  turn: number
  teamId: string | null
  message: string
  // สำหรับ toast สีการ์ดตอนจั่ว (W5.4) — มีเฉพาะรายการ "ได้การ์ด"
  kind?: 'draw'
  card?: CardType
}

// ผลของการเปิดช่องหนึ่งช่อง
// survived ตัดสินล่วงหน้าตอน OPEN_CELL (§5)
export type OpenResult =
  | { kind: 'safe' }
  | { kind: 'real'; survived: boolean }
  | { kind: 'glitch' }

export type CardResult =
  | { card: 'scan'; found: boolean; center: number }
  | { card: 'skip' }
  | { card: 'block'; targetTeamId: string }
  | { card: 'reverse' }
  | { card: 'shuffle' }
  | { card: 'attack'; targetTeamId: string }

export type GameAction =
  | { type: 'OPEN_CELL'; cell: number }
  | { type: 'CHOOSE_WIRE'; wire: 'red' | 'blue' }
  | { type: 'TIMEOUT' }
  | { type: 'END_TURN' }
  | { type: 'PLAY_CARD'; card: CardType; index?: number; targetTeamId?: string; targetCell?: number }
  | { type: 'DISCARD_CARD'; index: number } // ทิ้งการ์ดใบที่ index (W5.3)
  | { type: 'DRAW_CARD'; teamId: string }
// สถานะที่ปลอดภัยสำหรับ UI — ห้ามมีตำแหน่งระเบิดเด็ดขาด
export interface PublicGameState {
  phase: Phase
  settings: GameSettings
  teams: Team[]
  currentTeamIndex: number
  direction: 1 | -1
  cells: Record<number, CellState>
  rangeMin: number // เปลี่ยนได้ถ้าเปิด Shrinking Mode
  rangeMax: number
  bombsRemaining: number // จำนวนเท่านั้น ห้ามมีตำแหน่ง
  turnNumber: number
  log: LogEntry[]
  pendingDefuse: { cell: number } | null
  lastResult: OpenResult | null
  lastCardResult: CardResult | null
  // การ์ดที่เพิ่งจั่วตอนจบตาก่อนหน้า — ใช้ทำ toast สี (W5.4)
  // ⚠️ เคลียร์เป็น null เมื่อขึ้นตาถัดไป กันทีมถัดไปเห็นการ์ดทีมก่อนหน้า
  lastDraw: { teamId: string; card: CardType } | null
  // ทีมปัจจุบันใช้การ์ดไม่ได้ไหม (สำหรับ UI เทา/บอกเหตุผล)
  currentGlitched: boolean
  currentBlocked: boolean
}