import { CARD_LABELS, cardEndsTurn, cardIsBlockable, drawRandomCard } from './cards'
import { createRng, pickRandom, shuffle } from './rng'
import { setupBombs } from './setup'
import { DEFAULTS, maxScanRadiusFor } from './config'
import { isForcedWireCut } from './balance'
import type {
  BombKind,
  CardResult,
  CardType,
  CellState,
  GameAction,
  GameSettings,
  LogEntry,
  LogLevel,
  OpenResult,
  Phase,
  PrivateBombState,
  PublicGameState,
  Team,
  TeamStats,
} from './types'

// Private state ของ engine — อยู่ใน closure ห้ามหลุดออกนอก module นี้
interface EngineState {
  settings: GameSettings
  rng: () => number
  bombs: Map<number, BombKind> // ตำแหน่งระเบิด — ห้าม export
  cells: Record<number, CellState>
  // FIX #15: ช่องที่เปิดแล้วทำให้ได้การ์ด (cell -> teamId)
  cardCells: Record<number, string>
  // ช่องล่าสุดที่ทีมปัจจุบันเปิด — ใช้ผูกการ์ดที่จั่วตอนจบตากับช่องนั้น
  lastOpenedCell: number | null
  teams: Team[]
  currentTeamIndex: number
  direction: 1 | -1
  phase: Phase
  rangeMin: number
  rangeMax: number
  turnNumber: number
  // FIX #36: เวลาที่เกมนี้เริ่ม (epoch ms) — ใช้ทำ "ประวัติ 20 เกมล่าสุด" ที่บอกเวลาเริ่ม→เวลาจบ
  startedAt: number
  log: LogEntry[]
  nextLogId: number
  eliminations: number
  pendingDefuse: { cell: number; safeWire: 'red' | 'blue' } | null
  // FIX: ผลตัดสายที่คำนวณไว้ตอน CHOOSE_WIRE — รอ ACK_DEFUSE เพื่อจบ turn
  defuseResult: { survived: boolean } | null
  // FIX #25: การ์ดที่ค้างรอคำตอบว่าจะมีใครใช้ Block กันไหม
  // FIX_LISTS #10/#15: ถามทีละทีมจนกว่าจะมีคนกัน หรือทุกทีมที่มี Block ตอบว่าไม่กัน
  //   askQueue = คิวทีมที่ยังไม่ได้ตอบ (ทีมแรกในคิวคือทีมที่กำลังถูกถามอยู่)
  //   ทีมที่ "ถูกใส่ effect" อยู่หัวคิวเสมอ แล้วค่อยไล่ทีมอื่นที่ถือ Block
  pendingBlock: {
    targetTeamId: string
    sourceTeamId: string
    card: CardType
    targetCell?: number
    askQueue: string[]
  } | null
  lastResult: OpenResult | null
  lastCardResult: CardResult | null
  lastDraw: { teamId: string; card: CardType } | null
  // ทีมปัจจุบันติด glitch/block ไหม (ตั้งตอนเริ่ม turn ของตัวเอง)
  currentGlitched: boolean
  currentBlocked: boolean
}

export interface GameHandle {
  getState(): PublicGameState
  dispatch(action: GameAction): PublicGameState
  // ใช้เฉพาะตอน save (เข้ารหัส) เท่านั้น
  serializeSecret(): PrivateBombState
}

function zeroStats(): TeamStats {
  return {
    opens: 0,
    defusesSucceeded: 0,
    cardsDiscarded: 0,
    cardsPlayed: {
      scan: 0,
      skip: 0,
      shield: 0,
      block: 0,
      reverse: 0,
      shuffle: 0,
      attack: 0,
    },
  }
}

// สายปลอดภัยของเซสชันตัดสาย — สุ่มตอนเข้าโหมด (§5)
// สีที่เลือกจึงมีผลจริง: เลือกตรงสายปลอดภัย = รอด, เลือกผิด = ระเบิด
function rollSafeWire(rng: () => number): 'red' | 'blue' {
  return rng() < 0.5 ? 'red' : 'blue'
}

export function createGame(settings: GameSettings, seed: number): GameHandle {
  const rng = createRng(seed)
  // clamp scanRadius ให้พอดีกับขนาดกระดานตอนเริ่มเกม (W6.2)
  // กัน settings เก่าใน localStorage ที่ radius ใหญ่เกินกระดานใหม่
  const totalCells = settings.rangeMax - settings.rangeMin + 1
  const clampedSettings: GameSettings = {
    ...settings,
    scanRadius: Math.min(settings.scanRadius, maxScanRadiusFor(totalCells)),
  }
  const teams = clampedSettings.teamNames.map((name, i) => ({
    id: String(i),
    name,
    alive: true,
    hand: [] as CardType[],
    glitchTurnsLeft: 0,
    blockedTurnsLeft: 0,
    shieldCharges: 0,
    blockCharges: 0,
    pendingOpens: 1,
    eliminatedAt: null,
    stats: zeroStats(),
  }))
  // เริ่มเกมแจกการ์ดให้ทุกทีม (startingHand ใบ — default 3, maxHandSize 0 = ไม่จำกัด) (§7.1)
  if (clampedSettings.cardsEnabled) {
    for (const t of teams) {
      for (let i = 0; i < clampedSettings.startingHand; i++) {
        if (clampedSettings.maxHandSize > 0 && t.hand.length >= clampedSettings.maxHandSize) break
        drawRandomCard(t.hand, rng, clampedSettings.maxHandSize, clampedSettings.cardWeights)
      }
    }
  }

  const state: EngineState = {
    settings: clampedSettings,
    rng,
    bombs: setupBombs(clampedSettings, rng),
    cells: {},
    cardCells: {},
    lastOpenedCell: null,
    teams,
    currentTeamIndex: 0,
    direction: 1,
    phase: clampedSettings.cardsEnabled ? 'cards' : 'opening',
    rangeMin: clampedSettings.rangeMin,
    rangeMax: clampedSettings.rangeMax,
    turnNumber: 1,
    startedAt: Date.now(),
    log: [],
    nextLogId: 0,
    eliminations: 0,
    pendingDefuse: null,
    defuseResult: null,
    pendingBlock: null,
    lastResult: null,
    lastCardResult: null,
    lastDraw: null,
    currentGlitched: false,
    currentBlocked: false,
  }

  return makeHandle(state)
}

