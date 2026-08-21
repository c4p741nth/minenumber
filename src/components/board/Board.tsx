import { useEffect, useRef, useState } from 'react'
import type { CellState } from '@/lib/game/types'

interface ScanTarget {
  center: number
  radius: number
}

interface Props {
  rangeMin: number
  rangeMax: number
  cells: Record<number, CellState>
  // FIX #15: ช่องที่เปิดแล้วได้การ์ด (cell -> teamId)
  cardCells?: Record<number, string>
  disabled: boolean
  onOpen: (cell: number) => void
  // ช่องที่ Scan กำลังสแกน (W6.3) — รับแค่ center/radius ไม่รับตำแหน่งระเบิด
  scanning?: ScanTarget | null
  // FIX_LISTS ชุดที่สาม #3: ผลสแกนที่ยังใช้ได้ — cell -> โซนนี้มีระเบิดไหม
  // true = ขอบแดง (อาจมีระเบิดในโซน), false = ขอบฟ้า (โซนปลอดภัย — ชุดที่เจ็ด #4)
  scanMarks?: Record<number, boolean>
  // FIX_LISTS ชุดที่เจ็ด #2/#3: โหมด "เลือกช่องที่จะสแกน"
  //   กระดานเปลี่ยนหน้าที่ชั่วคราว — คลิกครั้งเดียวคือเลือกช่องสแกน (ไม่ใช่เปิดป้าย)
  //   และ hover ต้องเรืองเขียว neon ทั้งโซนที่รัศมีครอบถึง เพื่อให้เห็นขอบเขตก่อนกด
  //   radius = state.settings.scanRadius (ส่งมาเพื่อคำนวณโซน preview)
  scanPicking?: boolean
  scanRadius?: number
  onScanPick?: (cell: number) => void
  // FIX_LISTS ชุดที่สิบสอง #1: ช่องที่เลือกค้างอยู่รอกดย้ำ — ยกขึ้นไปให้ GameScreen
  //   แสดงในแถบ "ทีม X กรุณาเลือกแผ่นป้าย…" ด้านบนกระดาน แทนบรรทัดใต้กระดานที่เดิม
  //   (กรรมการมองแถบบนอยู่แล้ว บรรทัดล่างต้องกวาดตาลงไปอีกที่ และยังดันกระดานให้สั้นลง)
  onPickedChange?: (cell: number | null) => void
}

const OPENED_STYLES: Record<Exclude<CellState, 'hidden'>, { cls: string; label: string }> = {
  safe: { cls: 'bg-secondary text-muted-foreground opacity-70', label: '✓' },
  detonated: { cls: 'bg-red-600 text-white', label: '💥' },
  // ช่องที่กู้ระเบิดสำเร็จเป็น "ช่องที่จบแล้ว" เหมือนช่องปลอดภัย — ไม่ควรเขียวสดค้างอยู่
  // ตลอดเกม (เดิม bg-emerald-500 ไม่จางเลย ช่องเดียวสว่างแย่งสายตาไปจากช่องที่ยังไม่เปิด)
  // จางเป็นสีเทาแบบเดียวกับช่องปลอดภัย แต่คงไอคอน 🔧 กับโทนเขียวจาง ๆ ไว้ให้ยังแยกออกว่า
  // ช่องนี้เคยมีระเบิดแล้วกู้สำเร็จ ไม่ใช่ช่องที่เปิดมาปลอดภัยตั้งแต่แรก
  // (แอนิเมชัน .cell-defused-fade เขียวสดตอนแรกแล้วค่อยจาง — เห็นจังหวะที่กู้สำเร็จทันตา)
  defused: {
    cls: 'cell-defused-fade bg-secondary text-emerald-700 opacity-70 dark:text-emerald-400',
    label: '🔧',
  },
  // FIX_LISTS ชุดที่สิบสี่ #4: ช่อง glitch ก็เป็น "ช่องที่จบแล้ว" เหมือนช่องปลอดภัย
  //   (ระเบิด glitch ย้ายไปช่องอื่นแล้ว ช่องนี้ไม่มีอะไรเหลือ) เดิมม่วงสดค้างตลอดเกม
  //   ทำให้กระดานที่มี glitch หลายลูกกลายเป็นทุ่งม่วงแย่งสายตาจากช่องที่ยังไม่เปิด
  //   จางเป็นเทาแบบช่องปลอดภัย แต่คงไอคอน ⚡ กับโทนม่วงจาง ๆ ให้ยังแยกออกว่าเคยเป็น glitch
  //   (.cell-glitched-fade ม่วงสดแป๊บเดียวตอนเปิด แล้วค่อยจาง — เห็นจังหวะที่เจอ glitch ทันตา)
  glitched: {
    cls: 'cell-glitched-fade bg-secondary text-purple-700 opacity-70 dark:text-purple-400',
    label: '⚡',
  },
}

