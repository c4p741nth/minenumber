import { CARD_LABELS, drawRandomCard } from './cards'
import { createRng, pickRandom, shuffle } from './rng'
import { setupBombs } from './setup'
import { maxScanRadiusFor } from './config'
import type {
  BombKind,
  CardResult,
  CardType,
  CellState,
  GameAction,
  GameSettings,
  LogEntry,
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
  teams: Team[]
  currentTeamIndex: number
  direction: 1 | -1
  phase: Phase
  rangeMin: number
  rangeMax: number
  turnNumber: number
  log: LogEntry[]
  nextLogId: number
  eliminations: number
  pendingDefuse: { cell: number } | null
  // ตัดสินไว้ตอน OPEN_CELL (§5) — สีที่เลือกไม่มีผล
  pendingDefuseSurvived: boolean
  // FIX #25: การ์ดที่ค้างรอคำตอบว่าเป้าหมายจะใช้ Block กันไหม
  pendingBlock: {
    targetTeamId: string
    sourceTeamId: string
    card: CardType
    targetCell?: number
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
    teams,
    currentTeamIndex: 0,
    direction: 1,
    phase: clampedSettings.cardsEnabled ? 'cards' : 'opening',
    rangeMin: clampedSettings.rangeMin,
    rangeMax: clampedSettings.rangeMax,
    turnNumber: 1,
    log: [],
    nextLogId: 0,
    eliminations: 0,
    pendingDefuse: null,
    pendingDefuseSurvived: false,
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

  const restored: EngineState = {
    settings: state.settings,
    rng: createRng(seed),
    bombs,
    cells: { ...state.cells },
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
    log: state.log.map((l) => ({ ...l })),
    nextLogId,
    eliminations,
    pendingDefuse: state.pendingDefuse ? { ...state.pendingDefuse } : null,
    pendingDefuseSurvived:
      state.lastResult?.kind === 'real' ? state.lastResult.survived : false,
    pendingBlock: state.pendingBlock ? { ...state.pendingBlock } : null,
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
    rangeMin: state.rangeMin,
    rangeMax: state.rangeMax,
    bombsRemaining: state.bombs.size,
    turnNumber: state.turnNumber,
    log: state.log.map((l) => ({ ...l })),
    pendingDefuse: state.pendingDefuse ? { ...state.pendingDefuse } : null,
    pendingBlock: state.pendingBlock ? { ...state.pendingBlock } : null,
    lastResult: state.lastResult ? { ...state.lastResult } : null,
    lastCardResult: state.lastCardResult ? { ...state.lastCardResult } : null,
    lastDraw: state.lastDraw ? { ...state.lastDraw } : null,
    currentGlitched: state.currentGlitched,
    currentBlocked: state.currentBlocked,
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
  }
}

function pushLog(
  state: EngineState,
  teamId: string | null,
  message: string,
  extra?: { kind?: 'draw'; card?: CardType },
): void {
  state.log.push({ id: state.nextLogId++, turn: state.turnNumber, teamId, message, ...extra })
}

function currentTeam(state: EngineState): Team {
  return state.teams[state.currentTeamIndex]
}

function aliveTeams(state: EngineState): Team[] {
  return state.teams.filter((t) => t.alive)
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
      pushLog(state, team.id, `${team.name} มี Shield — รอดจากระเบิด ระเบิดย้ายไปที่อื่น`)
      endTurn(state)
      return
    }
    // สุ่มผลล่วงหน้า ไม่ใช่สุ่มสี (§5)
    const survived = state.rng() < 0.5
    state.pendingDefuse = { cell }
    state.pendingDefuseSurvived = survived
    state.phase = 'defusing'
    state.lastResult = { kind: 'real', survived }
    pushLog(state, team.id, `${team.name} เจอระเบิด! ต้องตัดสาย`)
    return
  }

  if (bomb === 'glitch') {
    state.cells[cell] = 'glitched'
    // FIX #35: glitch ที่โดนเปิดต้องย้ายไปช่องอื่น ไม่ใช่หายไปเฉย ๆ
    // (เดิม delete ทิ้ง → ระเบิดในกระดานลดลงเรื่อย ๆ ระหว่างเล่น)
    relocateBomb(state, cell, 'glitch')
    team.glitchTurnsLeft = 2
    state.lastResult = { kind: 'glitch' }
    pushLog(state, team.id, `${team.name} เจอ Glitch bomb — ติดกลิตช์ 2 turn`)
    endTurn(state, { draw: false }) // ติดกลิตช์ไม่ได้จั่วการ์ด
    return
  }

  // safe
  state.cells[cell] = 'safe'
  state.lastResult = { kind: 'safe' }
  pushLog(state, team.id, `${team.name} เปิด ${cell} — ปลอดภัย`)
  if (state.settings.shrinkingEnabled) applyShrink(state, cell)
  team.pendingOpens -= 1
  if (team.pendingOpens <= 0) endTurn(state)
}