// กู้เกมจาก snapshot (Task 10) — รับ PublicGameState + ตำแหน่งระเบิด (secret)
// rng เริ่มใหม่จาก seed — ความสุ่มช่วงต่อจากนี้ไม่เหมือนเกมเดิม แต่เกมดำเนินต่อได้ถูกต้อง
export function createGameFromState(
  state: PublicGameState,
  secret: PrivateBombState,
  seed: number,
): GameHandle {
  const bombs = new Map<number, BombKind>()
  for (const [n, kind] of Object.entries(secret)) bombs.set(Number(n), kind)
  const nextLogId = state.log.reduce((m, l) => Math.max(m, l.id + 1), 0)
  const eliminations = state.teams.reduce((m, t) => Math.max(m, t.eliminatedAt ?? 0), 0)
  const rng = createRng(seed)

  const restored: EngineState = {
    settings: state.settings,
    rng,
    bombs,
    cells: { ...state.cells },
    cardCells: { ...(state.cardCells ?? {}) },
    lastOpenedCell: null,
    teams: state.teams.map((t) => ({
      ...t,
      hand: t.hand.slice(),
      // snapshot เก่าไม่มีสองค่านี้ — default 0 กัน undefined หลุดเข้าเกม
      shieldCharges: t.shieldCharges ?? 0,
      blockCharges: t.blockCharges ?? 0,
    })),
    currentTeamIndex: state.currentTeamIndex,
    direction: state.direction,
    phase: state.phase,
    rangeMin: state.rangeMin,
    rangeMax: state.rangeMax,
    turnNumber: state.turnNumber,
    // FIX #36: snapshot เก่าไม่มี field นี้ — ถ้าไม่ ?? ค่าจะรีเซ็ตทุกครั้งที่ resume
    // แล้ว "เวลาเริ่มเกม" ในประวัติจะกลายเป็นเวลาที่กดเล่นต่อครั้งล่าสุด
    startedAt: state.startedAt ?? Date.now(),
    log: state.log.map((l) => ({ ...l })),
    nextLogId,
    eliminations,
    // FIX: snapshot ไม่มี safeWire (เป็น secret) — ถ้ายังไม่เลือกสี (defuseResult null)
    // ให้สุ่มสายปลอดภัยใหม่ตอนกู้เกม (resume ใช้ seed ใหม่ → ความสุ่มไม่เหมือนเดิมอยู่แล้ว)
    // ถ้าเลือกสีไปแล้ว defuseResult มีผลครบ → สี placeholder ไหนก็ไม่ถูกใช้
    pendingDefuse: state.pendingDefuse
      ? {
          cell: state.pendingDefuse.cell,
          safeWire: state.defuseResult ? 'red' : rollSafeWire(rng),
        }
      : null,
    defuseResult: state.defuseResult ? { ...state.defuseResult } : null,
    // FIX_LISTS #10: snapshot เก่าไม่มี askQueue — สร้างคิวขึ้นใหม่จากทีมที่ถือ Block อยู่
    // (ถ้าไม่เติม คิวจะเป็น undefined แล้ว resolveBlock หาหัวคิวไม่เจอ = ตอบ popup ไม่ได้)
    pendingBlock: state.pendingBlock
      ? {
          ...state.pendingBlock,
          askQueue:
            state.pendingBlock.askQueue ??
            blockAskQueue(state, state.pendingBlock.targetTeamId, state.pendingBlock.sourceTeamId),
        }
      : null,
    lastResult: state.lastResult ? { ...state.lastResult } : null,
    lastCardResult: state.lastCardResult ? { ...state.lastCardResult } : null,
    lastDraw: state.lastDraw ? { ...state.lastDraw } : null,
    currentGlitched: state.currentGlitched,
    currentBlocked: state.currentBlocked,
  }
  return makeHandle(restored)
}

function makeHandle(state: EngineState): GameHandle {
  return {
    getState: () => buildPublic(state),
    dispatch: (action) => {
      dispatchAction(state, action)
      return buildPublic(state)
    },
    serializeSecret: () => {
      const out: PrivateBombState = {}
      for (const [n, kind] of state.bombs) out[n] = kind
      return out
    },
  }
}

// FIX_LISTS ชุดใหม่ #2: บังคับเข้าโหมดตัดสายแล้ว "ไม่ต้องเลือกช่อง" — เริ่มตัดสายได้เลย
// เงื่อนไข: ทุกช่องที่เหลือเป็นระเบิดจริง (เปิดช่องไหนก็ผลเหมือนกัน การเลือกจึงไม่มีความหมาย)
// ยกเว้นเมื่อทีมยังมี "item เกี่ยวกับ turn" (Skip / Reverse / Attack) ที่เปลี่ยนได้ว่าใครต้องเปิด
// — กรณีนั้นต้องปล่อยให้ทีมตัดสินใจใช้การ์ดก่อน ห้ามลากเข้าโหมดตัดสายอัตโนมัติ
function shouldAutoWireCut(state: EngineState): boolean {
  if (state.phase !== 'cards' && state.phase !== 'opening') return false
  const hidden = hiddenCells(state)
  if (!isForcedWireCut(countRealBombs(state), hidden.length)) return false
  const team = currentTeam(state)
  if (!team?.alive) return false
  // ติด glitch = ใช้การ์ดไม่ได้อยู่แล้ว → การ์ด turn ในมือไม่มีผล เริ่มตัดสายได้เลย
  const canUseCards = state.settings.cardsEnabled && !state.currentGlitched
  if (canUseCards && team.hand.some(cardEndsTurn)) return false
  return true
}

// ช่องที่จะถูกเปิดอัตโนมัติเมื่อเข้าโหมดตัดสาย — ทุกช่องเป็นระเบิดเหมือนกันหมด
// เลือกช่องแรกเพื่อให้ผลลัพธ์ deterministic (ทดสอบซ้ำได้ ไม่กิน rng)
function autoWireCutCell(state: EngineState): number | null {
  const hidden = hiddenCells(state)
  return hidden.length > 0 ? hidden[0] : null
}

// FIX_LISTS ชุดใหม่ #2: เริ่มตัดสายเลยโดยไม่ต้องให้ทีมเลือกช่อง
// ตรวจเงื่อนไขซ้ำในเอนจิน — UI จะกดมาผิดจังหวะไม่ได้
function startWireCut(state: EngineState): void {
  if (!shouldAutoWireCut(state)) return
  const cell = autoWireCutCell(state)
  if (cell === null) return
  openCell(state, cell)
}

