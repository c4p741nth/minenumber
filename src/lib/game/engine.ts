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
  // FIX_LISTS ชุดใหม่ #1: Block กัน Block ได้ — เก็บเป็น "ชั้น" (chain)
  //   chain[0] = ทีมที่ประกาศกัน effect เดิม, chain[1] = ทีมที่กัน chain[0], …
  //   counter = กำลังถามว่าจะกัน Block ของ chain ชั้นล่าสุดไหม
  //   จำนวนชั้นคี่ = effect ถูกกันสำเร็จ, จำนวนชั้นคู่ (รวม 0) = effect ทำงาน
  pendingBlock: {
    targetTeamId: string
    sourceTeamId: string
    card: CardType
    targetCell?: number
    askQueue: string[]
    chain: string[]
    counter: boolean
  } | null
  lastResult: OpenResult | null
  lastCardResult: CardResult | null
  lastDraw: { teamId: string; card: CardType } | null
  // ทีมปัจจุบันติด glitch/block ไหม (ตั้งตอนเริ่ม turn ของตัวเอง)
  currentGlitched: boolean
  currentBlocked: boolean
  // FIX_LISTS ชุดที่สาม #3: ผลสแกนที่ยัง "ใช้ได้อยู่" — cell -> มีระเบิดในโซนไหม
  // mark ไว้บนกระดานเป็นสีขอบ (แดง = โซนนี้อาจมีระเบิด, เขียว = ปลอดภัย)
  // ล้างทิ้งทันทีที่ระเบิดย้ายที่ (กู้สำเร็จ / Shuffle) เพราะข้อมูลเก่าไม่จริงอีกต่อไป
  scanMarks: Record<number, boolean>
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
    turnsSurvived: 0,
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
    pendingAttacks: [],
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
    // FIX_LISTS ชุดที่สาม #3: ยังไม่มีใครสแกน — ไม่มี mark บนกระดาน
    scanMarks: {},
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
      // snapshot เก่าไม่มี pendingAttacks — default [] กัน undefined หลุดเข้าเกม
      pendingAttacks: t.pendingAttacks ?? [],
      // snapshot เก่าไม่มี turnsSurvived — default 0 กัน NaN ตอน += 1
      stats: { ...t.stats, turnsSurvived: t.stats?.turnsSurvived ?? 0 },
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
          // FIX_LISTS ชุดใหม่ #1: snapshot เก่าไม่มี chain/counter — เริ่มที่ชั้น 0
          chain: state.pendingBlock.chain ?? [],
          counter: state.pendingBlock.counter ?? false,
        }
      : null,
    lastResult: state.lastResult ? { ...state.lastResult } : null,
    lastCardResult: state.lastCardResult ? { ...state.lastCardResult } : null,
    lastDraw: state.lastDraw ? { ...state.lastDraw } : null,
    currentGlitched: state.currentGlitched,
    currentBlocked: state.currentBlocked,
    // FIX_LISTS ชุดที่สาม #3: snapshot เก่าไม่มี field นี้ — เริ่มที่ไม่มี mark
    scanMarks: { ...(state.scanMarks ?? {}) },
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
      pendingAttacks: t.pendingAttacks ?? [],
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
    // FIX_LISTS ชุดที่สาม #3: โซนที่สแกนไปแล้วและผลยังใช้ได้อยู่
    scanMarks: { ...state.scanMarks },
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
    case 'RESOLVE_ATTACK_DEFENSE':
      resolveAttackDefense(state, action.use)
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
  // ทีมตายกลางคัน → ยกเลิก pendingOpens ที่เหลือ (§3.4.6) และโจมตีที่ค้างอยู่
  team.pendingOpens = 0
  team.pendingAttacks = []
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
    // ย้ายไม่ได้ (hidden ว่างหมด) → ระเบิดอยู่ที่เดิม ช่องไม่เขียว (ทีมถัดไปเจอต่อ)
    if (team.shieldCharges > 0) {
      team.shieldCharges -= 1
      const moved = relocateBomb(state, cell, 'real')
      if (moved) state.cells[cell] = 'defused'
      state.lastResult = { kind: 'shielded' }
      pushLog(
        state,
        team.id,
        moved
          ? `${team.name} มี Shield — รอดจากระเบิด ระเบิดย้ายไปที่อื่น`
          : `${team.name} มี Shield — รอดจากระเบิด แต่ไม่มีที่ว่างให้ย้าย ระเบิดยังอยู่ที่เดิม`,
        { level: 'good' },
      )
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
    // ย้ายไม่ได้ (hidden ว่างหมด) → ระเบิดอยู่ที่เดิม ช่องไม่เขียว (ทีมถัดไปเจอต่อ)
    const moved = relocateBomb(state, cell, 'glitch')
    if (moved) state.cells[cell] = 'glitched'
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
    // ย้ายระเบิดไปช่องที่ยังไม่เปิดจริง ๆ — ย้ายไม่ได้ = ระเบิดอยู่ที่เดิม
    // ช่องไม่ mark defused (ไม่เขียว) ทีมถัดไปต้องตัดสายต่อ ระเบิดไม่หายจากระบบ
    // นับ "กู้สำเร็จ" ทุกครั้งที่ตัดสายรอด — รวมเคสสนามตัดสายที่ย้ายระเบิดไม่ได้
    const moved = relocateBomb(state, cell, 'real')
    team.stats.defusesSucceeded += 1
    if (moved) state.cells[cell] = 'defused'
    state.lastResult = { kind: 'real', survived: true }
    pushLog(
      state,
      team.id,
      moved
        ? `${team.name} กู้สำเร็จ! ระเบิดย้ายไปที่อื่น`
        : `${team.name} กู้สำเร็จ! แต่ไม่มีที่ว่างให้ย้ายระเบิด — ระเบิดยังอยู่ที่เดิม`,
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

  // จบตาแบบยังรอด = "รอด 1 รอบ" — ต้องนับก่อนเช็คจบเกม
  // ไม่งั้นผู้ชนะ (ที่จบเกมตอนตาของตัวเอง) จะไม่ถูกนับตาสุดท้าย
  if (acting.alive) {
    acting.pendingOpens = 1
    acting.stats.turnsSurvived += 1
  }

  if (alive.length === 0) {
    state.phase = 'gameover'
    pushLog(state, null, 'ทุกทีมตกรอบ — ไม่มีผู้ชนะ')
    return
  }
  if (alive.length === 1) {
    state.phase = 'gameover'
    // นับเฉพาะรอบที่ทีมเล่นจบตาจริง (ข้างบน) — ไม่มีเครดิต +1 รอบจบเกม
    // กู้ 2 ครั้ง = รอด 2 รอบ พอดี
    pushLog(state, alive[0].id, `${alive[0].name} ชนะ!`, { level: 'good' })
    return
  }
  // ระเบิดทุกลูกอยู่บนช่อง hidden เสมอ (ย้ายไม่ได้ = คืนที่เดิม ไม่หายจากระบบ)
  // ช่อง hidden จึงไม่หมดก่อนเหลือ 1 ทีม — กันไว้เฉย ๆ เผื่อมีบั๊กไม่คาดฝัน
  if (hiddenCells(state).length === 0) {
    state.phase = 'gameover'
    pushLog(state, null, 'ช่องหมด — ทุกทีมที่รอดเสมอกัน')
    return
  }
  // FIX #40: ระเบิดจริงต้อง = ทีมที่ยังรอด − 1 เสมอ
  // ไม่งั้นจะเกิดเคส "ระเบิดหมด ช่องหมด แต่ทีมยังเหลือหลายทีม"
  // glitch ไม่นับรวมในโควตานี้ และระเบิดปกติไม่ mutate เป็น glitch
  enforceRealBombQuota(state, alive.length)

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
  beginTeamTurn(state)
}

// เริ่มตาของทีมถัดไป — ถ้ามีโจมตีค้างอยู่ ต้องแก้ด้วย Block ก่อน (phase 'defending')
// ถ้าไม่มี Block (หรือติด glitch/block ใช้การ์ดไม่ได้) → โดนโจมตีไปโดยปริยาย
function beginTeamTurn(state: EngineState): void {
  const team = currentTeam(state)
  const canUseCards =
    state.settings.cardsEnabled && !state.currentGlitched && !state.currentBlocked
  if (team.pendingAttacks.length > 0) {
    if (canUseCards && team.hand.includes('block')) {
      state.phase = 'defending'
      return
    }
    applyPendingAttacks(state)
  }
  state.phase = state.settings.cardsEnabled ? 'cards' : 'opening'
}

// โจมตีที่ค้างอยู่โดนไปโดยปริยาย (ไม่มี Block / ติด glitch / ตอบไม่กัน) — เปิดเพิ่มทันที
function applyPendingAttacks(state: EngineState): void {
  const team = currentTeam(state)
  if (team.pendingAttacks.length === 0) return
  const total = team.pendingAttacks.reduce((s, a) => s + a.opens, 0)
  team.pendingAttacks = []
  team.pendingOpens += total
  pushLog(state, team.id, `โดนโจมตี — ต้องเปิดเพิ่ม ${total} ป้าย`, { level: 'warn' })
}

// ตอบใน phase 'defending' — use = จำนวนการ์ดโจมตีที่จะกันด้วย Block (0 = ไม่กันเลย)
// เลือกได้ว่าจะกันกี่ใบ (เผื่ออยากเก็บ Block ไว้กัน Reverse/Shuffle ภายหลัง)
// กัน n ใบแรกของคิว — คิวที่เหลือโดนไปโดยปริยาย แล้วเข้า phase ใช้ item ตามปกติ
function resolveAttackDefense(state: EngineState, use: number): void {
  if (state.phase !== 'defending') return
  if (!Number.isInteger(use) || use < 0) return
  const team = currentTeam(state)
  if (team.pendingAttacks.length === 0) {
    team.pendingAttacks = []
    state.phase = state.settings.cardsEnabled ? 'cards' : 'opening'
    return
  }
  const n = Math.min(
    use,
    team.pendingAttacks.length,
    team.hand.filter((c) => c === 'block').length,
  )
  for (let i = 0; i < n; i++) {
    const bi = team.hand.indexOf('block')
    if (bi < 0) break
    team.hand.splice(bi, 1)
    team.stats.cardsPlayed.block += 1
    team.pendingAttacks.shift()
    pushLog(state, team.id, `${team.name} ใช้ Block กันโจมตี 1 ครั้ง`)
  }
  if (team.pendingAttacks.length > 0) applyPendingAttacks(state)
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
//
// FIX_LISTS ชุดที่สิบเอ็ด #2: ยกเว้นตอน "โดน Attack ค้างอยู่" (pendingOpens > 1)
//   ทีมที่โดนโจมตีติดหนี้เปิดป้ายไว้หลายใบ ถ้าปล่อยให้ timeout = เสีย turn เฉย ๆ
//   การโดน Attack จะกลายเป็นของฟรี (อยู่เงียบ ๆ ให้หมดเวลาแล้วหนี้หายทั้งก้อน)
//   ตอนนี้ระบบสุ่มเปิดป้ายให้แทน "ทีละอัน" ต่อการหมดเวลาหนึ่งครั้ง แล้วปล่อยให้
//   flow ปกติทำงานต่อ:
//     - เจอระเบิด → เข้า phase 'defusing' กู้ตาม flow ปกติ และถ้ากู้สำเร็จ
//       ackDefuse() จบ turn ทันที (§3.4.2) → หนี้ attack ที่เหลือไม่มีผล ไปทีมถัดไปเลย
//     - ปลอดภัย/glitch → openCell() หัก pendingOpens แล้วจบ turn เองเมื่อหมดหนี้
//   หนี้ก้อนสุดท้าย (pendingOpens === 1) ไม่เข้าเงื่อนไขนี้ — เป็นตาปกติ ใช้ FIX #18 เดิม
function timeout(state: EngineState): void {
  if (state.phase !== 'opening' && state.phase !== 'cards') return
  const team = currentTeam(state)

  if (team.pendingOpens > 1) {
    const candidates = hiddenCells(state)
    if (candidates.length > 0) {
      const cell = pickRandom(state.rng, candidates)
      pushLog(
        state,
        team.id,
        `${team.name} หมดเวลาระหว่างโดนโจมตี — ระบบสุ่มเปิด ${cell} ให้`,
        { level: 'warn' },
      )
      openCell(state, cell)
      return
    }
    // ไม่มีช่องให้เปิดแล้ว → ตกไปใช้ทางเดิม (เสีย turn)
  }

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
    case 'block':
      // Block ใช้เล่นตรง ๆ ไม่ได้ — ต้องมีทีมอื่นใช้ Attack/Reverse/Shuffle ก่อน
      // ถึงจะถูกถาม (phase blocking) ว่าจะใช้กันไหม การ์ดจึงต้องอยู่มือเสมอ
      return
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
      // FIX_LISTS ชุดใหม่: Skip เป็นการ์ดเชิงรุก — คนใช้ไม่ต้องเปิดป้าย แต่ทีมถัดไป
      // ต้องรับเคราะห์แทน (เปิดป้ายเร็วขึ้น 1 ตา) จึงให้ทีมถัดไปในทิศเอา Block มากันได้
      // ถ้ากันติด: Skip ล้ม → คนใช้เสียการ์ดฟรีและจบตาไปเอง (settleBlockChain)
      if (!offerBlock(state, nextAliveTeamId(state), 'skip')) {
        applySkip(state)
      }
      break
    case 'shield':
      // FIX #24: ใช้กับทีมตัวเองเท่านั้น — กางแล้วเล่นต่อในตาเดิมได้
      team.shieldCharges += 1
      state.lastCardResult = { card: 'shield' }
      pushLog(state, team.id, `${team.name} กาง Shield — กันระเบิดได้ 1 ครั้ง`)
      break
    case 'reverse':
      // FIX_LISTS #10: Reverse สลับลำดับของทั้งวง — ทีมอื่นเอา Block มากันได้
      // FIX_LISTS ชุดใหม่ #1: คนที่ได้ตอบก่อนคือ "ทีมที่อยู่ในทิศที่กำลังจะย้อนไป"
      //   คือทีมที่จะได้เล่นต่อถ้า Reverse ติด (เช่น ทีม2จบตา ทีม3ใช้ Reverse →
      //   ทิศพลิกกลับไปหาทีม2 ทีม2 จึงเป็นคนที่ถูกถามก่อน) ไม่ใช่ทีมถัดไปในทิศเดิม
      if (!offerBlock(state, nextAliveTeamId(state, -state.direction as 1 | -1), 'reverse')) {
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
      // โจมตีถูกคิวไว้ที่เป้าหมาย — โดนจริงตอนเริ่มตาของเป้าหมาย (กันด้วย Block ได้)
      playAttack(state, action.targetTeamId!)
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
    chain: [],
    counter: false,
  }
  state.phase = 'blocking'
  return true
}

// FIX_LISTS ชุดที่สาม #2: กันได้เฉพาะ effect ที่จะเกิดกับทีมตัวเองเท่านั้น
//   เดิมทุกทีมที่ถือ Block เข้ามากันแทนคนอื่นได้ (FIX_LISTS #10) — กติกาใหม่ตัดออก
//   คิวจึงมีได้อย่างมาก 1 ทีม คือทีมที่ effect กำลังจะลง (targetId) และต้อง
//   ยังรอด + ถือ Block จริง + ไม่ใช่คนใช้การ์ดเอง
// FIX_LISTS ชุดใหม่ #1: exclude = ทีมที่ประกาศกันไปแล้วในศึกนี้ (chain) — ห้ามกันซ้อนตัวเอง
export function blockAskQueue(
  state: { teams: Team[] },
  targetId: string,
  sourceId: string,
  exclude: string[] = [],
): string[] {
  const target = state.teams.find((t) => t.id === targetId)
  if (!target) return []
  const eligible =
    target.alive &&
    target.hand.includes('block') &&
    target.id !== sourceId &&
    !exclude.includes(target.id)
  return eligible ? [target.id] : []
}

// FIX #25: ตอบ popup — use = ใช้ Block กัน, ไม่ใช้ = ส่งคิวต่อให้ทีมถัดไปตอบ
// FIX_LISTS #10: ถามวนจนกว่าจะมีคนกัน หรือทุกทีมที่ถือ Block ตอบว่าไม่กัน
// FIX_LISTS ชุดใหม่ #1: Block กัน Block ได้ — ซ้อนเป็นชั้น (counter-block)
//   ทีมหนึ่งประกาศกัน → ไล่ถามทีมที่เหลือว่าจะกัน "Block ใบนั้น" ต่อไหม
//   กันต่อได้เรื่อย ๆ จนไม่มีใครกันแล้ว ชั้นที่ค้างอยู่สุดท้ายเป็นฝ่ายชนะ
//   ชั้นเป็นเลขคี่ = effect ถูกกันสำเร็จ, ชั้นเป็นเลขคู่ = Block ชั้นล่างสุดถูกล้ม
//   → effect เดิมทำงาน (ตรงกับตัวอย่าง: ทีม2 กัน แล้วทีม4 กันทีม2 → ทีม2 โดน)
function resolveBlock(state: EngineState, use: boolean): void {
  if (state.phase !== 'blocking' || !state.pendingBlock) return
  const pending = state.pendingBlock
  // ทีมที่กำลังถูกถามอยู่คือหัวคิว
  const responderId = pending.askQueue[0]
  const responder = state.teams.find((t) => t.id === responderId)

  if (use && responder && responder.alive && responder.hand.includes('block')) {
    const bi = responder.hand.indexOf('block')
    responder.hand.splice(bi, 1)
    responder.stats.cardsPlayed.block += 1
    const chain = [...pending.chain, responder.id]
    // ชั้นล่างสุดกัน effect เดิม ชั้นถัดมากัน Block ของชั้นก่อนหน้า
    const blockedName =
      chain.length === 1
        ? CARD_LABELS[pending.card]
        : `Block ของ ${teamName(state, chain[chain.length - 2])}`
    pushLog(state, responder.id, `${responder.name} ใช้ Block — กัน ${blockedName} ไว้ได้`)

    // ถามต่อว่ามีใครจะกัน Block ใบนี้อีกไหม (ทีมที่กันไปแล้วในศึกนี้ไม่ถูกถามซ้ำ)
    // ผู้ที่เสียประโยชน์จากชั้นนี้ได้ตอบก่อน: ชั้นแรก = คนใช้การ์ดเดิม,
    // ชั้นถัด ๆ ไป = ทีมที่เพิ่งถูกกัน (chain ก่อนหน้า)
    const hurtId = chain.length === 1 ? pending.sourceTeamId : chain[chain.length - 2]
    const nextQueue = blockAskQueue(state, hurtId, responder.id, chain)
    if (nextQueue.length > 0) {
      state.pendingBlock = { ...pending, chain, counter: true, askQueue: nextQueue }
      return
    }
    settleBlockChain(state, { ...pending, chain })
    return
  }

  // ทีมนี้ไม่กัน → ถามทีมถัดไปในคิวที่ยังรอดและยังถือ Block อยู่จริง
  const rest = pending.askQueue.slice(1).filter((id) => {
    const t = state.teams.find((x) => x.id === id)
    return t?.alive && t.hand.includes('block')
  })
  if (rest.length > 0) {
    state.pendingBlock = { ...pending, askQueue: rest }
    return
  }

  // หมดคิว — ตัดสินจากจำนวนชั้นที่ค้างอยู่
  settleBlockChain(state, pending)
}

// FIX_LISTS ชุดใหม่ #1: ปิดศึก Block — ชั้นคี่ = effect ถูกกัน, ชั้นคู่/ไม่มีชั้น = effect ทำงาน
function settleBlockChain(state: EngineState, pending: NonNullable<EngineState['pendingBlock']>): void {
  const blocked = pending.chain.length % 2 === 1
  state.pendingBlock = null
  state.phase = 'cards'

  if (blocked) {
    // การ์ดถูกกัน → ทีมที่ใช้จบ turn ไปเลย (เสียการ์ดฟรี)
    // FIX_LISTS ชุดใหม่: Skip ที่ถูกกันก็จบตาเหมือนกัน (endTurn ข้างล่างนี่แหละ) —
    // ต่างกันที่ "เสียการ์ดเปล่า" ไม่ได้บังคับให้คนใช้กลับไปเปิดป้าย เพราะ Skip
    // ไม่มี effect ค้างให้ย้อน จึงเขียน log ให้ชัดว่าผลคือใครเสียอะไร ไม่ให้ผู้เล่นเข้าใจผิด
    if (pending.card === 'skip') {
      pushLog(
        state,
        pending.targetTeamId,
        `${teamName(state, pending.targetTeamId)} กัน Skip ไว้ได้ — คนใช้เสียการ์ดเปล่าและจบตาไปตามเดิม`,
        { level: 'warn' },
      )
    }
    endTurn(state, { draw: false })
    return
  }

  if (pending.chain.length > 0) {
    // มีคนกันแต่ถูกกันซ้อนจนล้มหมด → effect เดิมทำงานตามปกติ
    pushLog(
      state,
      pending.chain[0],
      `Block ของ ${teamName(state, pending.chain[0])} ถูกกันไว้ — ${CARD_LABELS[pending.card]} ทำงานตามปกติ`,
      { level: 'warn' },
    )
  }
  if (pending.card === 'attack') playAttack(state, pending.targetTeamId)
  else if (pending.card === 'reverse') applyReverse(state)
  else if (pending.card === 'shuffle') playShuffle(state)
  else if (pending.card === 'skip') applySkip(state)
}

function teamName(state: EngineState, id: string): string {
  return state.teams.find((t) => t.id === id)?.name ?? id
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
  // FIX_LISTS ชุดที่สาม #3: mark ทุกช่องในโซนที่ตรวจ ให้เห็นบนกระดานว่าเคยสแกนแล้ว
  // ผลเป็นของ "ทั้งโซน" (สแกนบอกแค่ว่ามี/ไม่มีระเบิดในช่วง) จึงทาเท่ากันทุกช่องในช่วง
  // ทับ mark เก่าได้ — ผลใหม่สดกว่าเสมอ (กระดานยังไม่เปลี่ยนระหว่างสองครั้งนั้น)
  for (let n = lo; n <= hi; n++) state.scanMarks[n] = found
  pushLog(state, team.id, `${team.name} Scan ${target}: ${found ? 'มีระเบิด!' : 'ไม่มีระเบิด'}`)
}

// FIX_LISTS #10: แยก effect ของ Reverse ออกมา เพื่อให้เรียกได้ทั้งตอนใช้ทันที
// และตอนที่ผ่านด่าน Block มาแล้ว (resolveBlock)
// FIX_LISTS ชุดใหม่: แยก effect ของ Skip ออกมา เพื่อเรียกได้ทั้งตอนใช้ทันที
// และตอนที่ผ่านด่าน Block มาแล้ว (settleBlockChain) — แบบเดียวกับ applyReverse
function applySkip(state: EngineState): void {
  const team = currentTeam(state)
  state.lastCardResult = { card: 'skip' }
  pushLog(state, team.id, `${team.name} ใช้ Skip — ข้าม turn`)
  endTurn(state, { draw: false })
}

function applyReverse(state: EngineState): void {
  const team = currentTeam(state)
  state.direction = (state.direction === 1 ? -1 : 1) as 1 | -1
  state.lastCardResult = { card: 'reverse' }
  pushLog(state, team.id, `${team.name} ใช้ Reverse — สลับทิศทาง`)
  endTurn(state, { draw: false })
}

// ทีมถัดไปที่ยังรอด — ใช้เป็น "เป้าหมาย" ของการ์ดที่กระทบทั้งวง (Reverse/Shuffle)
// เพื่อให้คนที่เสียประโยชน์ที่สุดได้สิทธิ์ตอบ Block ก่อน (FIX_LISTS #10)
// FIX_LISTS ชุดใหม่ #1: dir ระบุได้ — Reverse ต้องมองไปทาง "ทิศที่จะย้อนไป"
// (ทิศตรงข้ามกับทิศปัจจุบัน) เพราะนั่นคือทีมที่ Reverse ส่งผลถึงจริง
function nextAliveTeamId(state: EngineState, dir: 1 | -1 = state.direction): string {
  const len = state.teams.length
  let i = state.currentTeamIndex
  for (let step = 1; step < len; step++) {
    i = (i + dir + len) % len
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
  // FIX_LISTS ชุดที่สาม #3: ระเบิดย้ายทั้งกระดาน — ผลสแกนเก่าใช้ไม่ได้แล้ว
  state.scanMarks = {}
  pushLog(state, team.id, `${team.name} ใช้ Shuffle — ระเบิดย้ายตำแหน่งใหม่`)
}

// Attack: เป้าหมายโดนคิวโจมตี (โอนกองของผู้โจมตี + ใบใหม่) — จะโดนจริงตอนเริ่มตา
// ของเป้าหมาย (phase 'defending') ถ้าไม่กันด้วย Block (§7.3) จบ turn ทันที
function playAttack(state: EngineState, targetId: string): void {
  const team = currentTeam(state)
  const target = state.teams.find((t) => t.id === targetId)
  if (!target) return
  target.pendingAttacks.push({ opens: team.pendingOpens })
  state.lastCardResult = { card: 'attack', targetTeamId: targetId }
  pushLog(
    state,
    team.id,
    `${team.name} โจมตี ${target.name} — ${target.name} ต้องเปิดเพิ่ม (กันด้วย Block ได้ก่อนถึงตา)`,
  )
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
// ย้ายไม่ได้ (ช่อง hidden ว่างหมด) → คืนระเบิดกลับช่องเดิม ระเบิดไม่หายจากระบบ
// คืน true ถ้าย้ายสำเร็จ, false ถ้าไม่มีที่ว่าง (ระเบิดยังอยู่ที่ fromCell)
// หมายเหตุ: ต้องเรียกก่อน mark ช่อง (defused/glitched) เสมอ — fromCell ต้องยังเป็น hidden
// ไม่งั้นระเบิดที่คืนกลับจะไปค้างบนช่องที่เปิดแล้ว (ระเบิดผี)
function relocateBomb(state: EngineState, fromCell: number, kind: BombKind): boolean {
  // FIX_LISTS ชุดที่สาม #3: ระเบิดย้ายที่แล้ว — ผลสแกนเก่าอาจไม่จริงอีกต่อไป ล้าง mark ทิ้ง
  state.scanMarks = {}
  state.bombs.delete(fromCell)
  const candidates = hiddenCells(state).filter((c) => c !== fromCell && !state.bombs.has(c))
  if (candidates.length === 0) {
    state.bombs.set(fromCell, kind)
    return false
  }
  const target = pickRandom(state.rng, candidates)
  state.bombs.set(target, kind)
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

  // FIX_LISTS ชุดที่สาม #3: โควตาขยับ = ระเบิดถูกเติม/เก็บออก → ผลสแกนเก่าใช้ไม่ได้
  state.scanMarks = {}

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