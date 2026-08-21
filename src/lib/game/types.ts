export type CellState = 'hidden' | 'safe' | 'detonated' | 'defused' | 'glitched'
export type BombKind = 'real' | 'glitch'
// ตำแหน่งระเบิด (secret) — ใช้เฉพาะตอน save เข้ารหัส ห้ามโผล่ใน UI
export type PrivateBombState = Record<number, BombKind>
export type CardType = 'scan' | 'skip' | 'shield' | 'block' | 'reverse' | 'shuffle' | 'attack'
export type Phase = 'setup' | 'cards' | 'opening' | 'defusing' | 'blocking' | 'defending' | 'gameover'

// โจมตีที่ค้างอยู่บนทีมเป้าหมาย (โดน attack ไปแล้วแต่ยังไม่ถึงตาของเป้าหมาย)
// opens = จำนวนป้ายที่เป้าหมายต้องเปิดเพิ่มถ้าไม่กัน (โอนกองของผู้โจมตีตอนใช้การ์ด)
export type PendingAttack = { opens: number }

export interface Team {
  id: string
  name: string
  alive: boolean
  hand: CardType[]
  glitchTurnsLeft: number // >0 = ใช้/จั่วการ์ดไม่ได้
  blockedTurnsLeft: number // >0 = ใช้การ์ดไม่ได้ (เหลือไว้กัน state เก่าใน snapshot)
  // FIX #24: Shield ที่กาง — กันระเบิดจริง 1 ครั้ง (ใช้กับทีมตัวเองเท่านั้น)
  shieldCharges: number
  // Block ไม่มี charge — ถือการ์ดอยู่ในมือเท่านั้น ใช้ได้ตอนถูกถาม (phase blocking)
  // ต่อเมื่อทีมอื่นใช้ Attack/Skip/Reverse/Shuffle (กัน Shield ไม่ได้)
  // โจมตีที่ค้างอยู่ — จะโดนตอนเริ่มตาของทีมนี้ กันด้วย Block ได้ (phase 'defending')
  pendingAttacks: PendingAttack[]
  pendingOpens: number // จำนวนป้ายที่ต้องเปิดในตานี้
  eliminatedAt: number | null // ลำดับการตกรอบ (1 = ตายคนแรก)
  stats: TeamStats
}

export interface TeamStats {
  opens: number // จำนวนป้ายที่เปิด (รวมที่ทำให้ตาย) — ใช้ภายในเท่านั้น ไม่โชว์อีกแล้ว
  // FIX: นับ "รอบที่รอด" — จบตาแบบยังรอด 1 ครั้ง = 1 รอบ (โชว์ใน leaderboard แทน opens)
  turnsSurvived: number
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
  // FIX_LISTS #5: โดน glitch bomb แล้วใช้ item ไม่ได้กี่ turn (0 = ไม่ล็อกเลย)
  glitchLockTurns: number
  cardsEnabled: boolean
  maxHandSize: number // 3–7 จำนวนการ์ดที่ถือได้สูงสุด
  startingHand: number // 0–3 การ์ดแจกตอนเริ่มเกม
  cardWeights?: Partial<Record<CardType, number>> // optional override น้ำหนักจั่ว
  scanRadius: number // 1–5
  shrinkingEnabled: boolean // "Shrinking Mode" — default false
  defuseSeconds: number // เวลานับถอยหลังตอนตัดสายระเบิด (0 = ไม่จับเวลา) (FIX #27)
  // เวลาตัดสินใจเลือกการ์ดที่จะ Block ตอนโดนโจมตี (0 = ไม่จับเวลา) — หมดเวลา = ไม่กัน โดนทั้งหมด
  defendSeconds: number
  // FIX_LISTS #9: เอา YouTube link ออกแล้ว — เหลือแค่ระดับเสียง effect ของเกม
  sfxVolume: number // 0–100
}

// FIX #31/#32: ระดับความสำคัญของ log → ใช้เลือกสีข้อความ
export type LogLevel = 'info' | 'warn' | 'danger' | 'good'

export type LogEntry = {
  id: number
  turn: number
  teamId: string | null
  message: string
  // FIX #33: เวลาที่เกิดเหตุการณ์ (epoch ms)
  at: number
  // FIX #31/#32: สีของข้อความ — danger = แดง (ตกรอบ), warn = เหลือง (ต้องตัดสาย)
  level?: LogLevel
  // สำหรับ toast สีการ์ดตอนจั่ว (W5.4) — มีเฉพาะรายการ "ได้การ์ด"
  kind?: 'draw'
  card?: CardType
}