function buildPublic(state: EngineState): PublicGameState {
  return {
    phase: state.phase,
    settings: state.settings,
    teams: state.teams.map((t) => ({
      ...t,
      hand: t.hand.slice(),
      // snapshot เก่าไม่มีสองค่านี้ — default 0 กัน undefined หลุดเข้าเกม
      shieldCharges: t.shieldCharges ?? 0,
      blockCharges: t.blockCharges ?? 0,
    })),
    currentTeamIndex: state.currentTeamIndex,
    direction: state.direction,
    cells: { ...state.cells },
    cardCells: { ...state.cardCells },
    rangeMin: state.rangeMin,
    rangeMax: state.rangeMax,
    bombsRemaining: state.bombs.size,
    // FIX_LISTS #16: นับเฉพาะระเบิดจริง — glitch ไม่นับ (ระบบไม่เห็น glitch)
    realBombsRemaining: countRealBombs(state),
    turnNumber: state.turnNumber,
    startedAt: state.startedAt,
    log: state.log.map((l) => ({ ...l })),
    // อย่า spread pendingDefuse ทั้งก้อน — ข้างในมี safeWire (secret) ห้ามรั่ว
    pendingDefuse: state.pendingDefuse ? { cell: state.pendingDefuse.cell } : null,
    defuseResult: state.defuseResult ? { ...state.defuseResult } : null,
    pendingBlock: state.pendingBlock ? { ...state.pendingBlock } : null,
    lastResult: state.lastResult ? { ...state.lastResult } : null,
    lastCardResult: state.lastCardResult ? { ...state.lastCardResult } : null,
    lastDraw: state.lastDraw ? { ...state.lastDraw } : null,
    currentGlitched: state.currentGlitched,
    currentBlocked: state.currentBlocked,
    // FIX_LISTS ชุดใหม่ #2: UI ใช้ค่านี้เข้าโหมดตัดสายเลย ไม่ต้องให้เลือกช่อง
    autoWireCut: shouldAutoWireCut(state),
  }
}

function dispatchAction(state: EngineState, action: GameAction): void {
  switch (action.type) {
    case 'OPEN_CELL':
      openCell(state, action.cell)
      break
    case 'CHOOSE_WIRE':
      chooseWire(state, action.wire)
      break
    case 'ACK_DEFUSE':
      ackDefuse(state)
      break
    case 'DEFUSE_TIMEOUT':
      defuseTimeout(state)
      break
    case 'TIMEOUT':
      timeout(state)
      break
    case 'END_TURN':
      // จบ turn ได้เฉพาะช่วงเปิดป้าย — ไม่ให้จบฟรีช่วงใช้การ์ด
      if (state.phase === 'opening') endTurn(state)
      break
    case 'PLAY_CARD':
      playCard(state, action)
      break
    case 'DISCARD_CARD':
      discardCard(state, action)
      break
    case 'DRAW_CARD':
      drawCardAction(state, action.teamId)
      break
    case 'RESOLVE_BLOCK':
      resolveBlock(state, action.use)
      break
    case 'UNDO_TURN':
      undoTurn(state)
      break
    case 'END_GAME':
      endGameNow(state)
      break
    case 'START_WIRE_CUT':
      startWireCut(state)
      break
  }
}

function pushLog(
  state: EngineState,
  teamId: string | null,
  message: string,
  extra?: { kind?: 'draw'; card?: CardType; level?: LogLevel },
): void {
  // FIX #33: ทุกบรรทัดมี timestamp
  state.log.push({
    id: state.nextLogId++,
    turn: state.turnNumber,
    teamId,
    message,
    at: Date.now(),
    ...extra,
  })
}

function currentTeam(state: EngineState): Team {
  return state.teams[state.currentTeamIndex]
}

function aliveTeams(state: EngineState): Team[] {
  return state.teams.filter((t) => t.alive)
}

// FIX_LISTS #16: นับระเบิดจริงในกระดาน (glitch เป็นระเบิดส่วนเกิน ไม่นับ)
function countRealBombs(state: EngineState): number {
  let n = 0
  for (const [, kind] of state.bombs) {
    if (kind === 'real') n += 1
  }
  return n
}

function hiddenCells(state: EngineState): number[] {
  const out: number[] = []
  for (let n = state.rangeMin; n <= state.rangeMax; n++) {
    if (!(n in state.cells)) out.push(n)
  }
  return out
}

function eliminateTeam(state: EngineState, team: Team): void {
  team.alive = false
  state.eliminations += 1
  team.eliminatedAt = state.eliminations
  // ทีมตายกลางคัน → ยกเลิก pendingOpens ที่เหลือ (§3.4.6)
  team.pendingOpens = 0
}

// เปิดช่องหนึ่งช่อง — ตรวจชนิด → resolve ตาม §4
function openCell(state: EngineState, cell: number): void {
  if (state.phase !== 'opening' && state.phase !== 'cards') return
  if (cell < state.rangeMin || cell > state.rangeMax) return
  if (cell in state.cells) return
  // เข้าช่วงเปิดป้าย (ทีมใช้การ์ดเสร็จแล้ว)
  if (state.phase === 'cards') state.phase = 'opening'
  const team = currentTeam(state)
  team.stats.opens += 1

  const bomb = state.bombs.get(cell)
  if (bomb === 'real') {
    // FIX #24: กาง Shield ไว้ → รอดทันที ไม่ต้องตัดสาย ระเบิดย้ายไปช่องอื่นต่อ
    if (team.shieldCharges > 0) {
      team.shieldCharges -= 1
      state.cells[cell] = 'defused'
      relocateBomb(state, cell, 'real')
      state.lastResult = { kind: 'shielded' }
      pushLog(state, team.id, `${team.name} มี Shield — รอดจากระเบิด ระเบิดย้ายไปที่อื่น`, {
        level: 'good',
      })
      endTurn(state)
      return
    }
    // FIX: สุ่ม "สายปลอดภัย" ตอนเข้าเซสชันตัดสาย — สีที่เลือกมีผลจริง
    // (เดิมสุ่มผลล่วงหน้าแล้วไม่สนสี — เลือกแดง/น้ำเงินเหมือนกันหมด)
    state.pendingDefuse = { cell, safeWire: rollSafeWire(state.rng) }
    state.phase = 'defusing'
    // ยังไม่รู้ผลจนกว่าจะเลือกสี — ไม่ set lastResult ไว้ล่วงหน้า
    state.lastResult = null
    pushLog(state, team.id, `${team.name} เจอระเบิด ต้องตัดสาย`, { level: 'warn' })
    return
  }

  if (bomb === 'glitch') {
    state.cells[cell] = 'glitched'
    // FIX #35: glitch ที่โดนเปิดต้องย้ายไปช่องอื่น ไม่ใช่หายไปเฉย ๆ
    // (เดิม delete ทิ้ง → ระเบิดในกระดานลดลงเรื่อย ๆ ระหว่างเล่น)
    relocateBomb(state, cell, 'glitch')
    // FIX_LISTS #5: จำนวน turn ที่ล็อกการใช้ item ตั้งค่าได้แล้ว (เดิม hardcode 2)
    // settings เก่าใน snapshot ไม่มี field นี้ → fallback เป็น 2 ตามพฤติกรรมเดิม
    const lock = Math.max(state.settings.glitchLockTurns ?? DEFAULTS.glitchLockTurns, 0)
    team.glitchTurnsLeft = lock
    state.lastResult = { kind: 'glitch' }
    pushLog(
      state,
      team.id,
      lock > 0
        ? `${team.name} เจอ Glitch bomb — ติดกลิตช์ ${lock} turn`
        : `${team.name} เจอ Glitch bomb — เสียตานี้ไป`,
      { level: 'warn' },
    )
    endTurn(state, { draw: false }) // ติดกลิตช์ไม่ได้จั่วการ์ด
    return
  }

  // safe
  state.cells[cell] = 'safe'
  state.lastOpenedCell = cell
  state.lastResult = { kind: 'safe' }
  pushLog(state, team.id, `${team.name} เปิด ${cell} — ปลอดภัย`)
  if (state.settings.shrinkingEnabled) applyShrink(state, cell)
  team.pendingOpens -= 1
  if (team.pendingOpens <= 0) endTurn(state)
}

