import { useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import {
  LIMITS,
  bombQuota,
  defaultTeamNames,
  glitchCountFor,
  maxScanRadiusFor,
  minCellsFor,
  suggestedScanRadius,
} from '@/lib/game/config'
import { bombDensity, chanceDisplay, suggestRange, verdictFor, type BalanceVerdict } from '@/lib/game/balance'
import { createRng, randomSeed, shuffle } from '@/lib/game/rng'
import type { GameSettings } from '@/lib/game/types'
import { RulesPanel } from './RulesPanel'
import { confirmDialog } from '@/components/ui/alert'
import { parseYouTubeId } from '@/lib/audio/music'
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
  const [turnInput, setTurnInput] = useState(String(initial.turnSeconds))
  const [glitchEnabled, setGlitchEnabled] = useState(initial.glitchEnabled)
  const [glitchMode, setGlitchMode] = useState<'auto' | 'manual'>(initial.glitchMode)
  const [glitchRatioInput, setGlitchRatioInput] = useState(String(Math.round(initial.glitchRatio * 100)))
  const [glitchCountInput, setGlitchCountInput] = useState(String(initial.glitchCount))
  const [cardsEnabled, setCardsEnabled] = useState(initial.cardsEnabled)
  const [handLimited, setHandLimited] = useState(initial.maxHandSize > 0)
  const [maxHandInput, setMaxHandInput] = useState(String(initial.maxHandSize || LIMITS.minHandSize))
  const [startingHandInput, setStartingHandInput] = useState(String(initial.startingHand))
  const [scanRadiusInput, setScanRadiusInput] = useState(String(initial.scanRadius))
  const [shrinkingEnabled, setShrinkingEnabled] = useState(initial.shrinkingEnabled)
  const [musicUrlInput, setMusicUrlInput] = useState(initial.musicUrl)
  const [musicVolumeInput, setMusicVolumeInput] = useState(String(initial.musicVolume))
  const [defuseSecondsInput, setDefuseSecondsInput] = useState(String(initial.defuseSeconds))
  const [countInput, setCountInput] = useState(String(names.length))
  const [settingsOpen, setSettingsOpen] = useState(false)
  // FIX #8: ตั้งค่าเป็น sidebar + เมนูหมวด — จำหมวดที่เลือกไว้
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('bomb')

  // ค่าที่เอาไปใช้จริง — ว่าง = ใช้ค่าต่ำสุด (แต่ไม่ดีดค่าใน input ระหว่างพิมพ์)
  const teams = names.length
  const cells = clampInt(Number(cellsInput), LIMITS.minRange, LIMITS.maxRange)
  const scanR = clampInt(Number(scanRadiusInput), LIMITS.minScanRadius, maxScanRadiusFor(cells))
  const quota = bombQuota(teams)
  const glitchRatio = clampInt(Number(glitchRatioInput) / 100, 0, LIMITS.maxGlitchRatio)
  const glitchCount = glitchEnabled
    ? glitchCountFor(quota, cells, glitchMode, glitchRatio, Number(glitchCountInput) || 0)
    : 0
  const density = bombDensity(quota + glitchCount, cells)
  const balance = verdictFor(density)
  const chance = chanceDisplay(quota + glitchCount, cells, teams)
  const suggestion = suggestRange(teams)
  const minCells = minCellsFor(teams)
  const canStart = cells >= minCells
  const musicId = musicUrlInput.trim() === '' ? null : parseYouTubeId(musicUrlInput)

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
      musicUrl: musicUrlInput.trim(),
      musicVolume: clampInt(Number(musicVolumeInput), 0, 100),
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
        <BombMark />
        <div>
          <h1 className="font-serif text-3xl font-bold">Minenumber — ตั้งค่า</h1>
          <p className="section-label">เลขระเบิด</p>
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
            <h2 className="section-label">ทีม ({teams})</h2>
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
                (ขั้นต่ำ {LIMITS.minTeams})
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

        {/* จำนวนช่อง + ระเบิด + โอกาสโดนระเบิด */}
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
                ขั้นต่ำ {minCells} ({teams} ทีม)
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <h3 className="mb-3 text-lg font-bold">รายละเอียดห้อง</h3>
            {/* FIX #11: แทนคำอธิบายยาว ๆ ด้วยตัวเลขจริง 3 ตัว (เดิมอยู่แถบล่าง) */}
            <div className="grid grid-cols-3 gap-3">
              <RoomStat label="ระเบิดจริง" value={quota} valueClass="text-destructive" />
              <RoomStat
                label="Glitch bomb"
                value={glitchEnabled ? glitchCount : 0}
                valueClass="text-purple-600 dark:text-purple-400"
              />
              <RoomStat label="การ์ดในสำรับ" value={cardsEnabled ? CARD_DECK_SIZE : 0} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${balanceBadgeClass(balance)}`}>
                {balanceBadgeText(balance)} ({Math.round(density * 100)}% เต็ม)
              </span>
              {/* FIX #1: ปุ่มแนะนำโชว์เฉพาะเลขช่อง ไม่ต้องมี "1–" */}
              <button
                onClick={() => setCellsInput(String(suggestion.max))}
                className="rounded-lg border border-primary px-3 py-1 text-sm font-bold text-primary"
              >
                ใช้ค่าแนะนำ {suggestion.max}
              </button>
            </div>
          </div>

          {/* Bar โอกาสโดนระเบิด (W2.2 / W2.3) */}
          {chance.kind === 'unplayable' ? (
            <div className="rounded-xl border-2 border-destructive bg-destructive/10 p-4 text-center">
              <p className="text-lg font-bold text-destructive">{chance.text}</p>
            </div>
          ) : chance.kind === 'certain' ? (
            <div className="rounded-xl border-2 border-red-600 bg-red-600/10 p-4 text-center">
              <p className="text-lg font-bold text-red-600 dark:text-red-400">{chance.text}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="mb-1 flex items-center justify-between text-sm font-bold">
                <span>โอกาสโดนระเบิด (ช่องถัดไปแบบสุ่ม)</span>
                <span className="font-mono text-xl font-black">{chance.percent}%</span>
              </div>
              <div className="range-bar">
                <div
                  className={chanceBarClass(chance.level)}
                  style={{ width: `${Math.max(chance.percent, 1)}%` }}
                />
              </div>
            </div>
          )}

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
                ช่องน้อยไป: ต้องมีอย่างน้อยเท่ากับจำนวนทีม = {minCells} ช่อง (ตอนนี้ {cells})
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
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex h-[min(85vh,640px)] w-[min(100%,880px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            {/* Sidebar เมนูหมวด */}
            <nav className="flex w-44 shrink-0 flex-col gap-1 border-r border-border bg-background p-3">
              <p className="section-label mb-2 px-2">ตั้งค่าเพิ่มเติม</p>
              {SETTINGS_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSettingsTab(t.id)}
                  className={
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-left text-base font-bold transition ' +
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

              <div className="min-h-0 flex-1 overflow-y-auto p-6 pr-14">
                <Dialog.Title className="font-serif text-2xl font-bold">
                  {SETTINGS_TABS.find((t) => t.id === settingsTab)?.label}
                </Dialog.Title>
                <Dialog.Description className="mt-1 mb-5 text-sm text-muted-foreground">
                  แก้ได้ทันที — ค่าที่ตั้งจะสะท้อนที่หน้าหลักทันที
                </Dialog.Description>

                {settingsTab === 'bomb' && (
                  <div className="flex flex-col gap-4">
                    {toggle(
                      'Glitch bomb (ระเบิดกลิตช์)',
                      'ระเบิดปลอม เปิดโดนแล้วไม่ตาย แต่ทีมนั้นใช้การ์ดไม่ได้ 2 ตา เป็นระเบิดส่วนเกินจากระเบิดจริง',
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
                            hint="เปอร์เซ็นต์ของระเบิดจริงที่จะเพิ่มเป็น glitch (0–50%)"
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
                    <NumberField
                      label="เวลา/ตารอบ"
                      hint="หมดเวลาแล้วทีมนั้นเสีย turn ไป (ไม่มีการสุ่มเปิดให้) ตั้ง 0 = ไม่จับเวลา"
                      value={turnInput}
                      onChange={setTurnInput}
                      min={0}
                      max={LIMITS.maxTurnSeconds}
                      suffix={Number(turnInput) === 0 ? 'ไม่จับเวลา' : `${Number(turnInput) || 0} วิ`}
                      onBlurFix={() => fixInput(turnInput, 0, LIMITS.maxTurnSeconds, 0, setTurnInput)}
                    />
                    <NumberField
                      label="เวลาตัดสายระเบิด"
                      hint="เวลานับถอยหลังตอนตัดสาย มีเสียง tick ทุกวินาที (ตั้ง 0 = ไม่จับเวลา)"
                      value={defuseSecondsInput}
                      onChange={setDefuseSecondsInput}
                      min={0}
                      max={LIMITS.maxDefuseSeconds}
                      suffix={
                        Number(defuseSecondsInput) === 0
                          ? 'ไม่จับเวลา'
                          : `${Number(defuseSecondsInput) || 0} วิ`
                      }
                      onBlurFix={() =>
                        fixInput(defuseSecondsInput, 0, LIMITS.maxDefuseSeconds, 0, setDefuseSecondsInput)
                      }
                    />
                  </div>
                )}

                {settingsTab === 'music' && (
                  <MusicSettings
                    musicUrlInput={musicUrlInput}
                    setMusicUrlInput={setMusicUrlInput}
                    musicVolumeInput={musicVolumeInput}
                    setMusicVolumeInput={setMusicVolumeInput}
                    musicId={musicId}
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

function chanceBarClass(level: BalanceVerdict): string {
  switch (level) {
    case 'too-easy':
      return 'bg-emerald-500'
    case 'good':
      return 'bg-yellow-400'
    case 'risky':
      return 'bg-orange-500'
    case 'brutal':
      return 'bg-red-600'
  }
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


// FIX #8: หมวดของหน้าตั้งค่า (sidebar)
type SettingsTab = 'bomb' | 'cards' | 'play' | 'music'

const SETTINGS_TABS: ReadonlyArray<{ id: SettingsTab; label: string; icon: string }> = [
  { id: 'bomb', label: 'ระเบิด', icon: '💣' },
  { id: 'cards', label: 'การ์ด', icon: '🃏' },
  { id: 'play', label: 'การเล่น', icon: '🎮' },
  { id: 'music', label: 'เสียง & เพลง', icon: '🎵' },
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

// FIX #7: ตั้งค่าเพลง/เสียง — ใช้ซ้ำได้ทั้งหน้าตั้งค่าและตอนเล่นเกม
export function MusicSettings({
  musicUrlInput,
  setMusicUrlInput,
  musicVolumeInput,
  setMusicVolumeInput,
  musicId,
}: {
  musicUrlInput: string
  setMusicUrlInput: (v: string) => void
  musicVolumeInput: string
  setMusicVolumeInput: (v: string) => void
  musicId: string | null
}) {
  return (
    <div className="flex flex-col gap-5">
      <label className="block">
        <span className="mb-1 block text-base font-semibold">URL เพลง (ไม่บังคับ)</span>
        <input
          type="url"
          value={musicUrlInput}
          onChange={(e) => setMusicUrlInput(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          className="control w-full font-mono text-base"
        />
        <span className="mt-1 block text-sm leading-6 text-muted-foreground">
          ว่าง = ไม่เปิดเพลง รองรับ watch?v= / youtu.be / playlist?list= / shorts / ID 11 ตัว
          {musicUrlInput.trim() !== '' &&
            (musicId ? (
              <span className="ml-2 font-bold text-emerald-600 dark:text-emerald-400">
                ✓ ใช้ได้{musicId.length > 11 ? ' (เพลย์ลิสต์)' : ''}
              </span>
            ) : (
              <span className="ml-2 font-bold text-destructive">✗ URL ใช้ไม่ได้</span>
            ))}
        </span>
      </label>
      <VolumeField
        label="ระดับเสียงเพลง"
        hint="เสียงเพลงพื้นหลัง แยกจากเสียง effect ของเกม — ลากแถบ หมุนลูกกลิ้งเมาส์ หรือกรอกตัวเลข 0–100"
        value={musicVolumeInput}
        onChange={setMusicVolumeInput}
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

  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-2 text-base font-semibold">
        {label}
        <span className="font-mono text-muted-foreground">{n}%</span>
      </span>
      <div className="flex items-center gap-3">
        <span aria-hidden="true">🔈</span>
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
          className="h-2 min-w-0 flex-1 accent-[var(--primary)]"
        />
        <span aria-hidden="true">🔊</span>
        <input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onChange(String(n))}
          aria-label={`${label} (ตัวเลข)`}
          className="control w-20 text-center text-base font-bold"
        />
      </div>
      {hint && <span className="mt-1 block text-sm leading-6 text-muted-foreground">{hint}</span>}
    </label>
  )
}
