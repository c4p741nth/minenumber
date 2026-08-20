'use client'

import { useState } from 'react'
import { LIMITS, bombQuota, glitchCountFor } from '@/lib/game/config'
import type { GameSettings } from '@/lib/game/types'

interface Props {
  initial: GameSettings
  onStart: (s: GameSettings) => void
}

function letterName(index: number): string {
  return `ทีม ${String.fromCharCode(65 + index)}`
}

export function SetupScreen({ initial, onStart }: Props) {
  const [names, setNames] = useState<string[]>(initial.teamNames)
  const [rangeMin, setRangeMin] = useState(initial.rangeMin)
  const [rangeMax, setRangeMax] = useState(initial.rangeMax)
  const [turnSeconds, setTurnSeconds] = useState(initial.turnSeconds)
  const [glitchEnabled, setGlitchEnabled] = useState(initial.glitchEnabled)
  const [glitchRatio, setGlitchRatio] = useState(initial.glitchRatio)
  const [cardsEnabled, setCardsEnabled] = useState(initial.cardsEnabled)
  const [scanRadius, setScanRadius] = useState(initial.scanRadius)
  const [shrinkingEnabled, setShrinkingEnabled] = useState(initial.shrinkingEnabled)

  const teams = names.length
  const cells = rangeMax - rangeMin + 1
  const quota = bombQuota(teams)
  const glitchCount = glitchEnabled ? glitchCountFor(quota, glitchRatio) : 0
  const minCells = teams * LIMITS.minCellsPerTeam
  const canStart = cells >= minCells

  function setTeamName(i: number, v: string) {
    setNames(names.map((n, j) => (j === i ? v : n)))
  }
  function addTeam() {
    if (teams >= LIMITS.maxTeams) return
    setNames([...names, letterName(teams)])
  }
  function removeTeam(i: number) {
    if (teams <= LIMITS.minTeams) return
    setNames(names.filter((_, j) => j !== i))
  }

  function handleStart() {
    onStart({
      teamNames: names.map((n) => n.trim() || letterName(0)),
      rangeMin,
      rangeMax,
      turnSeconds,
      glitchEnabled,
      glitchRatio,
      cardsEnabled,
      scanRadius,
      shrinkingEnabled,
    })
  }

  const toggle = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-6 w-6 accent-[var(--primary)]"
      />
      <span className="text-lg font-semibold">{label}</span>
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
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ทีม */}
        <section className="panel">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-label">ทีม ({teams}/{LIMITS.maxTeams})</h2>
            <button
              onClick={addTeam}
              disabled={teams >= LIMITS.maxTeams}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-bold disabled:opacity-40"
            >
              + เพิ่มทีม
            </button>          </div>
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
              ระเบิดจริง = ทีม − 1 = {quota} ลูก (ล็อกไว้เพื่อให้เกมจบเมื่อเหลือ 1 ทีม)
              {glitchEnabled ? ` + glitch ${glitchCount} ลูก` : ''}
            </p>
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
        <section className="panel flex flex-col gap-4">
          <h2 className="section-label">ตัวเลือก</h2>
          {toggle('Glitch bomb (ระเบิดกลิตช์)', glitchEnabled, setGlitchEnabled)}
          {toggle('ระบบการ์ด', cardsEnabled, setCardsEnabled)}
          {toggle('โหมดเร่ง (วงหด)', shrinkingEnabled, setShrinkingEnabled)}
          {shrinkingEnabled && (
            <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
              คำเตือน: เกมจะจบเร็ว และทีมที่เล่นทีหลัง
              เสี่ยงสูงกว่าโดยไม่แฟร์
            </p>
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
          </label>

          <label className="block">
            <span className="mb-1 flex justify-between text-base font-semibold">
              สัดส่วน Glitch
              <span className="text-muted-foreground">{Math.round(glitchRatio * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={0.5}
              step={0.05}
              value={glitchRatio}
              disabled={!glitchEnabled}
              onChange={(e) => setGlitchRatio(Number(e.target.value))}
              className="w-full accent-[var(--primary)] disabled:opacity-40"
            />
          </label>
        </section>
      </div>
    </div>
  )
}