// FIX_LISTS #4: DefuseModal เล่นเสียงระเบิดไปแล้วตอนตัวนับเวลาหมด
// GameEffects อ่าน log นี้เพื่อ "ไม่" เล่นซ้ำตอนทีมตกรอบ
export const DEFUSE_TIMEOUT_LOG = 'ตัดสายไม่ทันเวลา ระเบิดตูม ถูกคัดออก'

// FIX_LISTS #11: ตัดสายพลาด — DefuseModal เล่นเสียงระเบิดตอน "เฉลยผล" แล้ว
// GameEffects ต้องไม่เล่นซ้ำตอน dispatch (ซึ่งเกิดตอนกดปุ่มรับทราบ ช้ากว่าภาพหลายวินาที)
export const DEFUSE_FAILED_LOG = 'กู้ระเบิดพลาด ถูกคัดออก'

// FIX_LISTS #3: ตัดสายไม่ทันเวลา → ระเบิดทันที
// ถ้าเลือกสีไปแล้ว (defuseResult ถูกตั้ง) ผลถูกผูกกับสีนั้นแล้ว — timeout ไม่มีผล
function defuseTimeout(state: EngineState): void {
  if (state.phase !== 'defusing' || !state.pendingDefuse) return
  if (state.defuseResult) return
  const cell = state.pendingDefuse.cell
  const team = currentTeam(state)
  state.pendingDefuse = null
  detonate(state, team, cell, `${team.name} ${DEFUSE_TIMEOUT_LOG}`)
}

// ระเบิดตูม → ทีมตกรอบ (ใช้ร่วมกันระหว่างตัดสายพลาดกับตัดไม่ทันเวลา)
function detonate(state: EngineState, team: Team, cell: number, message: string): void {
  state.cells[cell] = 'detonated'
  state.bombs.delete(cell)
  state.lastResult = { kind: 'real', survived: false }
  eliminateTeam(state, team)
  pushLog(state, team.id, message, { level: 'danger' })
  endTurn(state)
}

// เลือกสี → คำนวณผลจากสายปลอดภัยที่สุ่มไว้ตอนเข้าเซสชัน (§5)
// ยังไม่จบ turn — UI โชว์ผลก่อน แล้ว ACK_DEFUSE ค่อยลงมือจริง
function chooseWire(state: EngineState, wire: 'red' | 'blue'): void {
  if (state.phase !== 'defusing' || !state.pendingDefuse) return
  if (state.defuseResult) return // idempotent — เลือกแล้วเลือกซ้ำไม่มีผล
  state.defuseResult = { survived: wire === state.pendingDefuse.safeWire }
}

// กด "รับทราบ" หลังเห็นผล → ลงมือจริง (กู้/ตูม) แล้วจบ turn
function ackDefuse(state: EngineState): void {
  if (state.phase !== 'defusing' || !state.pendingDefuse || !state.defuseResult) return
  const cell = state.pendingDefuse.cell
  const team = currentTeam(state)
  const survived = state.defuseResult.survived
  state.pendingDefuse = null
  state.defuseResult = null

  if (survived) {
    state.cells[cell] = 'defused'
    team.stats.defusesSucceeded += 1
    // FIX #35: ย้ายระเบิดไปช่องที่ยังไม่เปิดจริง ๆ (ถ้าไม่มีที่ว่างจริงถึงจะหาย)
    const moved = relocateBomb(state, cell, 'real')
    state.lastResult = { kind: 'real', survived: true }
    pushLog(
      state,
      team.id,
      moved
        ? `${team.name} กู้สำเร็จ! ระเบิดย้ายไปที่อื่น`
        : `${team.name} กู้สำเร็จ! ระเบิดลูกสุดท้ายถูกทำลาย`,
      { level: 'good' },
    )
    // จบ turn ทันที ไม่ต้องเปิดต่อแม้ pendingOpens ยังเหลือ (§3.4.2)
    endTurn(state)
  } else {
    detonate(state, team, cell, `${team.name} ${DEFUSE_FAILED_LOG}`)
  }
}

// จบ turn ของทีมปัจจุบัน → ตรวจจบเกม/เสมอ/เติมระเบิด → ส่งต่อทีมถัดไป
function endTurn(state: EngineState, opts?: { draw?: boolean }): void {
  const draw = opts?.draw ?? true
  const acting = currentTeam(state)
  const alive = aliveTeams(state)

  if (alive.length === 0) {
    state.phase = 'gameover'
    pushLog(state, null, 'ทุกทีมตกรอบ — ไม่มีผู้ชนะ')
    return
  }
  if (alive.length === 1) {
    state.phase = 'gameover'
    pushLog(state, alive[0].id, `${alive[0].name} ชนะ!`, { level: 'good' })
    return
  }
  // FIX_LISTS ชุดใหม่ #1: ช่องหมดแต่ยังเหลือ >1 ทีม → ไม่ใช่เสมออีกต่อไป
  // เกมต้องเหลือผู้ชนะทีมเดียวเท่านั้น จึงเปิดกระดานรอบใหม่ให้ "แข่งกันตัดสาย"
  // ต่อจนกว่าจะเหลือทีมเดียว (ดู reopenForWireCut)
  let reopened = false
  if (hiddenCells(state).length === 0) {
    reopened = reopenForWireCut(state, alive.length)
    if (!reopened) {
      // เปิดใหม่ไม่ได้จริง ๆ (ไม่มีช่องในช่วงเลยสักช่อง) → จบแบบเสมอตามเดิม
      state.phase = 'gameover'
      pushLog(state, null, 'ช่องหมด — ทุกทีมที่รอดเสมอกัน')
      return
    }
  }
  // FIX #40: ระเบิดจริงต้อง = ทีมที่ยังรอด − 1 เสมอ
  // ไม่งั้นจะเกิดเคส "ระเบิดหมด ช่องหมด แต่ทีมยังเหลือหลายทีม"
  // glitch ไม่นับรวมในโควตานี้ และระเบิดปกติไม่ mutate เป็น glitch
  // FIX_LISTS ชุดใหม่ #1: ข้ามตอนเพิ่งเปิดสนามตัดสาย — สนามนั้นตั้งใจให้ระเบิดเต็มทุกช่อง
  // ถ้าปล่อยให้บังคับโควตา (ทีมรอด − 1) จะมีช่องปลอดภัยโผล่มา แล้วเกมวนกลับไปไม่จบอีก
  if (!reopened) enforceRealBombQuota(state, alive.length)

  if (acting.alive) acting.pendingOpens = 1
  // จั่วการ์ดเมื่อรอดจบ turn และไม่ติด glitch (§7.1)
  // maxHandSize 0 = ไม่จำกัด (W5.1)
  if (
    draw &&
    acting.alive &&
    !state.currentGlitched &&
    state.settings.cardsEnabled &&
    (state.settings.maxHandSize === 0 || acting.hand.length < state.settings.maxHandSize)
  ) {
    const card = drawRandomCard(
      acting.hand,
      state.rng,
      state.settings.maxHandSize,
      state.settings.cardWeights,
    )
    // เก็บไว้ทำ toast สีตอนจั่ว (W5.4) — เคลียร์ใน advanceToNext ไม่ให้ทีมถัดไปเห็น
    if (card) {
      state.lastDraw = { teamId: acting.id, card }
      // FIX #15: mark ช่องที่เปิดแล้วได้การ์ดใบนี้
      if (state.lastOpenedCell !== null) {
        state.cardCells[state.lastOpenedCell] = acting.id
      }
      pushLog(state, acting.id, 'ได้การ์ด 1 ใบ', { kind: 'draw', card })
    }
  }
  advanceToNext(state)
  state.phase = state.settings.cardsEnabled ? 'cards' : 'opening'
}

