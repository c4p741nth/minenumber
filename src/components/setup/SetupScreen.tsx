import { useState } from 'react'
import { LIMITS, bombQuota, defaultTeamNames, glitchCountFor } from '@/lib/game/config'
import { bombDensity, suggestRange, verdictFor } from '@/lib/game/balance'
import { createRng, randomSeed, shuffle } from '@/lib/game/rng'
import type { GameSettings } from '@/lib/game/types'
import { RulesPanel } from './RulesPanel'
import { confirmDialog } from '@/components/ui/alert'

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
  const [turnInput, setTurnInput] = useState(String(initial.turnSeconds))
  const [glitchEnabled, setGlitchEnabled] = useState(initial.glitchEnabled)
  const [glitchMode, setGlitchMode] = useState<'auto' | 'manual'>(initial.glitchMode)
  const [glitchRatioInput, setGlitchRatioInput] = useState(String(Math.round(initial.glitchRatio * 100)))
  const [glitchCountInput, setGlitchCountInput] = useState(String(initial.glitchCount))
  const [cardsEnabled, setCardsEnabled] = useState(initial.cardsEnabled)
  const [maxHandInput, setMaxHandInput] = useState(String(initial.maxHandSize))
  const [startingHandInput, setStartingHandInput] = useState(String(initial.startingHand))
  const [scanRadiusInput, setScanRadiusInput] = useState(String(initial.scanRadius))
  const [shrinkingEnabled, setShrinkingEnabled] = useState(initial.shrinkingEnabled)
  const [countInput, setCountInput] = useState(String(names.length))

  // ค่าที่เอาไปใช้จริง — ว่าง = ใช้ค่าต่ำสุด (แต่ไม่ดีดค่าใน input ระหว่างพิมพ์)
  const teams = names.length
  const cells = clampInt(Number(cellsInput), LIMITS.minRange, LIMITS.maxRange)
  const quota = bombQuota(teams)
  const glitchRatio = clampInt(Number(glitchRatioInput) / 100, 0, LIMITS.maxGlitchRatio)
  const glitchCount = glitchEnabled
    ? glitchCountFor(quota, cells, glitchMode, glitchRatio, Number(glitchCountInput) || 0)
    : 0
  const density = bombDensity(quota + glitchCount, cells)
  const balance = verdictFor(density)
  const suggestion = suggestRange(teams)
  const minCells = teams * LIMITS.minCellsPerTeam
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

  function addTeam() {
    if (teams >= LIMITS.maxTeams) return
    const next = [...names, defaultTeamNames(teams + 1)[teams]]
    setNames(next)
    setCountInput(String(next.length))
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
      rangeMax: clampInt(Number(cellsInput), LIMITS.minRange, LIMITS.maxRange),
      turnSeconds: clampInt(Number(turnInput), 0, LIMITS.maxTurnSeconds),
      glitchEnabled,
      glitchMode,
      glitchRatio: clampInt(Number(glitchRatioInput) / 100, 0, LIMITS.maxGlitchRatio),
      glitchCount: clampInt(Number(glitchCountInput), 0, LIMITS.maxGlitchCount),
      cardsEnabled,
      maxHandSize: clampInt(Number(maxHandInput), LIMITS.minHandSize, LIMITS.maxHandSizeCap),
      startingHand: clampInt(Number(startingHandInput), 0, LIMITS.maxStartingHand),
      scanRadius: clampInt(Number(scanRadiusInput), LIMITS.minScanRadius, LIMITS.maxScanRadius),
      shrinkingEnabled,
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
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
      <header className="flex items-center gap-3 pb-6">
        <div className="brand-mark">7</div>
        <div>
          <p className="section-label">MEETING GAME</p>
          <h1 className="font-serif text-3xl font-bold">วงระเบิด — ตั้งค่า</h1>
        </div>
        <button
          onClick={onBack}
          className="ml-auto rounded-lg border border-border px-4 py-2 text-base font-bold"
        >
          ← กลับเมนู
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ทีม */}
        <section className="panel">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-label">ทีม ({teams}/{LIMITS.maxTeams})</h2>
            <button
              onClick={shuffleNames}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-bold"
            >
              🎲 สุ่มลำดับ
            </button>
          </div>
          <div className="mb-3 flex items-center gap-2">
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
                ({LIMITS.minTeams}–{LIMITS.maxTeams})
              </span>
            </label>
            <button
              onClick={() => void applyCount()}
              className="rounded-lg border border-primary px-3 py-2 text-sm font-bold text-primary"
            >
              ยืนยัน
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
          <button
            onClick={addTeam}
            disabled={teams >= LIMITS.maxTeams}
            className="mt-3 rounded-lg border border-dashed border-border px-4 py-2 text-sm font-bold disabled:opacity-40"
          >
            + เพิ่มทีม
          </button>
        </section>

        {/* จำนวนช่อง + ระเบิด */}
        <section className="panel flex flex-col gap-5">
          <div>
            <h2 className="section-label mb-3">จำนวนช่องทั้งหมด</h2>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-base font-semibold">
                ช่อง
                <input
                  type="number"
                  value={cellsInput}
                  min={LIMITS.minRange}
                  max={LIMITS.maxRange}
                  onChange={(e) => setCellsInput(e.target.value)}
                  onBlur={() =>
                    fixInput(cellsInput, LIMITS.minRange, LIMITS.maxRange, LIMITS.minRange, setCellsInput)
                  }
                  className="control w-24 text-lg font-bold"
                />
              </label>
              <span className="text-sm font-normal text-muted-foreground">
                ({LIMITS.minRange}–{LIMITS.maxRange})
              </span>
              <span className="ml-auto rounded-lg bg-secondary px-3 py-2 text-sm font-bold text-muted-foreground">
                {cells} ช่อง
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              เลขเริ่มต้นคือ 1 เสมอ — กรอกจำนวนช่องทั้งหมด จะได้ช่วง 1–{cells}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">จำนวนระเบิด</h3>
              <span className="font-mono text-3xl font-black text-destructive">
                {quota + glitchCount}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              ระเบิดจริง = ทีม − 1 = {quota} ลูก — ล็อกไว้เพื่อให้เกมจบเมื่อเหลือ 1 ทีม
              (ถ้าให้ปรับได้เกมจะไม่จบ)
              {glitchEnabled ? ` + glitch ${glitchCount} ลูก` : ''}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${balanceBadgeClass(balance)}`}>
                {balanceBadgeText(balance)} ({Math.round(density * 100)}% เต็ม)
              </span>
              <button
                onClick={() => setCellsInput(String(suggestion.max))}
                className="rounded-lg border border-primary px-3 py-1 text-sm font-bold text-primary"
              >
                ใช้ค่าแนะนำ {suggestion.min}–{suggestion.max}
              </button>
            </div>
          </div>

          <div className="mt-auto">
            <button
              onClick={handleStart}
              disabled={!canStart}
              className="primary-button w-full text-xl disabled:cursor-not-allowed disabled:opacity-40"
            >
              เริ่มเกม
            </button>
            {!canStart && (
              <p className="mt-2 text-center text-sm font-semibold text-destructive">
                ช่องน้อยไป: ต้องมีอย่างน้อย ทีม × 4 = {minCells} ช่อง (ตอนนี้ {cells})
              </p>
            )}
          </div>
        </section>

        {/* Toggles */}
        <section className="panel flex flex-col gap-5">
          <h2 className="section-label">ตัวเลือก</h2>
          {toggle(
            'Glitch bomb (ระเบิดกลิตช์)',
            'ระเบิดปลอม เปิดโดนแล้วไม่ตาย แต่ทีมนั้นใช้การ์ดไม่ได้ 2 ตา เป็นระเบิดส่วนเกินจากระเบิดจริง',
            glitchEnabled,
            setGlitchEnabled,
          )}
          {toggle(
            'ระบบการ์ด',
            'ทีมที่รอดจบตาจะได้จั่วการ์ด 1 ใบ (ถือได้ไม่จำกัด) ใช้ในตาตัวเองได้ไม่จำกัดจำนวนใบ',
            cardsEnabled,
            setCardsEnabled,
          )}
          {toggle(
            'Shrinking Mode (วงหด)',
            'เมื่อเปิดช่องปลอดภัย ขอบซ้าย/ขวาของกระดานจะหดเข้า ช่องเหลือน้อยลงเรื่อย ๆ เกมจบเร็วขึ้น แต่ทีมที่เล่นทีหลังเสี่ยงกว่า',
            shrinkingEnabled,
            setShrinkingEnabled,
          )}
        </section>

        {/* ตัวเลขปรับค่า */}
        <section className="panel flex flex-col gap-5">
          <h2 className="section-label">การตั้งค่า</h2>

          <fieldset disabled={!glitchEnabled} className={glitchEnabled ? '' : 'opacity-40'}>
            <legend className="sr-only">Glitch bomb</legend>
            <div className="mb-3 flex gap-2">
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
                hint="เปอร์เซ็นต์ของระเบิดจริงที่จะกลายเป็น glitch (0–50%)"
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
                hint={`ระเบิดปลอมส่วนเกินจากระเบิดจริง (ไม่เกินช่องว่าง ${Math.max(cells - quota, 0)})`}
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
          </fieldset>

          <fieldset disabled={!cardsEnabled} className={cardsEnabled ? '' : 'opacity-40'}>
            <legend className="sr-only">ระบบการ์ด</legend>
            <NumberField
              label="มือสูงสุด (การ์ด)"
              hint="จำนวนการ์ดสูงสุดที่ถือได้ในมือ เกินกว่านี้จั่วไม่เข้า"
              value={maxHandInput}
              onChange={setMaxHandInput}
              min={LIMITS.minHandSize}
              max={LIMITS.maxHandSizeCap}
              suffix={`${Number(maxHandInput) || LIMITS.minHandSize} ใบ`}
              onBlurFix={() =>
                fixInput(maxHandInput, LIMITS.minHandSize, LIMITS.maxHandSizeCap, LIMITS.minHandSize, setMaxHandInput)
              }
            />
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
              hint="การ์ด Scan บอกว่ามีระเบิดในช่วง ±R รอบเลขที่เลือกหรือไม่ ยิ่งกว้างยิ่งเจอง่ายแต่ระบุตำแหน่งยาก"
              value={scanRadiusInput}
              onChange={setScanRadiusInput}
              min={LIMITS.minScanRadius}
              max={LIMITS.maxScanRadius}
              suffix={`±${Number(scanRadiusInput) || LIMITS.minScanRadius}`}
              onBlurFix={() =>
                fixInput(scanRadiusInput, LIMITS.minScanRadius, LIMITS.maxScanRadius, LIMITS.minScanRadius, setScanRadiusInput)
              }
            />
          </fieldset>

          <NumberField
            label="เวลา/ตารอบ"
            hint="หมดเวลาแล้วระบบจะสุ่มเปิดช่องให้อัตโนมัติ ตั้ง 0 = ไม่จับเวลา"
            value={turnInput}
            onChange={setTurnInput}
            min={0}
            max={LIMITS.maxTurnSeconds}
            suffix={Number(turnInput) === 0 ? 'ไม่จับเวลา' : `${Number(turnInput) || 0} วิ`}
            onBlurFix={() => fixInput(turnInput, 0, LIMITS.maxTurnSeconds, 0, setTurnInput)}
          />
        </section>
      </div>

      {/* Preview สรุป */}
      <section className="panel mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
        <PreviewStat label="ช่อง" value={cells} />
        <PreviewStat label="ระเบิดจริง" value={quota} />
        <PreviewStat label="Glitch" value={glitchCount} />
        <PreviewStat label="การ์ดในสำรับ" value={cardsEnabled ? 6 : 0} />
        <PreviewStat label="ทีม" value={teams} />
      </section>

      <RulesPanel />
    </div>
  )
}

function clampInt(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min
  return Math.min(Math.max(n, min), max)
}

// ช่องกรอกเลขที่รับค่าเป็น string — ใช้แทนสไลด์ทุกตัว (W1.3)
function NumberField(props: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  min: number
  max: number
  suffix?: string
  disabled?: boolean
  onBlurFix: () => void
}) {
  return (
    <label className={`block ${props.disabled ? 'opacity-40' : ''}`}>
      <span className="mb-1 flex justify-between gap-2 text-base font-semibold">
        {props.label}
        <span className="text-muted-foreground">{props.suffix}</span>
      </span>
      <input
        type="number"
        value={props.value}
        min={props.min}
        max={props.max}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
        onBlur={props.onBlurFix}
        className="control w-full text-lg font-bold"
      />
      <span className="mt-1 block text-sm leading-6 text-muted-foreground">{props.hint}</span>
    </label>
  )
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-background p-3 text-center">
      <p className="section-label">{label}</p>
      <p className="mt-1 font-mono text-2xl font-black text-primary">{value}</p>
    </div>
  )
}

function balanceBadgeClass(balance: 'too-easy' | 'good' | 'risky' | 'brutal'): string {
  switch (balance) {
    case 'too-easy':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200'
    case 'good':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
    case 'risky':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
    case 'brutal':
      return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'
  }
}

function balanceBadgeText(balance: 'too-easy' | 'good' | 'risky' | 'brutal'): string {
  switch (balance) {
    case 'too-easy':
      return 'ง่ายเกินไป'
    case 'good':
      return 'สมดุล'
    case 'risky':
      return 'เสี่ยง'
    case 'brutal':
      return 'โหดมาก'
  }
}