function chooseWire(state: EngineState, _wire: 'red' | 'blue'): void {
  if (state.phase !== 'defusing' || !state.pendingDefuse) return
  const cell = state.pendingDefuse.cell
  const team = currentTeam(state)
  const survived = state.pendingDefuseSurvived
  state.pendingDefuse = null

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
    )
    // จบ turn ทันที ไม่ต้องเปิดต่อแม้ pendingOpens ยังเหลือ (§3.4.2)
    endTurn(state)
  } else {
    state.cells[cell] = 'detonated'
    state.bombs.delete(cell)
    state.lastResult = { kind: 'real', survived: false }
    eliminateTeam(state, team)
    pushLog(state, team.id, `${team.name} ระเบิด! ตกรอบ`)
    endTurn(state)
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
    pushLog(state, alive[0].id, `${alive[0].name} ชนะ!`)
    return
  }
  // ช่อง hidden หมดแต่ยังเหลือ >1 ทีม → เสมอ (§8)
  if (hiddenCells(state).length === 0) {
    state.phase = 'gameover'
    pushLog(state, null, 'ช่องหมด — ทุกทีมที่รอดเสมอกัน')
    return
  }
  // FIX #40: ระเบิดจริงต้อง = ทีมที่ยังรอด − 1 เสมอ
  // ไม่งั้นจะเกิดเคส "ระเบิดหมด ช่องหมด แต่ทีมยังเหลือหลายทีม"
  // glitch ไม่นับรวมในโควตานี้ และระเบิดปกติไม่ mutate เป็น glitch
  enforceRealBombQuota(state, alive.length)

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
  pushLog(state, team.id, `${team.name} หมดเวลา — เสีย turn`)
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
      state.direction = (state.direction === 1 ? -1 : 1) as 1 | -1
      state.lastCardResult = { card: 'reverse' }
      pushLog(state, team.id, `${team.name} ใช้ Reverse — สลับทิศทาง`)
      endTurn(state, { draw: false })
      break
    case 'shuffle':
      playShuffle(state)
      break
    case 'attack':
      // FIX #25: ถ้าเป้าหมายมี Block ให้ถามก่อนว่าจะกันไหม
      if (!offerBlock(state, action.targetTeamId!, 'attack')) {
        playAttack(state, action.targetTeamId!)
      }
      break
  }
}

// FIX #25: เป้าหมายมี Block ค้างอยู่ → เข้าสู่ phase 'blocking' รอคำตอบ
// คืน true ถ้าต้องรอ (การ์ดยังไม่ resolve), false ถ้าเล่นต่อได้เลย
function offerBlock(state: EngineState, targetId: string, card: CardType): boolean {
  const target = state.teams.find((t) => t.id === targetId)
  if (!target || !target.alive || target.blockCharges <= 0) return false
  state.pendingBlock = {
    targetTeamId: targetId,
    sourceTeamId: currentTeam(state).id,
    card,
  }
  state.phase = 'blocking'
  return true
}

// FIX #25: ตอบ popup — use = ใช้ Block กัน, ไม่ใช้ = ปล่อยให้ effect ทำงาน
function resolveBlock(state: EngineState, use: boolean): void {
  if (state.phase !== 'blocking' || !state.pendingBlock) return
  const pending = state.pendingBlock
  const target = state.teams.find((t) => t.id === pending.targetTeamId)
  state.pendingBlock = null
  state.phase = 'cards'

  if (use && target && target.blockCharges > 0) {
    target.blockCharges -= 1
    pushLog(
      state,
      target.id,
      `${target.name} ใช้ Block — กัน ${CARD_LABELS[pending.card]} ไว้ได้`,
    )
    // การ์ดถูกกัน → ทีมที่ใช้จบ turn ไปเลย (เสียการ์ดฟรี)
    endTurn(state, { draw: false })
    return
  }

  // ไม่กัน → effect ทำงานตามปกติ
  if (pending.card === 'attack') playAttack(state, pending.targetTeamId)
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

function playShuffle(state: EngineState): void {
  const team = currentTeam(state)
  const bombs = Array.from(state.bombs.entries())
  const targets = hiddenCells(state).filter((c) => !state.bombs.has(c))
  const shuffled = shuffle(state.rng, targets)
  state.bombs.clear()
  for (let i = 0; i < bombs.length && i < shuffled.length; i++) {
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