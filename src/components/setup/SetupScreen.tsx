import { useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import {
  DEFAULTS,
  LIMITS,
  autoCellsFor,
  bombQuota,
  defaultTeamNames,
  glitchCountFor,
  maxScanRadiusFor,
  minCellsFor,
  suggestedScanRadius,
} from '@/lib/game/config'
import { chanceDisplay, suggestRange, type BalanceVerdict } from '@/lib/game/balance'
import { createRng, randomSeed, shuffle } from '@/lib/game/rng'
import type { GameSettings } from '@/lib/game/types'
import { RulesPanel } from './RulesPanel'
import { confirmDialog } from '@/components/ui/alert'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { DisplayModeToggle } from '@/components/ui/DisplayModeToggle'
import { CARD_DECK_SIZE } from '@/lib/game/cards'

interface Props {
  initial: GameSettings
  onStart: (s: GameSettings) => void
  onBack: () => void
}

// เก็บเลขเป็น string เสมอ — พิมพ์ลบจนว่างได้โดยไม่ดีดค่า/ไม่ขึ้น NaN
// ค่าจริงคำนวณตอนใช้ (clamp) และ fix ตอน blur/start เท่านั้น (W1.2)
function fixInput(
  current: string,
  min: number,
  max: number,
  fallback: number,
  set: (v: string) => void,
): void {
  const n = Number(current)
  if (current.trim() === '' || Number.isNaN(n)) {
    set(String(fallback))
    return
  }
  set(String(Math.min(Math.max(n, min), max)))
}

export function SetupScreen({ initial, onStart, onBack }: Props) {
  const [names, setNames] = useState<string[]>(initial.teamNames)
  const [cellsInput, setCellsInput] = useState(String(initial.rangeMax))
  // FIX_LISTS #1: ช่องเดินตามสูตรอัตโนมัติ (ระเบิดจริง + glitch + การ์ด) จนกว่าผู้ใช้จะพิมพ์เอง
  // พอแก้เองแล้วหยุดตาม — ไม่งั้นค่าที่ตั้งใจ (เช่น ช่อง = ระเบิด #2/#15) จะโดนเขียนทับ
  const [cellsTouched, setCellsTouched] = useState(false)
  const [turnInput, setTurnInput] = useState(String(initial.turnSeconds))
  const [glitchEnabled, setGlitchEnabled] = useState(initial.glitchEnabled)
  const [glitchMode, setGlitchMode] = useState<'auto' | 'manual'>(initial.glitchMode)
  const [glitchRatioInput, setGlitchRatioInput] = useState(String(Math.round(initial.glitchRatio * 100)))
  const [glitchCountInput, setGlitchCountInput] = useState(String(initial.glitchCount))
  // FIX_LISTS ชุดใหม่ #5: จำนวน turn ที่โดน glitch แล้วใช้ item ไม่ได้ — ตั้งค่าได้แล้ว
  const [glitchLockInput, setGlitchLockInput] = useState(String(initial.glitchLockTurns))
  // FIX_LISTS ชุดที่สิบสี่ #3: เหยียบ glitch ซ้ำตอนยังติดอยู่ — สะสม หรือรีเซ็ตเป็นค่าที่ตั้งไว้
  //   snapshot เก่าไม่มี field นี้ → ?? false = พฤติกรรมเดิม (รีเซ็ต)
  const [glitchStack, setGlitchStack] = useState(initial.glitchStack ?? false)
  const [cardsEnabled, setCardsEnabled] = useState(initial.cardsEnabled)
  const [handLimited, setHandLimited] = useState(initial.maxHandSize > 0)
  const [maxHandInput, setMaxHandInput] = useState(String(initial.maxHandSize || LIMITS.minHandSize))
  const [startingHandInput, setStartingHandInput] = useState(String(initial.startingHand))
  const [scanRadiusInput, setScanRadiusInput] = useState(String(initial.scanRadius))
  const [shrinkingEnabled, setShrinkingEnabled] = useState(initial.shrinkingEnabled)
  // FIX_LISTS #9: เอา YouTube link ออก — เหลือระดับเสียง effect อย่างเดียว
  const [sfxVolumeInput, setSfxVolumeInput] = useState(String(initial.sfxVolume))
  const [defuseSecondsInput, setDefuseSecondsInput] = useState(String(initial.defuseSeconds))
  const [defendSecondsInput, setDefendSecondsInput] = useState(String(initial.defendSeconds))
  const [countInput, setCountInput] = useState(String(names.length))
  const [settingsOpen, setSettingsOpen] = useState(false)
  // FIX #8: ตั้งค่าเป็น sidebar + เมนูหมวด — จำหมวดที่เลือกไว้
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('bomb')

  // ค่าที่เอาไปใช้จริง — ว่าง = ใช้ค่าต่ำสุด (แต่ไม่ดีดค่าใน input ระหว่างพิมพ์)
  const teams = names.length
  const quota = bombQuota(teams)
  const glitchRatio = clampInt(Number(glitchRatioInput) / 100, 0, LIMITS.maxGlitchRatio)
  const deckSize = cardsEnabled ? CARD_DECK_SIZE : 0
  // FIX_LISTS #1: ขนาดกระดานอัตโนมัติ — clamp glitch กับกระดานอัตโนมัติเอง
  // (ถ้า clamp กับ `cells` จะวนเป็นงูกินหาง เพราะ cells ก็มาจาก glitch)
  const autoGlitch = glitchEnabled
    ? glitchCountFor(quota, quota + LIMITS.maxGlitchCount, glitchMode, glitchRatio, Number(glitchCountInput) || 0)
    : 0
  // FIX_LISTS #3 + ชุดใหม่ #4: ขั้นต่ำต้องขยับตาม option ที่เปิดอยู่ ไม่ใช่ระเบิดจริงอย่างเดียว
  // ไม่งั้นพอลดช่องลงชนขั้นต่ำ glitch bomb ที่ตั้งไว้จะถูก clamp หายไปเงียบ ๆ
  // นับ glitch ทั้งสองโหมด: manual = จำนวนที่กรอก, auto = จำนวนที่สูตรสัดส่วนจะได้
  // (เดิมนับเฉพาะ manual → ระเบิด 5 + glitch auto 1 + การ์ด 7 ให้ลดเหลือ 12 ได้ ทั้งที่ต้อง 13)
  const minOpts = { glitchCount: autoGlitch, deckSize }
  const minCells = minCellsFor(teams, minOpts)
  const autoCells = clampInt(autoCellsFor(quota, autoGlitch, deckSize), minCells, LIMITS.maxRange)
  const cells = cellsTouched
    ? clampInt(Number(cellsInput), LIMITS.minRange, LIMITS.maxRange)
    : autoCells
  const scanR = clampInt(Number(scanRadiusInput), LIMITS.minScanRadius, maxScanRadiusFor(cells))
  // glitch ที่ลงกระดานจริง — clamp กับจำนวนช่องที่ใช้จริง
  const glitchCount = glitchEnabled
    ? glitchCountFor(quota, cells, glitchMode, glitchRatio, Number(glitchCountInput) || 0)
    : 0
  // FIX_LISTS ชุดใหม่ #3: "โอกาสโดนระเบิด" นับเฉพาะระเบิดจริง ไม่รวม glitch
  // glitch เปิดโดนแล้วไม่ตกรอบ (แค่เสียตา/ติดล็อก item) จึงไม่ใช่ "โอกาสโดนระเบิด"
  // — ตรงกับแถบระหว่างเล่นที่ใช้ realBombsRemaining อยู่แล้ว (#16)
  const chance = chanceDisplay(quota, cells, teams, minOpts)
  // FIX_LISTS ชุดใหม่ #7/#8: ทุกเคสแสดงเป็น "แถบสี + ตัวเลข %" ชุดเดียวกัน
  // unplayable (ช่องน้อยกว่าขั้นต่ำ) และ certain (ระเบิดเต็มกระดาน) = โอกาสโดน 100% โหดสุด
  const chancePercent = chance.kind === 'normal' ? chance.percent : 100
  const chanceLevel: BalanceVerdict = chance.kind === 'normal' ? chance.level : 'brutal'
  const glitchLock = clampInt(
    Number(glitchLockInput),
    LIMITS.minGlitchLockTurns,
    LIMITS.maxGlitchLockTurns,
  )
  // ค่าแนะนำต้องไม่ต่ำกว่าขั้นต่ำ ไม่งั้นกดปุ่ม "แนะนำ" แล้วเริ่มเกมไม่ได้
  const suggestedCells = Math.max(suggestRange(teams).max, minCells)
  const canStart = cells >= minCells

  function isDefaultName(name: string, index: number): boolean {
    return name.trim() === `ทีม ${index + 1}`
  }

  function setTeamName(i: number, v: string) {
    setNames(names.map((n, j) => (j === i ? v : n)))
  }

  async function applyCount() {
    const target = clampInt(Number(countInput) || teams, LIMITS.minTeams, LIMITS.maxTeams)
    if (target === teams) return
    if (target < teams) {
      const removed = names.slice(target)
      const anyEdited = removed.some((n, i) => !isDefaultName(n, target + i))
      if (anyEdited) {
        const ok = await confirmDialog({
          title: `ลดเหลือ ${target} ทีม?`,
          text: `ทีม ${target + 1}–${teams} ที่ถูกตัดมีชื่อที่แก้เองอยู่ — จะตัดทิ้งจริงไหม?`,
          confirmText: 'ตัดทิ้ง',
        })
        if (!ok) return
      }
      setNames(names.slice(0, target))
    } else {
      setNames([...names, ...defaultTeamNames(target).slice(teams)])
    }
    setCountInput(String(target))
  }

  function removeTeam(i: number) {
    if (teams <= LIMITS.minTeams) return
    const next = names.filter((_, j) => j !== i)
    setNames(next)
    setCountInput(String(next.length))
  }

  function shuffleNames() {
    setNames(shuffle(createRng(randomSeed()), names))
  }

  function handleStart() {
    onStart({
      teamNames: names.map((n, i) => n.trim() || `ทีม ${i + 1}`),
      rangeMin: 1, // W1.1: เลขเริ่มต้นคือ 1 เสมอ → ล็อกตายตัว
      rangeMax: cells, // FIX_LISTS #1: ค่าอัตโนมัติ หรือค่าที่ผู้ใช้ตั้งเอง
      turnSeconds: clampInt(Number(turnInput), 0, LIMITS.maxTurnSeconds),
      glitchEnabled,
      glitchMode,
      glitchRatio: clampInt(Number(glitchRatioInput) / 100, 0, LIMITS.maxGlitchRatio),
      glitchCount: clampInt(Number(glitchCountInput), 0, LIMITS.maxGlitchCount),
      glitchLockTurns: glitchLock,
      glitchStack,
      cardsEnabled,
      maxHandSize: handLimited
        ? clampInt(Number(maxHandInput), LIMITS.minHandSize, LIMITS.maxHandSizeCap)
        : 0, // 0 = ไม่จำกัด (W5.1)
      startingHand: clampInt(Number(startingHandInput), 0, LIMITS.maxStartingHand),
      scanRadius: clampInt(
        Number(scanRadiusInput),
        LIMITS.minScanRadius,
        maxScanRadiusFor(cells),
      ),
      shrinkingEnabled,
      defuseSeconds: clampInt(Number(defuseSecondsInput), 0, LIMITS.maxDefuseSeconds),
      defendSeconds: clampInt(Number(defendSecondsInput), 0, LIMITS.maxDefendSeconds),
      sfxVolume: clampInt(Number(sfxVolumeInput), 0, 100),
    })
  }

  const toggle = (label: string, desc: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="block cursor-pointer">
      <span className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-6 w-6 accent-[var(--primary)]"
        />
        <span className="text-lg font-semibold">{label}</span>
      </span>
      <span className="mt-1 block pl-9 text-sm leading-6 text-muted-foreground">{desc}</span>
    </label>
  )

  return (
    // FIX_LISTS ชุดที่สิบ #3: หน้าตั้งค่าต้องเลื่อนได้เสมอ ไม่ใช่เฉพาะตอนกางกติกา
    //   เดิมใช้ min-h-screen (=100vh) เฉย ๆ — พอเนื้อหาสูงกว่าจอนิดเดียว (ทีมเยอะ,
    //   โหมด TV ที่ตัวอักษรคูณ 1.5) บางเบราว์เซอร์/บนมือถือที่แถบ URL ซ่อน-โผล่
    //   จะคำนวณ 100vh ไม่ตรงกับพื้นที่จริง เลยเลื่อนไม่ได้ทั้งที่เนื้อหาล้น
    //   h-dvh = สูงเท่าพื้นที่จริงที่มองเห็น (ขยับตามแถบ URL ที่ซ่อน-โผล่)
    //   + overflow-y-auto ที่ตัว root = มีตัว scroll ของตัวเองเสมอเมื่อเนื้อหาเกิน
    //   ต้องเป็น h-dvh ไม่ใช่ min-h-dvh — min-h ปล่อยให้กล่องยืดตามเนื้อหา
    //   กล่องเลยไม่เคย "ล้น" ตัวเอง แล้ว overflow-y-auto ก็ไม่ทำอะไรเลย
    // FIX_LISTS ชุดที่สิบเอ็ด #1: แถบเลื่อนโผล่ทั้งที่เนื้อหาไม่ล้น
    //   เดิม h-dvh (สูงเท่าจอเป๊ะ) + py-6/py-8 → padding บวกเข้าไปในความสูงเนื้อหา
    //   กล่องเลยล้นตัวเองเกินมานิดเดียวทุกครั้ง overflow-y-auto จึงขึ้นแถบเลื่อนตลอด
    //   ทั้งที่ไม่มีอะไรให้เลื่อนจริง ๆ
    //   max-h-dvh แทน h-dvh = สูงได้ไม่เกินจอ แต่ถ้าเนื้อหาสั้นกว่าก็หดตาม
    //   เนื้อหาพอดีจอ → ไม่ล้น → ไม่มีแถบเลื่อน; เนื้อหายาว (ทีมเยอะ/โหมด TV) →
    //   ชนเพดาน dvh แล้วเลื่อนได้เหมือนเดิม
    <div className="no-scrollbar mx-auto flex max-h-dvh w-full max-w-5xl flex-col overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
      {/* FIX_LISTS ชุดที่สิบเอ็ด #3: หัวเว็บหน้าตั้งค่าใช้ pattern เดียวกับหน้าเล่นเกม
          (GameHeader) — โลโก้ซ้าย, ปุ่มหลักดันไปขวาด้วย ml-auto, แล้วต่อด้วยปุ่ม
          ธีม/โหมดจอ ในแถวเดียวกัน
          ปุ่มลอยมุมขวาบน (แถบ fixed ใน App) ไม่เรนเดอร์ในหน้านี้แล้ว — เดิมมันลอย
          ทับหัวเว็บอยู่คนละระดับกับปุ่ม "กลับเมนู" ทำให้สองหน้าดูคนละแบบ
          ตอนนี้ปุ่มทุกตัวอยู่บน top nav เส้นเดียวกันทั้งสองหน้า */}
      <header className="mb-4 flex w-full flex-wrap items-center gap-3">
        <BombMark />
        <div className="min-w-0">
          <h1 className="truncate font-serif text-3xl font-bold leading-tight">
            Minenumber — ตั้งค่า
          </h1>
          <p className="section-label">เลขระเบิด</p>
        </div>
        <button
          onClick={onBack}
          title="กลับไปหน้าเมนูหลัก"
          aria-label="กลับไปหน้าเมนูหลัก"
          className={
            'ml-auto flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card ' +
            'px-3 py-2 text-sm font-bold shadow transition hover:border-primary'
          }
        >
          <span aria-hidden="true">←</span>
          <span className="hidden sm:inline">กลับเมนู</span>
        </button>
        <ThemeToggle />
        <DisplayModeToggle />
      </header>

      {/* FIX_LISTS ชุดที่เก้า #2: เอาการ์ดเลือกโหมดจอออกจากหน้าตั้งค่า
          ปุ่มสลับ Laptop/TV อยู่มุมขวาบนทุกหน้าอยู่แล้ว (DisplayModeToggle)
          มีสองที่ให้ตั้งค่าเดียวกันทำให้สับสน — เหลือที่เดียวคือปุ่มมุมขวาบน */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ทีม */}
        <section className="panel">
          {/* FIX_LISTS ชุดใหม่ #1: มีหัวข้อกำกับเหมือนฝั่ง "ตั้งค่าเกม" — เดิมแผงนี้
              ขึ้นด้วยช่องกรอกเลย อ่านแล้วไม่รู้ว่าเป็นส่วนของอะไร */}
          <h2 className="section-label mb-3">ตั้งค่าทีม</h2>
          {/* FIX_LISTS #6: เอา "ทีม (x)" ออก แล้วยกช่องกรอกจำนวนทีมขึ้นมาอยู่แถวเดียว
              กับปุ่มสุ่มลำดับ — จำนวนทีมอ่านได้จากตัวเลขในช่องกรอกอยู่แล้ว ไม่ต้องบอกซ้ำ */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-base font-semibold">
              จำนวนทีม
              <input
                type="number"
                value={countInput}
                min={LIMITS.minTeams}
                max={LIMITS.maxTeams}
                onChange={(e) => setCountInput(e.target.value)}
                onBlur={() =>
                  fixInput(countInput, LIMITS.minTeams, LIMITS.maxTeams, teams, setCountInput)
                }
                className="control w-20 text-center text-lg font-bold"
              />
              <span className="text-sm font-normal text-muted-foreground">
                (ขั้นต่ำ {LIMITS.minTeams})
              </span>
            </label>
            {/* FIX_LISTS #7: ยืนยันจำนวนทีมผ่านการกรอกตัวเลขอย่างเดียว — ปุ่มเพิ่มทีมถูกเอาออก */}
            <button
              onClick={() => void applyCount()}
              className="rounded-lg border border-primary px-3 py-2 text-sm font-bold text-primary"
            >
              ยืนยัน
            </button>
            <button
              onClick={shuffleNames}
              className="ml-auto rounded-lg border border-border px-3 py-2 text-sm font-bold"
            >
              🎲 สุ่มลำดับ
            </button>
          </div>
          <p className="mb-2 text-xs leading-5 text-muted-foreground">
            ลำดับนี้คือลำดับการเล่น — ทีมบนสุดเริ่มก่อน (ใช้ 🎲 สุ่มลำดับก่อนเริ่มได้)
          </p>
          <ul className="flex flex-col gap-2">
            {names.map((name, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-6 text-center font-mono text-sm font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <input
                  value={name}
                  onChange={(e) => setTeamName(i, e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-lg font-semibold"
                />
                <button
                  onClick={() => removeTeam(i)}
                  disabled={teams <= LIMITS.minTeams}
                  className="rounded-lg border px-3 py-2 text-sm font-bold text-destructive disabled:opacity-40"
                >
                  ลบ
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* จำนวนช่อง + ระเบิด + โอกาสโดนระเบิด */}
        <section className="panel flex flex-col gap-5">
          <div>
            {/* FIX_LISTS ชุดใหม่ #2: แผงนี้ไม่ได้มีแค่จำนวนช่องแล้ว (มีสรุปห้อง/โอกาสโดนระเบิด
                /ปุ่มเริ่มเกมด้วย) — ชื่อหัวข้อจึงเป็น "ตั้งค่าเกม" ให้ตรงกับของจริง */}
            <h2 className="section-label mb-3">ตั้งค่าเกม</h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-base font-semibold">
                ช่อง
                <input
                  type="number"
                  value={cellsTouched ? cellsInput : String(autoCells)}
                  min={minCells}
                  max={LIMITS.maxRange}
                  onChange={(e) => {
                    setCellsTouched(true)
                    setCellsInput(e.target.value)
                  }}
                  onBlur={() =>
                    cellsTouched &&
                    fixInput(cellsInput, minCells, LIMITS.maxRange, autoCells, setCellsInput)
                  }
                  className="control w-24 text-lg font-bold"
                />
              </label>
              {/* FIX_LISTS ชุดใหม่ #3: เหลือ 2 ปุ่ม "ขั้นต่ำ"/"แนะนำ" — ปุ่ม Auto ถูกเอาออก
                  (ค่าอัตโนมัติเป็นค่าตั้งต้นของช่องอยู่แล้ว ไม่ต้องมีปุ่มกดกลับ)
                  ปุ่มที่กดไปแล้วไม่เปลี่ยนอะไร → disable ไว้ ไม่ใช่ให้หายไป
                  ปุ่มโผล่ ๆ หาย ๆ ทำให้ปุ่มข้าง ๆ ขยับ กดพลาดง่าย */}
              <button
                onClick={() => {
                  setCellsTouched(true)
                  setCellsInput(String(minCells))
                }}
                disabled={cells === minCells}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
              >
                ขั้นต่ำ {minCells}
              </button>
              <button
                onClick={() => {
                  setCellsTouched(true)
                  setCellsInput(String(suggestedCells))
                }}
                disabled={cells === suggestedCells}
                className="rounded-lg border border-primary px-3 py-1.5 text-sm font-bold text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                แนะนำ {suggestedCells}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <h3 className="mb-3 text-lg font-bold">รายละเอียดห้อง</h3>
            {/* FIX #11: แทนคำอธิบายยาว ๆ ด้วยตัวเลขจริง 3 ตัว (เดิมอยู่แถบล่าง) */}
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
              <RoomStat label="ระเบิดจริง" value={quota} valueClass="text-destructive" />
              <RoomStat
                label="Glitch bomb"
                value={glitchEnabled ? glitchCount : 0}
                valueClass="text-purple-600 dark:text-purple-400"
              />
              <RoomStat label="การ์ดในสำรับ" value={cardsEnabled ? CARD_DECK_SIZE : 0} />
            </div>
          </div>

          {/* Bar โอกาสโดนระเบิด (W2.2 / W2.3)
              FIX_LISTS ชุดใหม่ #7: ไม่โชว์คำบอกความยากง่ายแล้ว — สีแถบกับตัวเลข % สื่อพอ
              FIX_LISTS ชุดใหม่ #8: เคส "เล่นยังไงก่อน" (ช่องน้อยกว่าขั้นต่ำ) ไม่ขึ้นข้อความ
              พิเศษอีก แต่แสดงเป็นแถบ 100% สีเดียวกับเคสอื่น — ทุกเคสจึงหน้าตาเดียวกัน
              (เหตุผลว่าทำไมเริ่มเกมไม่ได้ ยังบอกอยู่ที่ข้อความใต้ปุ่มเริ่มเกม) */}
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 text-sm font-bold">
              <span>โอกาสโดนระเบิด (ช่องถัดไปแบบสุ่ม)</span>
              <span className={`font-mono text-xl font-black ${chanceTextClass(chanceLevel)}`}>
                {chancePercent}%
              </span>
            </div>
            <div className="range-bar">
              <div
                className={chanceBarClass(chanceLevel)}
                style={{ width: `${Math.max(chancePercent, 1)}%` }}
              />
            </div>
          </div>

          <div className="mt-auto">
            <div className="mb-3 flex gap-3">
              <button
                onClick={handleStart}
                disabled={!canStart}
                className="primary-button w-full text-xl disabled:cursor-not-allowed disabled:opacity-40"
              >
                เริ่มเกม
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="rounded-lg border border-border bg-background px-4 py-3 text-base font-bold"
              >
                ⚙ ตั้งค่าเพิ่มเติม
              </button>
            </div>
            {!canStart && (
              <p className="mt-2 text-center text-sm font-semibold text-destructive">
                {/* FIX_LISTS ชุดใหม่ #4: ขั้นต่ำไม่ใช่ "เท่าระเบิดจริง" อีกแล้ว — มันรวม
                    glitch กับการ์ดที่เปิดอยู่ด้วย ข้อความเดิมจึงบอกเลขที่ไม่ตรงกับเหตุผล
                    FIX_LISTS ชุดที่สิบเอ็ด #3: ตัดส่วนแยกย่อย (ระเบิดจริง/glitch/การ์ด)
                    กับ "ตอนนี้ x" ออก — จบที่จำนวนช่องขั้นต่ำพอ ข้อความจะสั้นอ่านจบในตาเดียว */}
                ช่องน้อยไป: ต้องมีอย่างน้อย {minCells} ช่อง
              </p>
            )}
          </div>
        </section>
      </div>

      <RulesPanel />

      {/* FIX #8: ตั้งค่าเพิ่มเติม — modal แบบ sidebar + เมนูหมวด
          FIX #6: ปุ่มปิดอยู่มุมขวาบนของ modal
          FIX #7: toggle ปิด → ส่วนตั้งค่าของหมวดนั้นหุบหายไปเลย */}
      <Dialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/70" />
          {/* FIX_LISTS #10: มือถือ — เรียงบนล่าง (เมนูเป็นแถบเลื่อนแนวนอน), จอใหญ่ค่อยเป็น sidebar */}
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex h-[min(90vh,640px)] w-[min(100%-1.5rem,880px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:flex-row">
            {/* Sidebar เมนูหมวด */}
            <nav className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-background p-3 sm:w-44 sm:flex-col sm:overflow-x-visible sm:border-r sm:border-b-0">
              <p className="section-label mb-2 hidden px-2 sm:block">ตั้งค่าเพิ่มเติม</p>
              {SETTINGS_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSettingsTab(t.id)}
                  className={
                    'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-base font-bold transition ' +
                    (settingsTab === t.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-secondary')
                  }
                >
                  <span>{t.icon}</span>
                  <span className="min-w-0 truncate">{t.label}</span>
                </button>
              ))}
            </nav>

            {/* เนื้อหาหมวดที่เลือก */}
            <div className="relative flex min-w-0 flex-1 flex-col">
              {/* FIX #6: ปุ่มปิดมุมขวาบนของ modal */}
              <Dialog.Close
                render={
                  <button
                    aria-label="ปิด"
                    className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-lg font-bold hover:border-primary"
                  />
                }
              >
                ✕
              </Dialog.Close>

              <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-4 pr-14 sm:p-6 sm:pr-14">
                <Dialog.Title className="font-serif text-2xl font-bold">
                  {SETTINGS_TABS.find((t) => t.id === settingsTab)?.label}
                </Dialog.Title>
                <Dialog.Description className="mt-1 mb-5 text-sm text-muted-foreground">
                  แก้ได้ทันที — ค่าที่ตั้งจะสะท้อนที่หน้าหลักทันที
                </Dialog.Description>

                {settingsTab === 'bomb' && (
                  <div className="flex flex-col gap-4">
                    {/* FIX_LISTS #17: อธิบายให้ชัดว่า glitch เป็นระเบิด "เพิ่ม" ไม่ใช่ระเบิดจริง
                        ที่กลายร่าง — ระเบิดจริงยังครบ (ทีม − 1) เสมอ ไม่ได้หายไปไหน */}
                    {toggle(
                      'Glitch bomb (ระเบิดกลิตช์)',
                      // FIX_LISTS ชุดใหม่ #5: จำนวนตาที่ล็อกมาจากค่าที่ตั้งไว้ ไม่ใช่ 2 ตายตัว
                      `ระเบิดปลอมที่เพิ่มเข้ามาต่างหาก เปิดโดนแล้วไม่ตาย ${
                        glitchLock > 0 ? `แต่ทีมนั้นใช้การ์ดไม่ได้ ${glitchLock} ตา` : 'แต่เสียตานั้นไป'
                      } — ระเบิดจริงไม่ได้กลายร่างเป็น glitch และไม่ได้ลดลง ยังมีครบ (จำนวนทีม − 1) เสมอ`,
                      glitchEnabled,
                      setGlitchEnabled,
                    )}
                    {/* FIX #7: ปิด toggle → ตั้งค่าหุบหายไปเลย ไม่ใช่แค่จาง */}
                    {glitchEnabled && (
                      <div className="flex flex-col gap-4 border-l-2 border-primary/40 pl-4">
                        <div className="flex gap-2">
                          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold">
                            <input
                              type="radio"
                              name="glitchMode"
                              checked={glitchMode === 'auto'}
                              onChange={() => setGlitchMode('auto')}
                              className="accent-[var(--primary)]"
                            />
                            อัตโนมัติ (ตามสัดส่วน)
                          </label>
                          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold">
                            <input
                              type="radio"
                              name="glitchMode"
                              checked={glitchMode === 'manual'}
                              onChange={() => setGlitchMode('manual')}
                              className="accent-[var(--primary)]"
                            />
                            กำหนดเอง
                          </label>
                        </div>
                        {glitchMode === 'auto' ? (
                          <NumberField
                            label="สัดส่วน Glitch"
                            hint={`สัดส่วนเทียบกับระเบิดจริง — glitch 30% แปลว่ามี glitch เท่ากับ 30% ของระเบิดจริง (ตอนนี้ระเบิดจริง ${quota} ลูก → glitch ${glitchCount} ลูก) เป็นระเบิดที่เพิ่มเข้ามา ไม่ได้แบ่งมาจากระเบิดจริง`}
                            value={glitchRatioInput}
                            onChange={setGlitchRatioInput}
                            min={0}
                            max={Math.round(LIMITS.maxGlitchRatio * 100)}
                            suffix={`${Math.round(Number(glitchRatioInput) || 0)}%`}
                            onBlurFix={() =>
                              fixInput(
                                glitchRatioInput,
                                0,
                                Math.round(LIMITS.maxGlitchRatio * 100),
                                0,
                                setGlitchRatioInput,
                              )
                            }
                          />
                        ) : (
                          <NumberField
                            label="จำนวน Glitch"
                            hint={`ระเบิดปลอมที่เพิ่มจากระเบิดจริง ${quota} ลูก (ไม่เกินช่องว่าง ${Math.max(cells - quota, 0)})`}
                            value={glitchCountInput}
                            onChange={setGlitchCountInput}
                            min={0}
                            max={Math.max(cells - quota, 0)}
                            suffix={`${Number(glitchCountInput) || 0} ลูก`}
                            onBlurFix={() =>
                              fixInput(
                                glitchCountInput,
                                0,
                                Math.max(cells - quota, 0),
                                0,
                                setGlitchCountInput,
                              )
                            }
                          />
                        )}
                        {/* FIX_LISTS ชุดใหม่ #5: เดิม 2 turn ตายตัวในเอนจิน — ตอนนี้ตั้งเองได้
                            0 = โดนแล้วไม่ล็อก item เลย (เสียแค่ตาที่เปิดเจอ) */}
                        <NumberField
                          label="โดน Glitch แล้วใช้ item ไม่ได้"
                          unit="turn"
                          hint="ทีมที่เปิดเจอ Glitch bomb จะใช้การ์ดและจั่วการ์ดไม่ได้กี่ตาของตัวเอง (ตั้ง 0 = ไม่ล็อก เสียแค่ตาที่เปิดเจอ)"
                          value={glitchLockInput}
                          onChange={setGlitchLockInput}
                          min={LIMITS.minGlitchLockTurns}
                          max={LIMITS.maxGlitchLockTurns}
                          suffix={Number(glitchLockInput) === 0 ? '(ไม่ล็อก)' : undefined}
                          onBlurFix={() =>
                            fixInput(
                              glitchLockInput,
                              LIMITS.minGlitchLockTurns,
                              LIMITS.maxGlitchLockTurns,
                              DEFAULTS.glitchLockTurns,
                              setGlitchLockInput,
                            )
                          }
                        />
                        {/* FIX_LISTS ชุดที่สิบสี่ #3: เหยียบ glitch ซ้ำตอนที่ยังติดอยู่ จะคิดยังไง
                            เดิมทับด้วยค่าใหม่เสมอ ซึ่งกลายเป็นโทษที่ "เบาลง" ถ้าของเก่าเหลือ
                            มากกว่าค่าที่ตั้งไว้ (เหลือ 5 turn เหยียบอีกทีเป็น 2) — เลือกได้แล้ว
                            ซ่อนตอนตั้ง 0 turn เพราะไม่มีอะไรให้สะสม/รีเซ็ต */}
                        {glitchLock > 0 &&
                          toggle(
                            'เหยียบ Glitch ซ้ำแล้วสะสม turn',
                            `เปิด = ติดกลิตช์อยู่แล้วเหยียบอีก จะบวกทับของเดิม (เหลือ 1 + ${glitchLock} = ${glitchLock + 1} turn) · ปิด = รีเซ็ตเป็น ${glitchLock} turn ทุกครั้ง`,
                            glitchStack,
                            setGlitchStack,
                          )}
                      </div>
                    )}
                  </div>
                )}

                {settingsTab === 'cards' && (
                  <div className="flex flex-col gap-4">
                    {toggle(
                      'ระบบการ์ด',
                      'ทีมที่รอดจบตาจะได้จั่วการ์ด 1 ใบ ใช้ในตาตัวเองได้ไม่จำกัดจำนวนใบ',
                      cardsEnabled,
                      setCardsEnabled,
                    )}
                    {cardsEnabled && (
                      <div className="flex flex-col gap-4 border-l-2 border-primary/40 pl-4">
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2">
                          <input
                            type="checkbox"
                            checked={handLimited}
                            onChange={(e) => setHandLimited(e.target.checked)}
                            className="h-5 w-5 accent-[var(--primary)]"
                          />
                          <span className="text-base font-semibold">จำกัดจำนวนใบในมือ</span>
                        </label>
                        {handLimited && (
                          <NumberField
                            label="มือสูงสุด (การ์ด)"
                            hint="จำนวนการ์ดสูงสุดที่ถือได้ในมือ เกินกว่านี้จั่วไม่เข้า"
                            value={maxHandInput}
                            onChange={setMaxHandInput}
                            min={LIMITS.minHandSize}
                            max={LIMITS.maxHandSizeCap}
                            suffix={`${Number(maxHandInput) || LIMITS.minHandSize} ใบ`}
                            onBlurFix={() =>
                              fixInput(
                                maxHandInput,
                                LIMITS.minHandSize,
                                LIMITS.maxHandSizeCap,
                                LIMITS.minHandSize,
                                setMaxHandInput,
                              )
                            }
                          />
                        )}
                        <NumberField
                          label="การ์ดเริ่มต้น (แจกตอนเริ่มเกม)"
                          hint="การ์ดที่แจกให้ทุกทีมตั้งแต่เริ่มเกม (ปกติจั่วทีละ 1 ใบเมื่อรอดจบตา)"
                          value={startingHandInput}
                          onChange={setStartingHandInput}
                          min={0}
                          max={LIMITS.maxStartingHand}
                          suffix={`${Number(startingHandInput) || 0} ใบ/ทีม`}
                          onBlurFix={() =>
                            fixInput(startingHandInput, 0, LIMITS.maxStartingHand, 0, setStartingHandInput)
                          }
                        />
                        <NumberField
                          label="รัศมี Scan"
                          hint={`ตรวจช่วงเลขซ้าย–ขวารอบเป้าหมาย คลุม ${2 * scanR + 1} ช่อง (2R+1) — สูงสุดของกระดานนี้ ${maxScanRadiusFor(cells)}`}
                          value={scanRadiusInput}
                          onChange={setScanRadiusInput}
                          min={LIMITS.minScanRadius}
                          max={maxScanRadiusFor(cells)}
                          suffix={`±${scanR} (ครอบ ${2 * scanR + 1} ช่อง)`}
                          onBlurFix={() =>
                            fixInput(
                              scanRadiusInput,
                              LIMITS.minScanRadius,
                              maxScanRadiusFor(cells),
                              suggestedScanRadius(cells),
                              setScanRadiusInput,
                            )
                          }
                        />
                        <button
                          onClick={() => setScanRadiusInput(String(suggestedScanRadius(cells)))}
                          className="self-start rounded-lg border border-primary px-3 py-1.5 text-sm font-bold text-primary"
                        >
                          ใช้ค่าแนะนำ (±{suggestedScanRadius(cells)})
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {settingsTab === 'play' && (
                  <div className="flex flex-col gap-4">
                    {toggle(
                      'Shrinking Mode (วงหด)',
                      'เมื่อเปิดช่องปลอดภัย ขอบซ้าย/ขวาของกระดานจะหดเข้า ช่องเหลือน้อยลงเรื่อย ๆ เกมจบเร็วขึ้น',
                      shrinkingEnabled,
                      setShrinkingEnabled,
                    )}
                    {/* FIX_LISTS ชุดใหม่ #6: อ่านเป็นประโยคเดียว "เวลาต่อรอบ [60] วินาที"
                        เดิม label อยู่บรรทัดบน ช่องกรอกเต็มความกว้างข้างล่าง ไม่รู้ว่าหน่วยอะไร */}
                    <NumberField
                      label="เวลาต่อรอบ"
                      unit="วินาที"
                      hint="หมดเวลาแล้วทีมนั้นเสีย turn ไป (ไม่มีการสุ่มเปิดให้) ตั้ง 0 = ไม่จับเวลา"
                      value={turnInput}
                      onChange={setTurnInput}
                      min={0}
                      max={LIMITS.maxTurnSeconds}
                      suffix={Number(turnInput) === 0 ? '(ไม่จับเวลา)' : undefined}
                      onBlurFix={() => fixInput(turnInput, 0, LIMITS.maxTurnSeconds, 0, setTurnInput)}
                    />
                    <NumberField
                      label="เวลาตัดสายระเบิด"
                      unit="วินาที"
                      hint="เวลานับถอยหลังตอนตัดสาย มีเสียงนับทุกวินาที — ตัดไม่ทันคือระเบิดทันที (ตั้ง 0 = ไม่จับเวลา)"
                      value={defuseSecondsInput}
                      onChange={setDefuseSecondsInput}
                      min={0}
                      max={LIMITS.maxDefuseSeconds}
                      suffix={Number(defuseSecondsInput) === 0 ? '(ไม่จับเวลา)' : undefined}
                      onBlurFix={() =>
                        fixInput(defuseSecondsInput, 0, LIMITS.maxDefuseSeconds, 0, setDefuseSecondsInput)
                      }
                    />
                    <NumberField
                      label="เวลาเลือกกันโจมตี"
                      unit="วินาที"
                      hint="เวลาตัดสินใจเลือกการ์ดที่จะ Block ตอนโดนโจมตี — หมดเวลา = ไม่กัน โดนทั้งหมด (ตั้ง 0 = ไม่จับเวลา)"
                      value={defendSecondsInput}
                      onChange={setDefendSecondsInput}
                      min={0}
                      max={LIMITS.maxDefendSeconds}
                      suffix={Number(defendSecondsInput) === 0 ? '(ไม่จับเวลา)' : undefined}
                      onBlurFix={() =>
                        fixInput(defendSecondsInput, 0, LIMITS.maxDefendSeconds, 0, setDefendSecondsInput)
                      }
                    />
                  </div>
                )}

                {settingsTab === 'music' && (
                  <MusicSettings
                    sfxVolumeInput={sfxVolumeInput}
                    setSfxVolumeInput={setSfxVolumeInput}
                  />
                )}
              </div>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

function clampInt(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min
  return Math.min(Math.max(n, min), max)
}

// ช่องกรอกเลขที่รับค่าเป็น string — ใช้แทนสไลด์ทุกตัว (W1.3)
// FIX_LISTS ชุดใหม่ #6: ส่ง `unit` เข้ามา = จัดเป็นบรรทัดเดียว "label [ช่องกรอก] หน่วย"
// (เช่น "เวลาต่อรอบ [60] วินาที") แทนที่จะเป็น label บนสุด / ช่องเต็มความกว้างข้างล่าง
// ไม่ส่ง unit = ใช้เลย์เอาต์เดิม ช่องกรอกเต็มบรรทัด สำหรับค่าที่ไม่มีหน่วยสั้น ๆ
function NumberField(props: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  min: number
  max: number
  suffix?: string
  unit?: string
  disabled?: boolean
  onBlurFix: () => void
}) {
  // FIX_LISTS ชุดใหม่ #4: ทุกช่องกรอกเลขอยู่บรรทัดเดียวกับ label เหมือนตัวปรับเสียง
  // ตัวเลขที่กรอกสั้น (ไม่กี่หลัก) ช่องเต็มความกว้างจึงกว้างเกินจำเป็น
  // label ดัน suffix/unit ไปชิดขวาด้วย ml-auto → ตำแหน่งช่องกรอกตรงกันทุกแถว
  return (
    <label className={`block ${props.disabled ? 'opacity-40' : ''}`}>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
        <span className="min-w-0 flex-1">{props.label}</span>
        <span className="flex shrink-0 items-center gap-2">
          <input
            type="number"
            value={props.value}
            min={props.min}
            max={props.max}
            disabled={props.disabled}
            onChange={(e) => props.onChange(e.target.value)}
            onBlur={props.onBlurFix}
            className="control w-24 shrink-0 text-center text-lg font-bold"
          />
          {props.unit && <span>{props.unit}</span>}
          {props.suffix && (
            <span className="text-sm font-normal text-muted-foreground">{props.suffix}</span>
          )}
        </span>
      </span>
      <span className="mt-1 block text-sm leading-6 text-muted-foreground">{props.hint}</span>
    </label>
  )
}

// FIX_LISTS ชุดใหม่ #6: 5 ระดับแล้ว — "ง่ายมาก" (เขียวอ่อน) กับ "ง่าย" (เขียว) แยกสีกัน
// FIX_LISTS ชุดใหม่ #7: ไม่มีคำบอกความยากง่ายแล้ว สีจึงเป็นตัวสื่อระดับเพียงอย่างเดียว
function chanceBarClass(level: BalanceVerdict): string {
  switch (level) {
    case 'very-easy':
      return 'bg-teal-400'
    case 'easy':
      return 'bg-emerald-500'
    case 'good':
      return 'bg-yellow-400'
    case 'risky':
      return 'bg-orange-500'
    case 'brutal':
      return 'bg-red-600'
  }
}

// FIX_LISTS ชุดใหม่ #12: สีตัวเลข % ใช้เกณฑ์เดียวกับ bar — ไม่มีเกณฑ์ซ้อนสองชุด
function chanceTextClass(level: BalanceVerdict): string {
  switch (level) {
    case 'very-easy':
      return 'text-teal-600 dark:text-teal-400'
    case 'easy':
      return 'text-emerald-600 dark:text-emerald-400'
    case 'good':
      return 'text-yellow-600 dark:text-yellow-400'
    case 'risky':
      return 'text-orange-600 dark:text-orange-400'
    case 'brutal':
      return 'text-red-600 dark:text-red-400'
  }
}


// FIX #8: หมวดของหน้าตั้งค่า (sidebar)
type SettingsTab = 'bomb' | 'cards' | 'play' | 'music'

const SETTINGS_TABS: ReadonlyArray<{ id: SettingsTab; label: string; icon: string }> = [
  { id: 'bomb', label: 'ระเบิด', icon: '💣' },
  { id: 'cards', label: 'การ์ด', icon: '🃏' },
  { id: 'play', label: 'การเล่น', icon: '🎮' },
  { id: 'music', label: 'เสียง', icon: '🎵' },
]

// FIX #14: โลโก้เกม — ระเบิด + ชุดตัวเลข
export function BombMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span className="brand-bomb">💣</span>
      <span className="brand-digits">7</span>
    </div>
  )
}

// FIX #11: ตัวเลขสรุปห้อง
function RoomStat({
  label,
  value,
  valueClass = 'text-primary',
}: {
  label: string
  value: number
  valueClass?: string
}) {
  return (
    <div className="rounded-lg bg-card p-3 text-center">
      <p className="section-label">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-black ${valueClass}`}>{value}</p>
    </div>
  )
}

// FIX #7 + FIX_LISTS #9: ตั้งค่าเสียง — YouTube link ถูกถอดออกแล้ว
// เหลือระดับเสียง effect ของเกมอย่างเดียว
export function MusicSettings({
  sfxVolumeInput,
  setSfxVolumeInput,
}: {
  sfxVolumeInput: string
  setSfxVolumeInput: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <VolumeField
        label="ระดับเสียง Effect"
        hint="เสียงระเบิด ตัดสาย จั่วการ์ด ฯลฯ — ลากแถบ หมุนลูกกลิ้งเมาส์ หรือกรอกตัวเลข 0–100"
        value={sfxVolumeInput}
        onChange={setSfxVolumeInput}
      />
    </div>
  )
}

// FIX #7: แถบเลื่อนระดับเสียง — ลากได้ / ลูกกลิ้งเมาส์ได้ / กรอกตัวเลขได้ (0–100)
export function VolumeField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
}) {
  const n = Math.min(Math.max(Number(value) || 0, 0), 100)

  function bump(delta: number) {
    onChange(String(Math.min(Math.max(n + delta, 0), 100)))
  }

  // FIX_LISTS ชุดใหม่ #7: เดิมโชว์เปอร์เซ็นต์ 2 ที่ — ตัวเลขข้าง label กับในช่องกรอก
  // ซึ่งเป็นค่าเดียวกัน อ่านแล้วสับสนว่าอันไหนคือค่าจริง
  // ตอนนี้เหลือชุดเดียว เรียงเป็นบรรทัดเดียว: "ระดับเสียง Effect [bar] [ช่องกรอก] %"
  return (
    <label className="block">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-2 text-base font-semibold">
        <span className="shrink-0">{label}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={n}
          onChange={(e) => onChange(e.target.value)}
          // ลูกกลิ้งเมาส์ปรับได้ — ต้อง preventDefault กันหน้า scroll ตาม
          onWheel={(e) => {
            e.preventDefault()
            bump(e.deltaY < 0 ? 5 : -5)
          }}
          aria-label={label}
          className="h-2 min-w-32 flex-1 accent-[var(--primary)]"
        />
        <input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onChange(String(n))}
          aria-label={`${label} (ตัวเลข)`}
          className="control w-20 shrink-0 text-center text-base font-bold"
        />
        <span className="shrink-0">%</span>
      </span>
      {hint && <span className="mt-1 block text-sm leading-6 text-muted-foreground">{hint}</span>}
    </label>
  )
}