function advanceToNext(state: EngineState): void {
  const len = state.teams.length
  let i = state.currentTeamIndex
  for (let step = 1; step < len; step++) {
    i = (i + state.direction + len) % len
    if (state.teams[i].alive) break
  }
  state.currentTeamIndex = i
  state.turnNumber += 1
  state.lastOpenedCell = null
  // เคลียร์การ์ดที่ทีมก่อนหน้าจั่ว — กันทีมถัดไปเห็น (ข้อมูลรั่ว W5.4)
  state.lastDraw = null
  const team = state.teams[i]
  // glitch/block ลดตอนเริ่ม turn ของทีมนั้นเอง (§3.4.9)
  state.currentBlocked = team.blockedTurnsLeft > 0
  if (state.currentBlocked) team.blockedTurnsLeft -= 1
  state.currentGlitched = team.glitchTurnsLeft > 0
  if (state.currentGlitched) team.glitchTurnsLeft -= 1
}

// FIX #18: หมดเวลา → ทีมนั้นเสีย turn ไปเลย ไม่มีการสุ่มเปิดให้อัตโนมัติ
// (กรรมการกดย้อนกลับไปทีมก่อนหน้าเองได้ถ้าเห็นว่าควร — ดู UNDO_TURN)
function timeout(state: EngineState): void {
  if (state.phase !== 'opening' && state.phase !== 'cards') return
  const team = currentTeam(state)
  pushLog(state, team.id, `${team.name} หมดเวลา — เสีย turn`, { level: 'warn' })
  endTurn(state, { draw: false })
}

function drawCardAction(state: EngineState, teamId: string): void {
  const team = state.teams.find((t) => t.id === teamId)
  if (!team || !team.alive || !state.settings.cardsEnabled) return
  if (
    team.glitchTurnsLeft > 0 ||
    (state.settings.maxHandSize > 0 && team.hand.length >= state.settings.maxHandSize)
  ) {
    return
  }
  drawRandomCard(team.hand, state.rng, state.settings.maxHandSize, state.settings.cardWeights)
}

// ใช้การ์ด 1 ใบ — ต้องอยู่ในช่วงใช้การ์ด ('cards') และไม่ติด glitch/block
// index (optional) ระบุใบที่เปิดอยู่ (ไพ่คว่ำหน้า W5.3) — ถ้าไม่ส่ง จะหาใบแรกที่ตรงชนิด
function playCard(state: EngineState, action: Extract<GameAction, { type: 'PLAY_CARD' }>): void {
  if (state.phase !== 'cards') return
  const team = currentTeam(state)
  if (state.currentGlitched || state.currentBlocked) return
  const idx =
    action.index !== undefined &&
    action.index >= 0 &&
    action.index < team.hand.length &&
    team.hand[action.index] === action.card
      ? action.index
      : team.hand.indexOf(action.card)
  if (idx < 0) return

  // ตรวจ target ก่อนหักการ์ด (ถ้า invalid = ไม่ใช้การ์ด)
  switch (action.card) {
    case 'scan':
      if (
        action.targetCell === undefined ||
        action.targetCell < state.rangeMin ||
        action.targetCell > state.rangeMax
      ) {
        return
      }
      break
    case 'attack':
      // FIX #23: Attack ใช้กับทีมตัวเองไม่ได้
      if (
        action.targetTeamId === undefined ||
        action.targetTeamId === team.id ||
        !state.teams.some((t) => t.id === action.targetTeamId && t.alive)
      ) {
        return
      }
      break
    default:
      break
  }

  team.hand.splice(idx, 1)
  team.stats.cardsPlayed[action.card] += 1

  switch (action.card) {
    case 'scan':
      playScan(state, action.targetCell!)
      break
    case 'skip':
      pushLog(state, team.id, `${team.name} ใช้ Skip — ข้าม turn`)
      endTurn(state, { draw: false })
      break
    case 'shield':
      // FIX #24: ใช้กับทีมตัวเองเท่านั้น — กางแล้วเล่นต่อในตาเดิมได้
      team.shieldCharges += 1
      state.lastCardResult = { card: 'shield' }
      pushLog(state, team.id, `${team.name} กาง Shield — กันระเบิดได้ 1 ครั้ง`)
      break
    case 'block':
      // FIX #25: เก็บไว้กัน effect ที่ทีมอื่นจะใช้ใส่เรา (ไม่ได้เล่นใส่ใครทันที)
      team.blockCharges += 1
      state.lastCardResult = { card: 'block' }
      pushLog(state, team.id, `${team.name} เตรียม Block — กัน effect จากทีมอื่นได้ 1 ครั้ง`)
      break
    case 'reverse':
      // FIX_LISTS #10: Reverse สลับลำดับของทั้งวง — ทีมอื่นเอา Block มากันได้
      // เป้าหมายของการถามคือทีมถัดไป (คนที่เสียสิทธิ์เล่นเพราะทิศเปลี่ยน)
      if (!offerBlock(state, nextAliveTeamId(state), 'reverse')) {
        applyReverse(state)
      }
      break
    case 'shuffle':
      // FIX_LISTS #10: Shuffle ย้ายระเบิดทั้งกระดาน กระทบทุกทีม — กันได้
      if (!offerBlock(state, nextAliveTeamId(state), 'shuffle')) {
        playShuffle(state)
      }
      break
    case 'attack':
      // FIX #25: ถ้ามีทีมถือ Block ให้ถามก่อนว่าจะกันไหม
      if (!offerBlock(state, action.targetTeamId!, 'attack')) {
        playAttack(state, action.targetTeamId!)
      }
      break
  }
}

