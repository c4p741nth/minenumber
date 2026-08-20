
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

export function SetupScreen({ initial, onStart, onBack }: Props) {
  const [names, setNames] = useState<string[]>(initial.teamNames)
  const [rangeMin, setRangeMin] = useState(initial.rangeMin)
  const [rangeMax, setRangeMax] = useState(initial.rangeMax)
  const [turnSeconds, setTurnSeconds] = useState(initial.turnSeconds)
  const [glitchEnabled, setGlitchEnabled] = useState(initial.glitchEnabled)
  const [glitchMode, setGlitchMode] = useState<'auto' | 'manual'>(initial.glitchMode)
  const [glitchRatio, setGlitchRatio] = useState(initial.glitchRatio)
  const [glitchCountInput, setGlitchCountInput] = useState(String(initial.glitchCount))
  const [cardsEnabled, setCardsEnabled] = useState(initial.cardsEnabled)
  const [maxHandSize, setMaxHandSize] = useState(initial.maxHandSize)
  const [startingHand, setStartingHand] = useState(initial.startingHand)
  const [scanRadius, setScanRadius] = useState(initial.scanRadius)
  const [shrinkingEnabled, setShrinkingEnabled] = useState(initial.shrinkingEnabled)
  const [countInput, setCountInput] = useState(String(names.length))

  const teams = names.length
  const cells = rangeMax - rangeMin + 1
  const quota = bombQuota(teams)
  const glitchCount = glitchEnabled
    ? glitchCountFor(quota, cells, glitchMode, glitchRatio, Number(glitchCountInput) || 0)
    : 0
  const density = bombDensity(quota + glitchCount, cells)
  const balance = verdictFor(density)
  const suggestion = suggestRange(teams)
  const minCells = teams * LIMITS.minCellsPerTeam
  const canStart = cells >= minCells

  // ชื่อ default ของตำแหน่งนั้น (ทีม 1, ทีม 2, …) — ใช้ตรวจว่าชื่อถูกแก้เองไหม
  function isDefaultName(name: string, index: number): boolean {
    return name.trim() === `ทีม ${index + 1}`
  }

  function setTeamName(i: number, v: string) {
    setNames(names.map((n, j) => (j === i ? v : n)))
  }

  async function applyCount() {
    const target = Math.min(
      Math.max(Number(countInput) || teams, LIMITS.minTeams),
      LIMITS.maxTeams,
    )
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
      rangeMin,
      rangeMax,
      turnSeconds,
      glitchEnabled,
      glitchMode,
      glitchRatio,
      glitchCount: Number(glitchCountInput) || 0,
      cardsEnabled,
      maxHandSize,
      startingHand,
      scanRadius,
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
                className="control w-20 text-center text-lg font-bold"
              />
              <span className="text-sm font-normal text-muted-foreground">
                ({LIMITS.minTeams}–{LIMITS.maxTeams})
              </span>
            </label>
            <button onClick={() => void applyCount()} className="rounded-lg border border-primary px-3 py-2 text-sm font-bold text-primary">
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

        {/* ช่วงตัวเลข + ระเบิด */}
        <section className="panel flex flex-col gap-5">
          <div>
            <h2 className="section-label mb-3">ช่วงตัวเลข</h2>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-base font-semibold">
                จาก
                <input
                  type="number"
                  value={rangeMin}
                  min={LIMITS.minRange}
                  max={LIMITS.maxRange}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setRangeMin(Math.min(Math.max(v, LIMITS.minRange), rangeMax))
                  }}
                  className="control w-24 text-lg font-bold"
                />
              </label>
              <label className="flex items-center gap-2 text-base font-semibold">
                ถึง
                <input
                  type="number"
                  value={rangeMax}
                  min={LIMITS.minRange}
                  max={LIMITS.maxRange}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setRangeMax(Math.max(Math.min(v, LIMITS.maxRange), rangeMin))
                  }}
                  className="control w-24 text-lg font-bold"
                />
              </label>
              <span className="ml-auto rounded-lg bg-secondary px-3 py-2 text-sm font-bold text-muted-foreground">
                {cells} ช่อง
              </span>
            </div>
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
                onClick={() => {
                  setRangeMin(suggestion.min)
                  setRangeMax(suggestion.max)
                }}
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
            'ทีมที่รอดจบตาจะได้จั่วการ์ด 1 ใบ (ถือได้สูงสุด 5 ใบ) ใช้ในตาตัวเองได้ไม่จำกัดจำนวนใบ',
            cardsEnabled,
            setCardsEnabled,
          )}
          {toggle(
            'โหมดเร่ง (วงหด)',
            'เมื่อเปิดช่องปลอดภัย ขอบซ้าย/ขวาของกระดานจะหดเข้า ช่องเหลือน้อยลงเรื่อย ๆ เกมจบเร็วขึ้น แต่ทีมที่เล่นทีหลังเสี่ยงกว่า',
            shrinkingEnabled,
            setShrinkingEnabled,
          )}
        </section>

        {/* Sliders */}
        <section className="panel flex flex-col gap-5">
          <h2 className="section-label">สไลด์ปรับค่า</h2>

          <label className="block">
            <span className="mb-1 flex justify-between text-base font-semibold">
              เวลา/ตารอบ
              <span className="text-muted-foreground">
                {turnSeconds === 0 ? 'ไม่จับเวลา' : `${turnSeconds} วิ`}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={LIMITS.maxTurnSeconds}
              step={5}
              value={turnSeconds}
              onChange={(e) => setTurnSeconds(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
            />
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              หมดเวลาแล้วระบบจะสุ่มเปิดช่องให้อัตโนมัติ ตั้ง 0 = ไม่จับเวลา
            </span>
          </label>

          <label className="block">
            <span className="mb-1 flex justify-between text-base font-semibold">
              รัศมี Scan
              <span className="text-muted-foreground">±{scanRadius}</span>
            </span>
            <input
              type="range"
              min={LIMITS.minScanRadius}
              max={LIMITS.maxScanRadius}
              step={1}
              value={scanRadius}
              onChange={(e) => setScanRadius(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
            />
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              การ์ด Scan บอกว่ามีระเบิดในช่วง ±R รอบเลขที่เลือกหรือไม่ ยิ่งกว้างยิ่งเจอง่ายแต่ระบุตำแหน่งยาก
            </span>
          </label>

          <label className="block">
            <span className="mb-1 flex justify-between text-base font-semibold">
              จำนวน Glitch
              <span className="text-muted-foreground">
                {glitchMode === 'auto' ? `${Math.round(glitchRatio * 100)}% ของระเบิดจริง` : `${glitchCount} ลูก`}
              </span>
            </span>
            <div className="flex gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold">
                <input
                  type="radio"
                  name="glitchMode"
                  checked={glitchMode === 'auto'}
                  onChange={() => setGlitchMode('auto')}
                  disabled={!glitchEnabled}
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
                  disabled={!glitchEnabled}
                  className="accent-[var(--primary)]"
                />
                กำหนดเอง
              </label>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={LIMITS.maxGlitchRatio}
                step={0.05}
                value={glitchRatio}
                disabled={!glitchEnabled || glitchMode !== 'auto'}
                onChange={(e) => setGlitchRatio(Number(e.target.value))}
                className="w-full accent-[var(--primary)] disabled:opacity-40"
              />
              {glitchMode === 'manual' && (
                <input
                  type="number"
                  min={0}
                  max={Math.max(cells - quota, 0)}
                  value={glitchCountInput}
                  onChange={(e) => setGlitchCountInput(e.target.value)}
                  disabled={!glitchEnabled}
                  className="control w-20 text-center font-mono text-lg font-bold"
                />
              )}
            </div>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              ระเบิดปลอม เปิดโดนแล้วไม่ตาย แต่ทีมนั้นใช้การ์ดไม่ได้ 2 ตา
              เป็นระเบิดส่วนเกินจากระเบิดจริง (ไม่เกินช่องว่าง)
            </span>
          </label>

          <label className="block">
            <span className="mb-1 flex justify-between text-base font-semibold">
              มือสูงสุด (การ์ด)
              <span className="text-muted-foreground">{maxHandSize} ใบ</span>
            </span>
            <input
              type="range"
              min={LIMITS.minHandSize}
              max={LIMITS.maxHandSizeCap}
              step={1}
              value={maxHandSize}
              disabled={!cardsEnabled}
              onChange={(e) => setMaxHandSize(Number(e.target.value))}
              className="w-full accent-[var(--primary)] disabled:opacity-40"
            />
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              จำนวนการ์ดสูงสุดที่ถือได้ในมือ เกินกว่านี้จั่วไม่เข้า
            </span>
          </label>

          <label className="block">
            <span className="mb-1 flex justify-between text-base font-semibold">
              การ์ดเริ่มต้น (แจกตอนเริ่มเกม)
              <span className="text-muted-foreground">{startingHand} ใบ/ทีม</span>
            </span>
            <input
              type="range"
              min={0}
              max={LIMITS.maxStartingHand}
              step={1}
              value={startingHand}
              disabled={!cardsEnabled}
              onChange={(e) => setStartingHand(Number(e.target.value))}
              className="w-full accent-[var(--primary)] disabled:opacity-40"
            />
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              การ์ดที่แจกให้ทุกทีมตั้งแต่เริ่มเกม (ปกติจั่วทีละ 1 ใบเมื่อรอดจบตา)
            </span>
          </label>
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