// B8: กระดานช่องเยอะ (เช่น 200 ช่อง) ในคอลัมน์กลางที่แคบ ได้แค่ ~7 คอลัมน์ → หน้ายาวมาก
// ย่อขนาดช่องขั้นบันไดตามจำนวนช่อง เพื่อให้ได้คอลัมน์ต่อแถวมากขึ้น
export function cellSizeFor(count: number): number {
  if (count > 300) return 34
  if (count > 120) return 40
  if (count > 60) return 48
  return 56
}

// FIX_LISTS ชุดใหม่ #2: ขนาดช่องเป็น px คงที่ (คำนวณจากจำนวนช่อง) จึงไม่ขยับเองตาม
// html{font-size} เหมือน utility rem อื่น ๆ — ต้องคูณ --mn-scale เอง ไม่งั้นพอสลับไป
// โหมด TV ตัวเลขจะโตล้นออกนอกช่องที่ยังเท่าเดิม
// อ่านค่าจาก computed style เพื่อให้ได้ตัวคูณจริงที่ display.ts ทาไว้ (ไม่ผูกกับ import)
export function readDisplayScale(): number {
  const root = globalThis.document?.documentElement
  if (!root) return 1
  const raw = globalThis.getComputedStyle?.(root).getPropertyValue('--mn-scale')
  const n = Number.parseFloat(raw ?? '')
  return Number.isFinite(n) && n > 0 ? n : 1
}