// FIX #25: มีทีมถือ Block อยู่ → เข้าสู่ phase 'blocking' รอคำตอบ
// FIX_LISTS #10: ไม่ใช่แค่ "ทีมเป้าหมาย" — ทุกทีมที่ถือ Block มีสิทธิ์กันได้
//   (เช่น ทีม 2 โจมตีทีม 1 แต่ทีม 3 เข้ามากันแทนก็ได้) จึงต้องถามไล่ไปทีละทีม
//   จนกว่าจะมีคนกัน หรือหมดคนที่ยังถือ Block อยู่
// FIX_LISTS #15: ทีมที่ใช้การ์ด (sourceTeam) กัน effect ของตัวเองไม่ได้ — ไม่เข้าคิว
// คืน true ถ้าต้องรอ (การ์ดยังไม่ resolve), false ถ้าเล่นต่อได้เลย
function offerBlock(state: EngineState, targetId: string, card: CardType): boolean {
  // FIX_LISTS #15: การ์ดที่กันไม่ได้ (รวมถึง Block เอง) ไม่ต้องเปิด phase ถามเลย
  if (!cardIsBlockable(card)) return false
  const sourceId = currentTeam(state).id
  const queue = blockAskQueue(state, targetId, sourceId)
  if (queue.length === 0) return false
  state.pendingBlock = {
    targetTeamId: targetId,
    sourceTeamId: sourceId,
    card,
    askQueue: queue,
  }
  state.phase = 'blocking'
  return true
}

// FIX_LISTS #10: ลำดับการถาม — ทีมที่โดน effect ได้สิทธิ์ตอบก่อน แล้วค่อยทีมอื่น
// ตามลำดับที่นั่ง (เสถียร ไม่สุ่ม) เฉพาะทีมที่ยังรอดและยังถือ Block อยู่จริง
export function blockAskQueue(
  state: { teams: Team[] },
  targetId: string,
  sourceId: string,
): string[] {
  const eligible = (t: Team) => t.alive && t.blockCharges > 0 && t.id !== sourceId
  const queue: string[] = []
  const target = state.teams.find((t) => t.id === targetId)
  if (target && eligible(target)) queue.push(target.id)
  for (const t of state.teams) {
    if (t.id !== targetId && eligible(t)) queue.push(t.id)
  }
  return queue
}

// FIX #25: ตอบ popup — use = ใช้ Block กัน, ไม่ใช้ = ส่งคิวต่อให้ทีมถัดไปตอบ
// FIX_LISTS #10: ถามวนจนกว่าจะมีคนกัน หรือทุกทีมที่ถือ Block ตอบว่าไม่กัน
// FIX_LISTS #15: กันได้ = จบเลย ห้าม stack — ทีมอื่นจะเอา Block มาซ้อนกัน Block ไม่ได้
//   (Block เป็นการ์ด counter ไม่ใช่การ์ดที่ใส่ใส่กันเป็นชั้น ๆ)
function resolveBlock(state: EngineState, use: boolean): void {
  if (state.phase !== 'blocking' || !state.pendingBlock) return
  const pending = state.pendingBlock
  // ทีมที่กำลังถูกถามอยู่คือหัวคิว
  const responderId = pending.askQueue[0]
  const responder = state.teams.find((t) => t.id === responderId)

  if (use && responder && responder.alive && responder.blockCharges > 0) {
    responder.blockCharges -= 1
    state.pendingBlock = null
    state.phase = 'cards'
    pushLog(
      state,
      responder.id,
      `${responder.name} ใช้ Block — กัน ${CARD_LABELS[pending.card]} ไว้ได้`,
    )
    // การ์ดถูกกัน → ทีมที่ใช้จบ turn ไปเลย (เสียการ์ดฟรี)
    endTurn(state, { draw: false })
    return
  }

  // ทีมนี้ไม่กัน → ถามทีมถัดไปในคิวที่ยังรอดและยังถือ Block อยู่
  const rest = pending.askQueue.slice(1).filter((id) => {
    const t = state.teams.find((x) => x.id === id)
    return t?.alive && t.blockCharges > 0
  })
  if (rest.length > 0) {
    state.pendingBlock = { ...pending, askQueue: rest }
    return
  }

  // ไม่มีใครกัน → effect ทำงานตามปกติ
  state.pendingBlock = null
  state.phase = 'cards'
  if (pending.card === 'attack') playAttack(state, pending.targetTeamId)
  else if (pending.card === 'reverse') applyReverse(state)
  else if (pending.card === 'shuffle') playShuffle(state)
}

// ทิ้งการ์ด 1 ใบ (W5.3) — เฉพาะช่วงใช้การ์ด + ไม่ติด glitch/block
// ทิ้งแล้วไม่จบตา ไม่ได้จั่วชดเชย — log บอกชื่อการ์ด (ทิ้งแล้วไม่เป็นความลับอีก)
function discardCard(state: EngineState, action: Extract<GameAction, { type: 'DISCARD_CARD' }>): void {
  if (state.phase !== 'cards') return
  const team = currentTeam(state)
  if (state.currentGlitched || state.currentBlocked) return
  const idx = action.index
  if (idx < 0 || idx >= team.hand.length) return
  const card = team.hand[idx]
  team.hand.splice(idx, 1)
  team.stats.cardsDiscarded += 1
  pushLog(state, team.id, `${team.name} ทิ้งการ์ด ${CARD_LABELS[card]}`)
}

function playScan(state: EngineState, target: number): void {
  const team = currentTeam(state)
  const r = state.settings.scanRadius
  const lo = Math.max(state.rangeMin, target - r)
  const hi = Math.min(state.rangeMax, target + r)
  let found = false
  for (let n = lo; n <= hi; n++) {
    if (state.bombs.has(n)) {
      found = true
      break
    }
  }
  state.lastCardResult = { card: 'scan', found, center: target }
  pushLog(state, team.id, `${team.name} Scan ${target}: ${found ? 'มีระเบิด!' : 'ไม่มีระเบิด'}`)
}

// FIX_LISTS #10: แยก effect ของ Reverse ออกมา เพื่อให้เรียกได้ทั้งตอนใช้ทันที
// และตอนที่ผ่านด่าน Block มาแล้ว (resolveBlock)
function applyReverse(state: EngineState): void {
  const team = currentTeam(state)
  state.direction = (state.direction === 1 ? -1 : 1) as 1 | -1
  state.lastCardResult = { card: 'reverse' }
  pushLog(state, team.id, `${team.name} ใช้ Reverse — สลับทิศทาง`)
  endTurn(state, { draw: false })
}