// ผลของการเปิดช่องหนึ่งช่อง
// survived รู้ผลตอน CHOOSE_WIRE — สายปลอดภัยสุ่มตอนเข้าโหมดตัดสาย (§5)
export type OpenResult =
  | { kind: 'safe' }
  | { kind: 'real'; survived: boolean }
  // FIX #24: กาง Shield ไว้ → รอดทันที ไม่ต้องตัดสาย ระเบิดย้ายไปช่องอื่น
  | { kind: 'shielded' }
  | { kind: 'glitch' }

export type CardResult =
  | { card: 'scan'; found: boolean; center: number }
  | { card: 'skip' }
  | { card: 'shield' }
  | { card: 'block' }
  | { card: 'reverse' }
  | { card: 'shuffle' }
  | { card: 'attack'; targetTeamId: string }

export type GameAction =
  | { type: 'OPEN_CELL'; cell: number }
  | { type: 'CHOOSE_WIRE'; wire: 'red' | 'blue' }
  // FIX_LISTS #3: ตัดสายไม่ทันเวลา → ระเบิดทันที (ไม่สนผลที่สุ่มไว้ตอน OPEN_CELL)
  | { type: 'DEFUSE_TIMEOUT' }
  | { type: 'TIMEOUT' }
  | { type: 'END_TURN' }
  | { type: 'PLAY_CARD'; card: CardType; index?: number; targetTeamId?: string; targetCell?: number }
  | { type: 'DISCARD_CARD'; index: number } // ทิ้งการ์ดใบที่ index (W5.3)
  | { type: 'DRAW_CARD'; teamId: string }
  // FIX #25: ตอบ popup ว่าทีมเป้าหมายจะใช้ Block กันหรือไม่
  | { type: 'RESOLVE_BLOCK'; use: boolean }
  // ตอบ phase 'defending' — จำนวนการ์ดโจมตีที่จะกันด้วย Block (0 = ไม่กันเลย โดนทั้งหมด)
// เลือกเองได้ว่าจะกันกี่ใบ (เผื่ออยากเก็บ Block ไว้กัน Reverse/Shuffle ภายหลัง)
  | { type: 'RESOLVE_ATTACK_DEFENSE'; use: number }
  // FIX #18: กรรมการย้อนกลับไปทีมก่อนหน้า (เช่น ทีมเสีย turn เพราะหมดเวลาแต่ควรได้เล่น)
  | { type: 'UNDO_TURN' }
  // FIX #44: กรรมการสั่งยุติเกม → เข้าหน้าสรุปอันดับทันทีเหมือนเกมจบตามปกติ
  | { type: 'END_GAME' }
  // FIX_LISTS ชุดใหม่ #2: เข้าโหมดตัดสายทันทีโดยไม่ต้องเลือกช่อง
  // (ใช้ได้เฉพาะตอนทุกช่องที่เหลือเป็นระเบิดจริง — เอนจินตรวจเงื่อนไขเองอีกชั้น)
  | { type: 'START_WIRE_CUT' }
  // FIX: ตัดสายเลือกสีแล้ว → เอนจินคำนวณผล (defuseResult) แต่ยังไม่จบ turn
  // UI แสดงผลก่อน แล้วกด "รับทราบ" เพื่อจบ (ACK_DEFUSE) — ผลขึ้นกับสีที่เลือกจริง ๆ
  | { type: 'ACK_DEFUSE' }