export function Board({
  rangeMin,
  rangeMax,
  cells,
  cardCells = {},
  disabled,
  onOpen,
  scanning = null,
  scanMarks = {},
  scanPicking = false,
  scanRadius = 0,
  onScanPick,
  onPickedChange,
}: Props) {
  // FIX #16: กันลั่นกดผิดช่อง — เลือกก่อน แล้วกดย้ำอีกครั้งเพื่อเปิด
  // FIX_LISTS ชุดที่สาม #8: ยืนยันด้วยการกดช่องเดิมซ้ำ ไม่ใช่ปุ่มยืนยันใต้กระดาน
  //   (ปุ่มเดิมอยู่ท้ายกระดาน ต้องเลื่อนจอลงไปกดทุกครั้ง เสียจังหวะเกม)
  const [picked, setPicked] = useState<number | null>(null)
  // FIX_LISTS ชุดที่เจ็ด #3: ช่องที่เม้าส์ชี้อยู่ระหว่างโหมดเลือกช่องสแกน
  //   ใช้คำนวณ preview โซน (center ± radius) ให้เรืองเขียว neon
  const [scanHover, setScanHover] = useState<number | null>(null)
  // FIX_LISTS ชุดที่สิบ #1: กรอบที่ scroll จริง — ใช้เลื่อนป้ายเองเมื่อขึ้นตาใหม่
  const gridRef = useRef<HTMLDivElement | null>(null)
  // FIX_LISTS ชุดใหม่ #2: ตัวคูณโหมดจอ — เฝ้า data-display บน <html> ที่ display.ts ตั้ง
  // (ปุ่มสลับโหมดอยู่คนละ subtree จึงส่ง prop ลงมาไม่ได้ ต้องดูจาก DOM ตรง ๆ)
  const [scale, setScale] = useState(() => readDisplayScale())
  useEffect(() => {
    const root = globalThis.document?.documentElement
    if (!root || typeof MutationObserver === 'undefined') return
    const obs = new MutationObserver(() => setScale(readDisplayScale()))
    obs.observe(root, { attributes: true, attributeFilter: ['data-display', 'style'] })
    return () => obs.disconnect()
  }, [])

  // ขึ้นตาใหม่ / ปิดกระดาน → ล้างช่องที่เลือกค้างไว้
  // FIX_LISTS ชุดที่สิบสอง #1: ต้องล้างข้อความบนแถบด้านบนด้วย ไม่ใช่แค่ไฮไลต์ในกระดาน
  //   (ข้อความอยู่คนละ component แล้ว จึงไม่หายไปเองพร้อมกับ picked)
  useEffect(() => {
    if (disabled) {
      setPicked(null)
      onPickedChange?.(null)
    }
  }, [disabled])

  // FIX_LISTS ชุดที่สิบ #1: ถึงตาใหม่ → เลื่อนตารางป้ายกลับขึ้นบนสุดให้เอง
  //   ทีมก่อนหน้าอาจเลื่อนลงไปดูป้ายท้าย ๆ ค้างไว้ พอเปลี่ยนตาแล้วกระดานยังค้างอยู่
  //   ตรงนั้น ทีมใหม่จะงงว่าป้ายต้น ๆ หายไปไหน — รีเซ็ตมุมมองให้เริ่มที่เดิมทุกตา
  //   ระหว่างตาของตัวเองยังเลื่อนดูได้อิสระตามปกติ (ไม่ล็อกตำแหน่ง)
  useEffect(() => {
    if (disabled) return
    gridRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [disabled])

  // FIX_LISTS ชุดที่เจ็ด #2: เข้า/ออกโหมดเลือกช่องสแกน → ล้างสถานะค้างของอีกโหมด
  //   (ช่องที่เลือกไว้รอเปิดป้าย และช่องที่ hover ไว้ตอนสแกน)
  useEffect(() => {
    setPicked(null)
    setScanHover(null)
    onPickedChange?.(null)
  }, [scanPicking])

  const numbers: number[] = []
  for (let n = rangeMin; n <= rangeMax; n++) numbers.push(n)

  // baseSize ใช้ตัดสิน "ช่องเล็กไหม" (ขนาดตัวอักษร) — ต้องไม่คูณ scale
  // ไม่งั้นพอเข้าโหมด TV ทุกช่องจะกลายเป็น "ใหญ่" แล้วกระดาน 300 ช่องล้นจอ
  const baseSize = cellSizeFor(numbers.length)
  const size = Math.round(baseSize * scale)
  const small = baseSize < 56

  // FIX_LISTS ชุดที่สาม #8: กดครั้งแรก = เลือก, กดช่องเดิมซ้ำ = เปิดจริง
  // กดช่องอื่นระหว่างที่เลือกค้างอยู่ = ย้ายที่เลือกไปช่องใหม่ (ยังไม่เปิด)
  //
  // FIX_LISTS ชุดที่เจ็ด #2: โหมดเลือกช่องสแกนคนละเรื่อง — คลิกครั้งเดียวจบ
  //   ไม่ต้องกดย้ำ เพราะสแกนไม่ได้เสี่ยงอะไร (กดผิดช่องก็แค่เสียการ์ด ไม่ระเบิด)
  //   และผู้เล่นเห็นขอบเขตโซนจาก preview สีเขียว neon ก่อนกดอยู่แล้ว
  function pick(cell: number) {
    if (scanPicking) {
      onScanPick?.(cell)
      return
    }
    if (picked === cell) {
      setPicked(null)
      onPickedChange?.(null)
      onOpen(cell)
      return
    }
    setPicked(cell)
    onPickedChange?.(cell)
  }

  return (
    // FIX_LISTS ชุดที่สิบ #1: กระดานกินความสูงที่เหลือของคอลัมน์กลาง (flex-1 + min-h-0)
    //   แล้วให้ "ตารางป้าย" ข้างในเป็นตัว scroll — แถบ "ตาทีม X"/คำสั่งสแกนด้านบน
    //   จึงอยู่กับที่ตลอด ไม่เลื่อนหนีไปพร้อมป้าย
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* FIX_LISTS ชุดที่สิบเอ็ด #2: ป้ายเป็นสี่เหลี่ยมจัตุรัสเสมอ ไม่ยืดเป็นแท่งยาว
          เดิม minmax(size, 1fr) → คอลัมน์ที่เหลือที่ว่างจะยืดกว้างออกจนสุดแถว
          แต่ความสูงยังล็อกที่ minHeight: size เท่าเดิม ป้ายเลยแบนกว้างผิดสัดส่วน
          (เห็นชัดสุดในโหมด Laptop ที่ช่องเล็กแต่คอลัมน์กลางกว้าง — ยืดเยอะสุด)
          ใช้ size คงที่แทน 1fr แล้ว justify-center จัดตารางไว้กลางคอลัมน์
          ที่ว่างที่เหลือกลายเป็นขอบซ้าย-ขวาแทนที่จะถูกดูดเข้าไปในป้าย */}
      <div
        ref={gridRef}
        // scroll ในกรอบตัวเองเมื่อกระดานสูงเกินจอ — ไม่ดันหน้าให้ยาวจนต้องเลื่อนทั้งหน้า
        // FIX_LISTS #8: เว้น padding รอบกรอบ ไม่ให้ outline ของช่องที่เลือก (.cell-picked)
        // ที่อยู่ริมสุดโดนขอบ overflow ตัดจนขอบดูขาดไปด้านหนึ่ง
        // FIX_LISTS ชุดที่สิบ #1: ไม่ล็อก max-h ด้วย 100vh อีกแล้ว (เดาความสูงหัวเว็บผิดได้
        //   เมื่อสลับโหมด TV/มีแถบสแกนโผล่) — ยืดตามที่ว่างจริงที่พ่อแม่เหลือให้แทน
        // FIX_LISTS: แถบการ์ดในมือเป็น fixed ทับด้านล่างของกระดานอยู่ จึงต้องกันที่ให้มัน
        //   เดิมใช้ pb-84 (336px คงที่) เป็น padding ของ "เนื้อหา" ในกรอบ ซึ่งผิดสองทาง:
        //     1. padding เป็นส่วนหนึ่งของความสูงเนื้อหา → เนื้อหาสูงเกินกรอบเสมอ
        //        เกิดแถบเลื่อนทั้งที่ป้ายยังไม่ล้นขอบ (เห็นชัดสุดในโหมด TV ที่ป้ายไม่กี่แถว)
        //     2. โหมด TV แถบการ์ดโตตาม --mn-scale (~500px) แต่ 336px เท่าเดิม → กันไม่พอ
        //   แก้เป็น "หดกรอบที่ scroll ให้สั้นลง" แทนการดันเนื้อหา — ดูคลาส .board-grid
        //   ใน globals.css (margin-bottom จาก --mn-hand-h ที่ Hand วัดความสูงจริงไว้)
        //   ป้ายสั้น = ไม่ล้นกรอบ = ไม่มีแถบเลื่อน / ป้ายยาว = เลื่อนสุดแล้วแถวท้ายอยู่เหนือแถบ
        className="board-grid grid min-h-0 flex-1 content-start justify-center gap-1.5 overflow-y-auto p-1.5 sm:gap-2"
        style={{ gridTemplateColumns: `repeat(auto-fill, ${size}px)` }}
      >
        {numbers.map((n) => {
          const state = cells[n] ?? 'hidden'
          const inScan =
            scanning !== null &&
            n >= scanning.center - scanning.radius &&
            n <= scanning.center + scanning.radius
          // FIX_LISTS ชุดที่เก้า #4: เอฟเฟกต์ต้องมาทันทีทุกช่อง ไม่ไล่ทีละใบ
          //   เดิมหน่วงตามระยะห่างจากจุดกลาง (0.06s ต่อช่อง) — รัศมีกว้าง ๆ
          //   ช่องริมกว่าจะสว่างก็ผ่านไปเกือบวินาที ตอนนี้ทั้งโซนสว่างพร้อมกัน
          if (state === 'hidden') {
            const isPicked = picked === n
            // FIX_LISTS ชุดที่สาม #3: ช่องที่เคยถูกสแกน — ขอบแดง = โซนนี้มีระเบิด,
            // ขอบฟ้า = โซนนี้ปลอดภัย (mark หายเองเมื่อระเบิดย้ายที่)
            // FIX_LISTS ชุดที่เจ็ด #4: ปลอดภัยเปลี่ยนจากเขียวเป็นฟ้า — สีเขียว neon
            //   สงวนไว้ให้ "กำลังจะสแกน/ขอบเขตการสแกน" อย่างเดียว ไม่งั้นสองความหมายชนกัน
            // ช่องที่เลือกอยู่ใช้ขอบ primary เหมือนเดิม — สถานะ "กำลังจะเปิด" สำคัญกว่า
            const mark = scanMarks[n]
            const markClass =
              mark === undefined
                ? 'border-border'
                : mark
                  ? 'cell-scanned-bomb border-red-500'
                  : 'cell-scanned-safe border-sky-500'
            // FIX_LISTS ชุดที่เจ็ด #3: โซนที่รัศมีสแกนจะครอบถึง ถ้ากดช่องที่ชี้อยู่ตอนนี้
            //   เรืองเขียว neon ทั้งโซน — เห็นขอบเขตก่อนตัดสินใจกด
            const inScanPreview =
              scanPicking &&
              scanHover !== null &&
              n >= scanHover - scanRadius &&
              n <= scanHover + scanRadius
            return (
              <button
                key={n}
                onClick={() => pick(n)}
                onMouseEnter={scanPicking ? () => setScanHover(n) : undefined}
                onMouseLeave={scanPicking ? () => setScanHover(null) : undefined}
                onFocus={scanPicking ? () => setScanHover(n) : undefined}
                onBlur={scanPicking ? () => setScanHover(null) : undefined}
                disabled={disabled && !scanPicking}
                aria-pressed={isPicked}
                title={
                  scanPicking
                    ? `สแกนรอบเลข ${n} (ครอบ ${Math.max(rangeMin, n - scanRadius)}–${Math.min(rangeMax, n + scanRadius)})`
                    : mark === undefined
                      ? undefined
                      : mark
                        ? 'เคยสแกนแล้ว — โซนนี้มีระเบิด'
                        : 'เคยสแกนแล้ว — โซนนี้ปลอดภัย'
                }
                style={{ width: size, height: size }}
                className={
                  'grid place-items-center rounded-lg border-2 p-1 font-mono ' +
                  'font-black transition ' +
                  'disabled:cursor-not-allowed disabled:opacity-50 ' +
                  // โหมดเลือกช่องสแกน: ไม่ใช้ hover สี primary ของโหมดเปิดป้าย
                  // (โซนเขียว neon เป็นตัวบอกอยู่แล้ว และ hover ทีละช่องจะขัดกัน)
                  (scanPicking
                    ? `cursor-crosshair bg-card ${inScanPreview ? 'cell-scan-preview border-emerald-400' : markClass} `
                    : isPicked
                      ? 'cell-picked border-primary bg-primary text-primary-foreground hover:border-primary '
                      : `${markClass} bg-card hover:border-primary hover:bg-primary hover:text-primary-foreground `) +
                  (small ? 'text-base ' : 'text-xl ') +
                  (inScan ? 'cell-scan' : '')
                }
              >
                {n}
              </button>
            )
          }
          const s = OPENED_STYLES[state]
          // FIX #15: ช่องที่เปิดแล้วได้การ์ด — ใส่ขอบ/จุดสีให้เห็นว่าการ์ดมาจากช่องนี้
          const gaveCard = cardCells[n] !== undefined
          return (
            <button
              key={n}
              disabled
              style={{ width: size, height: size }}
              className={
                `relative grid place-items-center rounded-lg border-2 ` +
                `p-1 font-mono font-black ${small ? 'text-lg' : 'text-2xl'} ${s.cls} ` +
                (gaveCard ? 'cell-gave-card border-amber-400' : 'border-transparent')
              }
              title={gaveCard ? `${state} — ช่องนี้ได้การ์ด` : state}
            >
              {s.label}
              {gaveCard && (
                <span className="absolute -top-1 -right-1 text-xs" aria-label="ได้การ์ดจากช่องนี้">
                  🃏
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* FIX_LISTS ชุดที่สิบสอง #1: ไม่มีบรรทัด "เลือกช่อง X — กดช่องเดิมอีกครั้ง…"
          ใต้กระดานอีกแล้ว — ย้ายขึ้นไปอยู่ในแถบ "ทีม X กรุณาเลือกแผ่นป้าย…" (TurnPrompt)
          ที่กรรมการมองอยู่แล้ว ส่งขึ้นไปผ่าน onPickedChange
          ได้ที่ว่างคืนให้ตารางป้ายด้วย (บรรทัดนี้เคยดันกระดานให้สั้นลงทุกครั้งที่เลือกช่อง) */}
    </div>
  )
}