// ทีมถัดไปที่ยังรอด — ใช้เป็น "เป้าหมาย" ของการ์ดที่กระทบทั้งวง (Reverse/Shuffle)
// เพื่อให้คนที่เสียประโยชน์ที่สุดได้สิทธิ์ตอบ Block ก่อน (FIX_LISTS #10)
function nextAliveTeamId(state: EngineState): string {
  const len = state.teams.length
  let i = state.currentTeamIndex
  for (let step = 1; step < len; step++) {
    i = (i + state.direction + len) % len
    if (state.teams[i].alive) return state.teams[i].id
  }
  return currentTeam(state).id
}

function playShuffle(state: EngineState): void {
  const team = currentTeam(state)
  const bombs = Array.from(state.bombs.entries())
  // pool ต้องเป็นช่อง hidden "ทั้งหมด" รวมช่องที่ระเบิดอยู่ตอนนี้ด้วย — ระเบิดเก็บใน Map แยก
  // ไม่เคยเขียนลง state.cells ช่องที่มีระเบิดจึงยัง hidden และเป็นปลายทางที่ถูกต้อง
  // (เดิม filter ช่องพวกนี้ทิ้ง → pool = hidden − bombCount พอช่องเหลือน้อย ระเบิดส่วนเกิน
  //  ถูก guard `i < shuffled.length` ตัดหายเงียบ ๆ จนระเบิดเหลือ 0 ทั้งที่เกมยังไม่จบ)
  // invariant: bombs.length <= pool.length เสมอ ระเบิดจึงไม่มีทางหาย
  const shuffled = shuffle(state.rng, hiddenCells(state))
  state.bombs.clear()
  for (let i = 0; i < bombs.length; i++) {
    state.bombs.set(shuffled[i], bombs[i][1])
  }
  state.lastCardResult = { card: 'shuffle' }
  pushLog(state, team.id, `${team.name} ใช้ Shuffle — ระเบิดย้ายตำแหน่งใหม่`)
}

// Attack: เป้าหมายรับกองทั้งหมด + ใบใหม่ แล้วกลับเป็นปกติ จบ turn ทันที (§7.3)
function playAttack(state: EngineState, targetId: string): void {
  const team = currentTeam(state)
  const target = state.teams.find((t) => t.id === targetId)
  if (!target) return
  target.pendingOpens += team.pendingOpens
  state.lastCardResult = { card: 'attack', targetTeamId: targetId }
  pushLog(state, team.id, `${team.name} โจมตี ${target.name} — ต้องเปิดเพิ่ม`)
  endTurn(state, { draw: false })
}

// FIX #18: กรรมการย้อนกลับไปทีมก่อนหน้า — ใช้เมื่อทีมเสีย turn ไปแต่กรรมการเห็นว่าควรได้เล่น
// ย้อนได้เฉพาะช่วงที่ยังไม่มีอะไรค้าง (ไม่ใช่ตอนตัดสาย/ตอบ popup/จบเกม)
// ไม่ย้อนสถานะกระดาน — แค่คืนสิทธิ์ให้ทีมก่อนหน้าเล่นใหม่
function undoTurn(state: EngineState): void {
  if (state.phase !== 'cards' && state.phase !== 'opening') return
  const len = state.teams.length
  // เดินถอยหลังตามทิศตรงข้ามเพื่อหาทีมก่อนหน้าที่ยังรอด
  let i = state.currentTeamIndex
  let found = -1
  for (let step = 1; step < len; step++) {
    i = (i - state.direction + len) % len
    if (state.teams[i].alive) {
      found = i
      break
    }
  }
  if (found < 0 || found === state.currentTeamIndex) return

  state.currentTeamIndex = found
  state.turnNumber = Math.max(state.turnNumber - 1, 1)
  state.lastDraw = null
  state.lastOpenedCell = null
  const team = state.teams[found]
  team.pendingOpens = Math.max(team.pendingOpens, 1)
  state.currentGlitched = team.glitchTurnsLeft > 0
  state.currentBlocked = team.blockedTurnsLeft > 0
  state.phase = state.settings.cardsEnabled ? 'cards' : 'opening'
  pushLog(state, team.id, `กรรมการย้อนตากลับมาที่ ${team.name}`, { level: 'warn' })
}

// FIX #44: ข้อความ log ที่เป็น marker ของ "ผู้ใช้สั่งจบเกม" — UI ใช้เช็คว่าไม่ต้องเป่าแตร
export const USER_ENDED_LOG = 'ยุติเกมโดยผู้ใช้'

// FIX #44: กรรมการสั่งยุติเกมกลางทาง → เข้าหน้าสรุปอันดับทันทีเหมือนเกมจบตามปกติ
// อันดับคำนวณจาก alive/eliminatedAt ที่มีอยู่แล้ว ไม่ต้องแก้อะไรเพิ่ม
// (เหลือหลายทีมรอด → เสมอกัน ซึ่งเป็นการตีความที่ถูกของการหยุดกลางทาง)
function endGameNow(state: EngineState): void {
  // idempotent — ปุ่มออกยังกดได้ตอน gameover กดซ้ำต้องไม่ push log ซ้ำ
  if (state.phase === 'gameover') return
  state.phase = 'gameover'
  // เคลียร์ของค้าง ไม่งั้น modal ตัดสาย/Block จะเรนเดอร์ทับหน้าสรุปอันดับ
  state.pendingDefuse = null
  state.defuseResult = null
  state.pendingBlock = null
  // ห้ามเรียก endTurn — มันจะจั่ว/เลื่อนทีม แล้วเขียน phase ทับกลับเป็น 'cards'
  pushLog(state, null, USER_ENDED_LOG, { level: 'warn' })
}

// FIX #35: ย้ายระเบิดจากช่องที่เพิ่งเปิด ไปช่องที่ "ยังไม่เปิดจริง ๆ" และยังไม่มีระเบิด
// คืน true ถ้าย้ายสำเร็จ, false ถ้าไม่มีช่องว่างเหลือ (ระเบิดหายจากระบบ)
// เดิมมีหลายจุดที่ delete ระเบิดทิ้งเฉย ๆ ทำให้ระเบิดในกระดานลดลงเรื่อย ๆ ระหว่างเล่น
function relocateBomb(state: EngineState, fromCell: number, kind: BombKind): boolean {
  state.bombs.delete(fromCell)
  const candidates = hiddenCells(state).filter((c) => c !== fromCell && !state.bombs.has(c))
  if (candidates.length === 0) return false
  const target = pickRandom(state.rng, candidates)
  state.bombs.set(target, kind)
  return true
}