// สถานะที่ปลอดภัยสำหรับ UI — ห้ามมีตำแหน่งระเบิดเด็ดขาด
export interface PublicGameState {
  phase: Phase
  settings: GameSettings
  teams: Team[]
  currentTeamIndex: number
  direction: 1 | -1
  cells: Record<number, CellState>
  // FIX #15: ช่องที่เปิดแล้วได้การ์ด — mark ไว้ให้เห็นว่าการ์ดมาจากช่องไหน
  cardCells: Record<number, string> // cell -> teamId ที่ได้การ์ด
  rangeMin: number // เปลี่ยนได้ถ้าเปิด Shrinking Mode
  rangeMax: number
  bombsRemaining: number // จำนวนเท่านั้น ห้ามมีตำแหน่ง
  // FIX_LISTS #16: ระเบิดจริงเท่านั้น (ไม่รวม glitch) — ใช้คิด "โอกาสโดนระเบิด" ระหว่างเล่น
  // ระบบมองไม่เห็น glitch bomb จึงต้องไม่เอาไปคิดรวมในเปอร์เซ็นต์ที่โชว์ผู้เล่น
  // optional เพราะ snapshot เก่า deserialize มาเป็น type นี้โดยไม่มี field นี้
  realBombsRemaining?: number
  turnNumber: number
  // FIX #36: เวลาที่เกมเริ่ม (epoch ms) — optional เพราะ snapshot เก่า deserialize
  // มาเป็น type นี้ ถ้า required จะเป็นการโกหกว่ามีข้อมูล
  startedAt?: number
  log: LogEntry[]
  pendingDefuse: { cell: number } | null
  // FIX: ผลการตัดสายเมื่อเลือกสีแล้ว (ยังไม่จบ turn — รอ ACK_DEFUSE)
  // ไม่มี safeWire ตรงนี้ — รู้ผลได้เฉพาะตอนเลือกสีแล้วเท่านั้น (ห้ามรั่ว)
  defuseResult: { survived: boolean } | null
  // FIX #25: กำลังถามทีมเป้าหมายว่าจะใช้ Block กันไหม (ไม่บอกว่ามีการ์ดอะไร)
  // FIX_LISTS #10: askQueue = ทีมที่ยังไม่ได้ตอบว่าจะกันไหม (หัวคิว = ทีมที่ถูกถามอยู่)
  // optional เพราะ snapshot เก่าไม่มี field นี้
  // FIX_LISTS ชุดใหม่ #1: กัน Block ด้วย Block ได้ (counter-block เป็นชั้น ๆ)
  //   chain = ลำดับทีมที่ประกาศกันไว้แล้ว (chain[0] กัน effect เดิม,
  //   chain[1] กัน chain[0], …) — ชั้นสุดท้ายที่ไม่มีใครกันต่อคือชั้นที่ชนะ
  //   counter = true ตอนกำลังถามว่าจะกัน "Block ของชั้นล่าสุด" ไหม
  pendingBlock: {
    targetTeamId: string
    sourceTeamId: string
    card: CardType
    askQueue?: string[]
    chain?: string[]
    counter?: boolean
    // FIX_LISTS ชุดที่สิบสาม #2: Skip ใบนี้ถูกใช้ตอน phase 'defending' (มีหนี้ attack ค้าง)
    // ถูกกันสำเร็จ = กลับไปตั้งรับต่อ ไม่ใช่จบตา
    fromDefending?: boolean
  } | null
  lastResult: OpenResult | null
  lastCardResult: CardResult | null
  // การ์ดที่เพิ่งจั่วตอนจบตาก่อนหน้า — ใช้ทำ toast สี (W5.4)
  // ⚠️ เคลียร์เป็น null เมื่อขึ้นตาถัดไป กันทีมถัดไปเห็นการ์ดทีมก่อนหน้า
  lastDraw: { teamId: string; card: CardType } | null
  // ทีมปัจจุบันใช้การ์ดไม่ได้ไหม (สำหรับ UI เทา/บอกเหตุผล)
  currentGlitched: boolean
  currentBlocked: boolean
  // FIX_LISTS ชุดใหม่ #2: บังคับตัดสายแล้วไม่ต้องเลือกช่อง → เริ่มตัดสายได้เลย
  // true = ทุกช่องที่เหลือเป็นระเบิดจริง และทีมนี้ไม่มีการ์ดที่เปลี่ยน turn ได้
  // optional เพราะ snapshot เก่า deserialize มาเป็น type นี้โดยไม่มี field นี้
  autoWireCut?: boolean
  // FIX_LISTS ชุดที่สาม #3: ช่องที่เคยถูก Scan ครอบ และผลยังใช้ได้อยู่
  //   true = โซนนั้นมีระเบิด (ขอบแดง), false = โซนนั้นปลอดภัย (ขอบเขียว)
  //   ล้างทั้งชุดทันทีที่ระเบิดย้ายที่ (กู้สำเร็จ / Shuffle / โควตาขยับ)
  //   ⚠️ ไม่ใช่ตำแหน่งระเบิด — เป็นผลระดับโซนที่ผู้เล่นเห็นไปแล้วจาก popup สแกน
  // optional เพราะ snapshot เก่า deserialize มาเป็น type นี้โดยไม่มี field นี้
  scanMarks?: Record<number, boolean>
}