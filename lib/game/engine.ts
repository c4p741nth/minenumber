import { drawRandomCard } from './cards'
import { LIMITS } from './config'
import { createRng, pickRandom, shuffle } from './rng'
import { refillBombs, setupBombs } from './setup'
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
  lastResult: OpenResult | null
  lastCardResult: CardResult | null
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
    cardsPlayed: {
      scan: 0,
      skip: 0,
      block: 0,
      reverse: 0,
      shuffle: 0,
      attack: 0,
    },
  }
}

export function createGame(settings: GameSettings, seed: number): GameHandle {
  const rng = createRng(seed)
  const teams = settings.teamNames.map((name, i) => ({
    id: String(i),
    name,
    alive: true,
    hand: [] as CardType[],
    glitchTurnsLeft: 0,
    blockedTurnsLeft: 0,
    pendingOpens: 1,
    eliminatedAt: null,
    stats: zeroStats(),
  }))
  // เริ่มเกมทุกทีมได้ 1 ใบสุ่ม (§7.1)
  if (settings.cardsEnabled) {
    for (const t of teams) drawRandomCard(t.hand, rng)
  }

  const state: EngineState = {
    settings,
    rng,
    bombs: setupBombs(settings, rng),
    cells: {},
    teams,
    currentTeamIndex: 0,
    direction: 1,
    phase: settings.cardsEnabled ? 'cards' : 'opening',
    rangeMin: settings.rangeMin,
    rangeMax: settings.rangeMax,
    turnNumber: 1,
    log: [],
    nextLogId: 0,
    eliminations: 0,
    pendingDefuse: null,
    pendingDefuseSurvived: false,
    lastResult: null,
    lastCardResult: null,
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
    teams: state.teams.map((t) => ({ ...t, hand: t.hand.slice() })),
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
    lastResult: state.lastResult ? { ...state.lastResult } : null,
    lastCardResult: state.lastCardResult ? { ...state.lastCardResult } : null,
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
    teams: state.teams.map((t) => ({ ...t, hand: t.hand.slice() })),
    currentTeamIndex: state.currentTeamIndex,
    direction: state.direction,
    cells: { ...state.cells },
    rangeMin: state.rangeMin,
    rangeMax: state.rangeMax,
    bombsRemaining: state.bombs.size,
    turnNumber: state.turnNumber,
    log: state.log.map((l) => ({ ...l })),
    pendingDefuse: state.pendingDefuse ? { ...state.pendingDefuse } : null,
    lastResult: state.lastResult ? { ...state.lastResult } : null,
    lastCardResult: state.lastCardResult ? { ...state.lastCardResult } : null,
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
    case 'DRAW_CARD':
      drawCardAction(state, action.teamId)
      break
  }
}

function pushLog(state: EngineState, teamId: string | null, message: string): void {
  state.log.push({ id: state.nextLogId++, turn: state.turnNumber, teamId, message })
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
    state.bombs.delete(cell)
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
    const candidates = hiddenCells(state).filter((c) => c !== cell && !state.bombs.has(c))
    if (candidates.length > 0) {
      const target = pickRandom(state.rng, candidates)
      state.bombs.delete(cell)
      state.bombs.set(target, 'real')
    }
    // ไม่มี hidden ให้ย้าย → ระเบิดคงค้างที่เดิม (dormant กดซ้ำไม่ได้) ไม่หายจากระบบ
    state.lastResult = { kind: 'real', survived: true }
    pushLog(state, team.id, `${team.name} กู้สำเร็จ! ระเบิดย้ายไปที่อื่น`)
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
  // Safety net (§8): ระเบิดหมดแต่ยังเหลือ >1 ทีม → เติม
  // (ตามกติกาจริงเกิดไม่ได้ แต่กันการค้างเกม)
  if (state.bombs.size === 0) {
    const added = refillBombs(
      state.bombs,
      state.cells,
      state.rangeMin,
      state.rangeMax,
      alive.length,
      state.rng,
    )
    pushLog(state, null, `เติมระเบิดรอบใหม่ ${added} ลูก`)
  }

  if (acting.alive) acting.pendingOpens = 1
  // จั่วการ์ดเมื่อรอดจบ turn และไม่ติด glitch (§7.1)
  if (
    draw &&
    acting.alive &&
    !state.currentGlitched &&
    state.settings.cardsEnabled &&
    acting.hand.length < LIMITS.maxHandSize
  ) {
    drawRandomCard(acting.hand, state.rng)
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
  const team = state.teams[i]
  // glitch/block ลดตอนเริ่ม turn ของทีมนั้นเอง (§3.4.9)
  state.currentBlocked = team.blockedTurnsLeft > 0
  if (state.currentBlocked) team.blockedTurnsLeft -= 1
  state.currentGlitched = team.glitchTurnsLeft > 0
  if (state.currentGlitched) team.glitchTurnsLeft -= 1
}

// หมดเวลา → สุ่มเปิดช่อง hidden ให้ 1 ช่อง (§6)
function timeout(state: EngineState): void {
  if (state.phase !== 'opening') return
  const team = currentTeam(state)
  const hidden = hiddenCells(state)
  if (hidden.length === 0) {
    endTurn(state)
    return
  }
  const cell = pickRandom(state.rng, hidden)
  pushLog(state, team.id, 'หมดเวลา — สุ่มเปิดช่องให้อัตโนมัติ')
  openCell(state, cell)
}

function drawCardAction(state: EngineState, teamId: string): void {
  const team = state.teams.find((t) => t.id === teamId)
  if (!team || !team.alive || !state.settings.cardsEnabled) return
  if (team.glitchTurnsLeft > 0 || team.hand.length >= LIMITS.maxHandSize) return
  drawRandomCard(team.hand, state.rng)
}

// ใช้การ์ด 1 ใบ — ต้องอยู่ในช่วงใช้การ์ด ('cards') และไม่ติด glitch/block
function playCard(state: EngineState, action: Extract<GameAction, { type: 'PLAY_CARD' }>): void {
  if (state.phase !== 'cards') return
  const team = currentTeam(state)
  if (state.currentGlitched || state.currentBlocked) return
  const idx = team.hand.indexOf(action.card)
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
    case 'block':
    case 'attack':
      if (
        action.targetTeamId === undefined ||
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
    case 'block':
      playBlock(state, action.targetTeamId!)
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
      playAttack(state, action.targetTeamId!)
      break
  }
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
  state.lastCardResult = { card: 'scan', found }
  pushLog(state, team.id, `${team.name} Scan ${target}: ${found ? 'มีระเบิด!' : 'ไม่มีระเบิด'}`)
}

function playBlock(state: EngineState, targetId: string): void {
  const team = currentTeam(state)
  const target = state.teams.find((t) => t.id === targetId)
  if (!target) return
  target.blockedTurnsLeft += 1 // ซ้อนชั้นได้
  state.lastCardResult = { card: 'block', targetTeamId: targetId }
  pushLog(state, team.id, `${team.name} Block ${target.name} — แบนการ์ดในตาถัดไป`)
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

// โหมดเร่ง (§9): หด range หลังเปิด safe จากฝั่งที่ใกล้เลขที่เลือกกว่า
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
  pushLog(state, currentTeam(state).id, `โหมดเร่ง — ช่วงหดเหลือ ${newMin}–${newMax}`)
}

function hiddenInRange(state: EngineState, min: number, max: number): number[] {
  const out: number[] = []
  for (let n = min; n <= max; n++) {
    if (!(n in state.cells)) out.push(n)
  }
  return out
}