// FIX_LISTS ชุดใหม่ #1: เกมต้องเหลือผู้ชนะทีมเดียว — ห้ามจบแบบ "เสมอ" เพราะช่องหมด
// ช่องบนกระดานหมดแต่ยังเหลือหลายทีม → เปิดกระดานรอบใหม่เป็นสนามตัดสายล้วน:
//   คืนช่องที่เคยเปิดไปแล้วให้กลับเป็น hidden เท่ากับจำนวนทีมที่ยังรอด
//   แล้ววางระเบิดจริงเต็มทุกช่อง (โควตา = ทีมรอด − 1 จะถูกบังคับให้ครบทีหลัง)
// ทุกทีมจึงต้องเปิดเจอระเบิดและตัดสายวนไปจนตกรอบเหลือทีมเดียว
// คืน false เมื่อไม่มีช่องในช่วงให้คืนเลย (กระดานว่างจริง ๆ) → ผู้เรียกค่อยจบเกม
function reopenForWireCut(state: EngineState, aliveCount: number): boolean {
  // ช่องที่เคยเปิดแล้วทั้งหมดในช่วงปัจจุบัน — เอากลับมาใช้เป็นสนามรอบใหม่
  const reusable: number[] = []
  for (let n = state.rangeMin; n <= state.rangeMax; n++) {
    if (n in state.cells) reusable.push(n)
  }
  if (reusable.length === 0) return false

  // เปิดคืนเท่าจำนวนทีมที่รอด (อย่างน้อย 2 ช่อง) — พอให้ทุกทีมมีช่องให้เปิดคนละช่อง
  const want = Math.min(Math.max(aliveCount, 2), reusable.length)
  const picked = shuffle(state.rng, reusable).slice(0, want)
  for (const cell of picked) {
    delete state.cells[cell]
    // ช่องนี้เคยแจกการ์ดไปแล้ว — ล้าง mark ไม่ให้ค้างเป็นช่องการ์ดในรอบใหม่
    delete state.cardCells[cell]
    // ทุกช่องในสนามรอบใหม่เป็นระเบิดจริงหมด — เปิดช่องไหนก็ต้องตัดสาย
    state.bombs.set(cell, 'real')
  }
  pushLog(
    state,
    null,
    `ช่องหมดแต่ยังเหลือ ${aliveCount} ทีม — เปิดสนามตัดสายรอบใหม่ ${picked.length} ช่อง (ระเบิดทุกช่อง)`,
    { level: 'warn' },
  )
  return true
}

// FIX #40: บังคับให้ระเบิดจริงในกระดาน = ทีมที่ยังรอด − 1 เสมอ
// น้อยไป → เติมลงช่อง hidden, มากไป → เก็บออกจากช่อง hidden
// glitch ไม่ยุ่ง (เป็นระเบิดส่วนเกิน ไม่นับในโควตา และระเบิดปกติไม่ mutate เป็น glitch)
function enforceRealBombQuota(state: EngineState, aliveCount: number): void {
  const target = Math.max(aliveCount - 1, 0)
  const realCells: number[] = []
  for (const [n, kind] of state.bombs) {
    if (kind === 'real') realCells.push(n)
  }
  const diff = target - realCells.length
  if (diff === 0) return

  if (diff > 0) {
    const hidden = hiddenCells(state)
    // เติมระเบิดจริงลงช่องที่ยังไม่เปิดและยังไม่มีระเบิด
    const free = shuffle(
      state.rng,
      hidden.filter((c) => !state.bombs.has(c)),
    )
    let added = 0
    for (; added < diff && added < free.length; added++) {
      state.bombs.set(free[added], 'real')
    }

    // ช่องว่างไม่พอ แต่ยังมี glitch จองช่องอยู่ → ให้ระเบิดจริงแทนที่ glitch
    // (glitch เป็นระเบิดส่วนเกิน ไม่ควรกันที่จนโควตาระเบิดจริงไม่ครบ
    //  ไม่งั้นจะเกิดเคส "ระเบิดหมด ช่องหมด แต่ทีมเหลือหลายทีม" — FIX #40)
    let converted = 0
    if (added < diff) {
      const glitchCells = shuffle(
        state.rng,
        hidden.filter((c) => state.bombs.get(c) === 'glitch'),
      )
      for (; added + converted < diff && converted < glitchCells.length; converted++) {
        state.bombs.set(glitchCells[converted], 'real')
      }
    }

    const total = added + converted
    if (total > 0) pushLog(state, null, `เติมระเบิดจริงให้ครบโควตา ${total} ลูก`)
    return
  }

  // เกินโควตา (ทีมเพิ่งตกรอบ) → เก็บระเบิดจริงออกเฉพาะช่องที่ยังไม่เปิด
  const removable = shuffle(
    state.rng,
    realCells.filter((c) => !(c in state.cells)),
  )
  const removed = Math.min(-diff, removable.length)
  for (let i = 0; i < removed; i++) state.bombs.delete(removable[i])
  if (removed > 0) pushLog(state, null, `เก็บระเบิดจริงออก ${removed} ลูก (ทีมลดลง)`)
}

// Shrinking Mode (§9): หด range หลังเปิด safe จากฝั่งที่ใกล้เลขที่เลือกกว่า
function applyShrink(state: EngineState, openedCell: number): void {
  const prevMin = state.rangeMin
  const prevMax = state.rangeMax
  let newMin = prevMin
  let newMax = prevMax
  if (openedCell - prevMin <= prevMax - openedCell) {
    newMin = openedCell + 1
  } else {
    newMax = openedCell - 1
  }
  if (newMin > newMax) return

  const hidden = hiddenInRange(state, newMin, newMax)
  if (hidden.length === 0) return

  // หยุดหดเมื่อ density > 0.30 (§9.3)
  let bombsInside = 0
  for (const [n] of state.bombs) {
    if (n >= newMin && n <= newMax) bombsInside += 1
  }
  if (bombsInside / hidden.length > 0.3) return
  // ต้องเหลือ hidden ≥ ทีมรอด × 2 (§9.4)
  if (hidden.length < aliveTeams(state).length * 2) return

  // ย้ายเฉพาะระเบิดที่หลุดออกนอก range — ห้าม re-randomize ทั้งหมด (§9.2)
  const outside: number[] = []
  for (const [n, kind] of state.bombs) {
    if (n < newMin || n > newMax) outside.push(n)
  }
  if (outside.length > 0) {
    const targets = hidden.filter((c) => !state.bombs.has(c))
    const shuffled = shuffle(state.rng, targets)
    for (let i = 0; i < outside.length && i < shuffled.length; i++) {
      const kind = state.bombs.get(outside[i])
      if (kind === undefined) continue
      state.bombs.delete(outside[i])
      state.bombs.set(shuffled[i], kind)
    }
  }

  state.rangeMin = newMin
  state.rangeMax = newMax
  pushLog(state, currentTeam(state).id, `Shrinking Mode — ช่วงหดเหลือ ${newMin}–${newMax}`)
}

function hiddenInRange(state: EngineState, min: number, max: number): number[] {
  const out: number[] = []
  for (let n = min; n <= max; n++) {
    if (!(n in state.cells)) out.push(n)
  }
  return out
}