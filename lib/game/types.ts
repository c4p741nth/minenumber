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
}

export interface GameSettings {
  teamNames: string[]
  rangeMin: number
  rangeMax: number
  turnSeconds: number // 0 = ไม่จับเวลา
  glitchEnabled: boolean
  glitchRatio: number // 0–0.5
  cardsEnabled: boolean
  scanRadius: number // 1–5
  shrinkingEnabled: boolean // "โหมดเร่ง" — default false
}

export type LogEntry = {
  id: number
  turn: number
  teamId: string | null
  message: string
}

// ผลของการเปิดช่องหนึ่งช่อง
// survived ตัดสินล่วงหน้าตอน OPEN_CELL (§5)
export type OpenResult =
  | { kind: 'safe' }
  | { kind: 'real'; survived: boolean }
  | { kind: 'glitch' }

export type CardResult =
  | { card: 'scan'; found: boolean }
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
  | { type: 'PLAY_CARD'; card: CardType; targetTeamId?: string; targetCell?: number }
  | { type: 'DRAW_CARD'; teamId: string }
// สถานะที่ปลอดภัยสำหรับ UI — ห้ามมีตำแหน่งระเบิดเด็ดขาด
export interface PublicGameState {
  phase: Phase
  settings: GameSettings
  teams: Team[]
  currentTeamIndex: number
  direction: 1 | -1
  cells: Record<number, CellState>
  rangeMin: number // เปลี่ยนได้ถ้าเปิดโหมดเร่ง
  rangeMax: number
  bombsRemaining: number // จำนวนเท่านั้น ห้ามมีตำแหน่ง
  turnNumber: number
  log: LogEntry[]
  pendingDefuse: { cell: number } | null
  lastResult: OpenResult | null
  lastCardResult: CardResult | null
  // ทีมปัจจุบันใช้การ์ดไม่ได้ไหม (สำหรับ UI เทา/บอกเหตุผล)
  currentGlitched: boolean
  currentBlocked: boolean
}