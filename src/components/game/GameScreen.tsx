
import { useEffect, useRef, useState } from 'react'
import { Board } from '@/components/board/Board'
import { TimerCircle } from '@/components/board/TimerCircle'
import { Hand } from '@/components/cards/Hand'
import { BlockPrompt } from '@/components/defuse/BlockPrompt'
import { AttackPrompt } from '@/components/defuse/AttackPrompt'
import { DefuseModal } from '@/components/defuse/DefuseModal'
import { GameEffects } from '@/components/effects/GameEffects'
import { VolumeControl } from '@/components/effects/VolumeControl'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { DisplayModeToggle } from '@/components/ui/DisplayModeToggle'
import { GameOverScreen } from '@/components/gameover/GameOverScreen'
import { confirmDialog } from '@/components/ui/alert'
import { hitChance, isForcedWireCut } from '@/lib/game/balance'
import { computeRankings, medalClass, MEDAL_EMOJI, visibleMedal } from '@/lib/game/ranking'
import { useDisplayMode } from '@/lib/useDisplayMode'
import { BombMark } from '@/components/setup/SetupScreen'
import type { CardType, Phase } from '@/lib/game/types'
import { useGame } from './GameProvider'

// FIX_LISTS ชุดที่สิบห้า: phase ที่มี overlay คลุมเต็มจอ (modal ตัดสาย/บล็อก/โจมตี/จบเกม)
//   ใช้บอก GameHeader ให้หรี่โลโก้ลง — ตัว set เดียวกันกับเงื่อนไขเรนเดอร์ modal ด้านล่าง
//   ประกาศไว้ที่นี่เพื่อไม่ให้สองที่หลุดออกจากกันตอนเพิ่ม phase ใหม่
const OVERLAY_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  'defusing',
  'blocking',
  'defending',
  'gameover',
])

interface Props {
  // FIX_LISTS #8: จบเกมเหลือปุ่ม "กลับไปหน้าหลัก" ปุ่มเดียว → ไม่ต้องมี
  // onRestart/onLeaderboard อีกแล้ว
  onExit: () => void
}

interface ScanInfo {
  center: number
  radius: number
  found: boolean
}

// FIX_LISTS ชุดที่แปด #1: ผลสแกนที่จะเอาไปแสดงในแถบข้อความของตา (แทน modal)
//   เก็บช่วงที่ตรวจไว้เลย ไม่ต้องคำนวณซ้ำตอนเรนเดอร์
export interface ScanResult {
  center: number
  lo: number
  hi: number
  found: boolean
}

export function GameScreen({ onExit }: Props) {
  const { state, dispatch } = useGame()
  const current = state.teams[state.currentTeamIndex]
  const [typed, setTyped] = useState('')
  const [cardMode, setCardMode] = useState(true)
  const [scanning, setScanning] = useState<{ center: number; radius: number } | null>(null)
  // FIX_LISTS ชุดที่เจ็ด #2: การ์ด Scan ที่กด ✓ แล้วและกำลังรอผู้เล่นเลือกช่องบนกระดาน
  //   เก็บ index ไว้ด้วย เพราะ engine ต้องใช้ตอน PLAY_CARD (มือมี Scan ได้หลายใบ)
  //   null = ไม่ได้อยู่ในโหมดเลือกช่องสแกน
  const [scanPick, setScanPick] = useState<{ card: CardType; index: number } | null>(null)
  // FIX_LISTS ชุดที่แปด #1: ผลสแกนไม่เด้งเป็น modal อีกแล้ว — เก็บไว้ใน state
  //   แล้วไปแสดงแทนที่ข้อความในแถบ "ทีม X กรุณาเลือกแผ่นป้าย…" ตรง ๆ
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const lastScanSig = useRef<string | null>(null)
  // FIX_LISTS ชุดที่สิบสอง #1: ช่องที่ Board เลือกค้างไว้รอกดย้ำ — ข้อความบอกสถานะ
  //   ย้ายจากใต้กระดานขึ้นมาอยู่ในแถบ TurnPrompt ด้านบน จึงต้องรู้ค่านี้ที่ระดับนี้
  const [pickedCell, setPickedCell] = useState<number | null>(null)
  // FIX_LISTS ชุดที่สาม #11: โหมด TV เปลี่ยนสัดส่วนคอลัมน์ (panel ทีมแคบลง)
  const tv = useDisplayMode() === 'tv'

  // ขึ้นตาใหม่ → กลับไปช่วงใช้การ์ดก่อน
  // ต้อง depend บนตาที่เปลี่ยน (turnNumber/currentTeamIndex) ด้วย — phase ค้างเป็น 'cards'
  // ข้ามตาได้ ทำให้ effect ที่ depend เฉพาะ phase ไม่ยิงซ้ำ แล้วโหมดค้างที่ "เปิดป้ายเลย"
  useEffect(() => {
    if (state.phase === 'cards') setCardMode(true)
  }, [state.phase, state.turnNumber, state.currentTeamIndex])

  // FIX_LISTS ชุดที่เจ็ด #2: ขึ้นตาใหม่ / หลุดออกจาก phase การ์ด → ยกเลิกโหมดเลือกช่องสแกน
  //   (การ์ดยังอยู่ในมือ เพราะ PLAY_CARD จะยิงตอนคลิกช่องเท่านั้น — ไม่มีการ์ดหาย)
  useEffect(() => {
    setScanPick(null)
    // FIX_LISTS ชุดที่แปด #1: ขึ้นตาใหม่ → ล้างผลสแกนเก่าออกจากแถบข้อความ
    //   (ผลของทีมก่อนหน้าไม่ควรค้างให้ทีมถัดไปเห็น)
    setScanResult(null)
    // FIX_LISTS ชุดที่เก้า #3: ไม่มี timer มาล้างแสงเรืองของช่องที่สแกนแล้ว
    //   (ผลขึ้นทันทีตั้งแต่ tick แรก) จึงต้องล้างตรงนี้พร้อมผล
    setScanning(null)
  }, [state.turnNumber, state.currentTeamIndex, state.phase])

  const inCards = state.phase === 'cards'
  // FIX_LISTS #14: ช่องที่เหลือ = ระเบิดจริง → เปิดช่องไหนก็เจอ (โอกาส 100%)
  // เกมกลายเป็น "แข่งกันตัดสาย" สลับทีมไปมาจนจบ — การ์ดที่เกี่ยวกับ turn ยังใช้ได้ก่อน
  const forcedWireCut = isForcedWireCut(
    state.realBombsRemaining ?? state.bombsRemaining,
    hiddenCellCount(state),
  )
  // FIX_LISTS ชุดใหม่ #2: บังคับตัดสายแล้วไม่ต้องเลือกช่อง — เข้าโหมดตัดสายเลย
  // เอนจินบอกมาว่าทีมนี้ไม่มี item ที่เกี่ยวกับ turn (Skip/Reverse/Attack) เหลืออยู่
  // ถ้ายังมี ต้องปล่อยให้เลือกใช้การ์ดก่อน (autoWireCut จะเป็น false)
  const autoWireCut = state.autoWireCut === true
  useEffect(() => {
    if (!autoWireCut) return
    // FIX_LISTS ชุดที่เก้า #4: เอฟเฟกต์/ผลทุกอย่างต้องมาทันที ไม่หน่วง
    //   เดิมหน่วง 600ms ให้เห็นว่าถึงตาตัวเองก่อน modal ตัดสายเด้ง — ตอนนี้เด้งเลย
    dispatch({ type: 'START_WIRE_CUT' })
  }, [autoWireCut, state.turnNumber, state.currentTeamIndex, dispatch])

  // พิมพ์ตัวเลขตรง ๆ เพื่อเลือกช่อง (MC พิมพ์เร็วกว่าคลิก) + Esc ยกเลิก
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (state.phase !== 'opening' && state.phase !== 'cards') return
      if (/^\d$/.test(e.key)) {
        setTyped((prev) => (prev + e.key).slice(0, 3))
      } else if (e.key === 'Enter' && typed !== '') {
        dispatch({ type: 'OPEN_CELL', cell: Number(typed) })
        setTyped('')
      } else if (e.key === 'Backspace') {
        setTyped((prev) => prev.slice(0, -1))
      } else if (e.key === 'Escape') {
        setTyped('')
        // FIX_LISTS ชุดที่เจ็ด #2: Esc ยกเลิกโหมดเลือกช่องสแกนด้วย (การ์ดยังอยู่ในมือ)
        setScanPick(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.phase, typed, dispatch])

  // FIX #44: ยุติเกมแล้วต้องเห็นหน้าสรุปอันดับทันทีเหมือนเกมจบตามปกติ
  // (เดิมเรียก onExit() ซึ่งทำลาย handle แล้วเด้งกลับหน้าตั้งค่า — อันดับหายไปเลย)
  function endGame() {
    void confirmDialog({
      title: 'จบเกมนี้เลย?',
      text: 'เกมจะถูกบันทึกเป็นจบเกม แล้วแสดงสรุปอันดับ',
      confirmText: 'จบเกม',
    }).then((ok) => {
      if (ok) dispatch({ type: 'END_GAME' })
    })
  }

  // W6.3: เล่น Scan → ให้ Board เรืองแสงช่วงที่ตรวจ แล้ว popup ผลหลัง animation จบ
  // ใช้ ref กัน trigger ซ้ำตอน state อัปเดตเหตุอื่น (lastCardResult เปลี่ยน identity ทุกครั้ง)
  useEffect(() => {
    const lc = state.lastCardResult
    const sig = lc ? JSON.stringify(lc) : null
    if (!lc || lc.card !== 'scan' || sig === lastScanSig.current) return
    lastScanSig.current = sig
    const info: ScanInfo = {
      center: lc.center,
      radius: state.settings.scanRadius,
      found: lc.found,
    }
    // FIX_LISTS ชุดที่เก้า #3: ผลสแกนต้องขึ้นทันที ไม่หน่วง
    //   เดิมรอ animation เรืองแสง 2200ms ก่อนค่อยเฉลย — กรรมการต้องยืนรอทุกครั้งที่สแกน
    //   ตอนนี้ set ทั้ง "ช่วงที่เรืองแสง" และ "ผล" ใน tick เดียวกัน
    //   ช่องยังเรืองแสงอยู่ (scanning) แต่ผลอ่านได้เลยจากแถบข้อความด้านบน
    //   ล้าง scanning ตอนขึ้นตาใหม่แทน (ดู effect ล้าง scanPick/scanResult ด้านบน)
    setScanning({ center: info.center, radius: info.radius })
    const lo = Math.max(state.rangeMin, info.center - info.radius)
    const hi = Math.min(state.rangeMax, info.center + info.radius)
    // FIX_LISTS #13: ปลอดภัย = สีฟ้า, ไม่ปลอดภัย = สีแดง (สื่อด้วยสีของแถบ)
    // FIX_LISTS ชุดที่แปด #1: ไม่มี modal ผลสแกนแล้ว — ผลไปแสดงแทนที่ข้อความในแถบ
    //   "ทีม X กรุณาเลือกแผ่นป้าย…" กรรมการอ่านแล้วเล่นต่อได้เลย ไม่ต้องกดปิด
    setScanResult({ center: info.center, lo, hi, found: info.found })
  }, [state.lastCardResult, state.rangeMin, state.rangeMax, state.settings.scanRadius])

  // FIX #26: ใช้ layout ความกว้างคงที่ ไม่ place-content-center
  // (เดิมจอ "ดิ้น" เพราะ content จัดกลางแล้วขนาดเปลี่ยนทุกครั้งที่เปลี่ยนทีม/เปิดช่อง)
  return (
    // FIX_LISTS ชุดที่เก้า #1: หน้าจอเกมล็อกความสูงเท่า viewport และห้าม scroll แถบนอกสุด
    //   เดิมเป็น min-h-screen → เนื้อหายาวกว่าจอเมื่อไหร่ ทั้งหน้าเลื่อนตาม
    //   หัวเว็บ (จับเวลา/ปุ่ม) กับแถบการ์ดในมือจึงหลุดออกนอกจอ กรรมการต้องเลื่อนกลับขึ้นมา
    //   ตอนนี้เป็น flex column สูงเท่าจอ: หัวเว็บอยู่กับที่ ส่วน grid ด้านล่างกินที่เหลือ
    //   (min-h-0 จำเป็น — ไม่งั้น flex item ยืดตามเนื้อหาแทนที่จะยอมหดแล้วให้ลูก scroll)
    <div className="flex h-screen w-full flex-col overflow-hidden p-2 sm:p-4">
      <GameHeader onExit={endGame} overlay={OVERLAY_PHASES.has(state.phase)} />
      {/* FIX_LISTS ชุดใหม่ #2: คอลัมน์ข้างเป็น rem (15rem/18.75rem = 240px/300px ตอน
          โหมด Laptop) เพื่อให้กว้างขึ้นตามตัวอักษรเมื่อสลับเป็นโหมด TV — ถ้าล็อกเป็น px
          ตัวหนังสือจะโตแต่คอลัมน์เท่าเดิม ชื่อทีม/บันทึกจะถูกบีบจนตัดคำ
          FIX_LISTS ชุดที่สาม #11: โหมด TV บีบคอลัมน์ทีมให้แคบลง (15 → 11rem) และคอลัมน์
          ขวาไม่ต้องกว้างแล้ว (ไม่มีบันทึก) — พื้นที่ที่ได้คืนไปให้กระดานตรงกลาง
          ส่วนแผงการ์ดที่มาทับ panel ขวาจึงมีที่ยืนเต็ม ๆ */}
      <div
        className={
          // FIX_LISTS ชุดที่หก #1: การ์ดในมือใหญ่ขึ้น → แถบมือสูงขึ้นจาก ~176px เป็น ~228px
          //   pb-44 (176px) เดิมกันไม่พอ เนื้อหาท้ายกระดานจะโดนแถบทับ → เผื่อเป็น pb-60 (240px)
          // FIX_LISTS ชุดที่เจ็ด #1: การ์ดโตอีก 1.5 เท่า (124→186px กว้าง = ~267px สูง)
          //   บวกหัวแถบ/ปุ่ม ~52px → แถบมือสูงราว 320px → เผื่อเป็น pb-84 (336px)
          // FIX_LISTS ชุดที่เก้า #1: grid กินความสูงที่เหลือจากหัวเว็บ (flex-1 + min-h-0)
          //   items-stretch แทน items-start เพื่อให้ทั้งสามคอลัมน์สูงเต็มแล้ว scroll เองข้างใน
          //   ไม่มี pb-84 เผื่อแถบการ์ดที่ตัวนอกอีกแล้ว — ย้ายไปเป็น padding ล่างของ
          //   คอลัมน์กลางที่ scroll (ที่เดียวที่เนื้อหาจะไปโดนแถบการ์ดทับ)
          'mx-auto grid w-full max-w-375 min-h-0 flex-1 items-stretch gap-4 ' +
          (tv
            ? 'lg:grid-cols-[11rem_1fr_13rem]'
            : 'lg:grid-cols-[15rem_1fr_18.75rem]')
        }
        // FIX_LISTS ชุดที่เจ็ด #5: บอกความกว้างที่การ์ด (fixed right-3) ใช้ได้จริง
        //   การ์ดวัดระยะจาก "ขอบ viewport" แต่คอลัมน์ขวาวัดจาก "ขอบ grid" ซึ่งไม่ใช่ที่
        //   เดียวกันเมื่อจอกว้างเกิน max-w-375 (1500px) แล้ว grid ถูกจัดกลาง
        //   ที่ว่างจริงของการ์ด = ครึ่งของขอบที่เหลือ + คอลัมน์ขวา
        //   clamp ด้วย max() กับ 0px กันค่าติดลบตอนจอแคบกว่า grid
        //   (max-w-375 = 375 x 0.25rem = 93.75rem ตาม spacing scale ของ Tailwind v4)
        //   custom property ไม่มีใน type ของ style → cast ผ่าน Record ก่อน
        style={
          {
            '--mn-card-col': tv
              ? 'calc(13rem + max(0px, (100vw - 93.75rem) / 2))'
              : 'calc(18.75rem + max(0px, (100vw - 93.75rem) / 2))',
          } as Record<string, string>
        }
      >
        <TeamList />
        {/* FIX_LISTS ชุดที่สิบ #1: คอลัมน์กลาง "ไม่ scroll" ทั้งก้อนอีกแล้ว
            เดิม overflow-y-auto อยู่ที่ <main> → เลื่อนดูป้ายท้ายกระดานทีไร
            แถบ "ตาทีม X" กับแถบคำสั่ง/ผลสแกน เลื่อนหลุดขึ้นไปด้วย กรรมการต้อง
            เลื่อนกลับขึ้นมาดูว่าตาใคร ตอนนี้ main เป็น flex column สูงเต็มคอลัมน์
            แถบบนอยู่กับที่ แล้วให้ตัว "ตารางป้าย" ข้างใน Board scroll เองที่เดียว
            (min-h-0 ให้ main ยอมหดเพื่อส่งความสูงที่เหลือให้ Board) */}
        <main className="flex min-h-0 flex-col gap-3">
          <CurrentTeamBanner />
          {/* FIX #17: แทนเมนู "ตานี้จะทำอะไร?" ด้วยข้อความบอกตรง ๆ ว่าใครต้องทำอะไร
              FIX_LISTS ชุดที่แปด #1: แถบนี้เป็น "ช่องข้อความเดียว" ของช่วงใช้การ์ด —
                คำสั่งสแกน (ไปเลือกช่อง) และผลสแกน (เจอ/ไม่เจอระเบิด) มาแสดงแทนที่
                ข้อความปกติในช่องเดิม ไม่มี modal เด้ง และไม่มีแถบใหม่มาดันกระดานลง */}
          {/* FIX_LISTS ชุดที่สิบเอ็ด #1: ป้าย "ทีม X ต้องเปิดอีก N ป้าย" ย้ายมาอยู่
              "ช่องเดียวกัน" กับข้อความ "ทีม X กรุณาเลือกแผ่นป้าย…" (เดิมเป็นแถบแยก
              อยู่ใต้กระดาน กรรมการต้องกวาดตาสองที่ และแถบล่างยังดันกระดานให้สั้นลง)
              แถบนี้จึงต้องโชว์ทั้ง phase 'cards' และ 'opening' — pendingOpens ค้าง
              ข้ามมาถึงช่วงเปิดป้ายด้วย ไม่ใช่แค่ช่วงใช้การ์ด */}
          {/* แถบนี้โชว์ตอน 'defusing' ด้วย — เดิม unmount ไปทั้งแถบตอน modal ตัดสายเด้ง
              ทำให้ข้อความที่มองทะลุ modal ลงมายังเป็น "ทีม X กรุณาเลือกแผ่นป้าย…" ค้างอยู่
              ทั้งที่จังหวะนั้นทีมกำลังตัดสายระเบิด ไม่ได้กำลังเลือกป้าย */}
          {(inCards || state.phase === 'opening' || state.phase === 'defusing') && (
            <TurnPrompt
              defusing={state.phase === 'defusing'}
              teamName={current.name}
              handCount={inCards ? current.hand.length : 0}
              // FIX_LISTS ชุดที่สิบเอ็ด #1: แถบนี้โชว์ตอน 'opening' ด้วยแล้ว — ช่วงนั้น
              //   ใช้การ์ดไม่ได้อีก (playCard รับแค่ phase 'cards') ปุ่ม "กลับไปใช้การ์ด"
              //   จึงต้องไม่โผล่ ไม่งั้นกรรมการกดแล้วไม่เกิดอะไรขึ้น
              cardMode={inCards ? cardMode : true}
              onBackToCards={() => setCardMode(true)}
              scanPicking={scanPick !== null}
              scanRadius={state.settings.scanRadius}
              onCancelScan={() => setScanPick(null)}
              scanResult={scanResult}
              onDismissScanResult={() => setScanResult(null)}
              pendingOpens={current.pendingOpens}
              pickedCell={pickedCell}
            />
          )}
          {/* FIX_LISTS #14: บังคับเข้าโหมดตัดสาย — ทุกช่องที่เหลือเป็นระเบิดจริงหมด */}
          {forcedWireCut && state.phase !== 'gameover' && (
            <div
              className={
                'rounded-xl border-2 border-red-600 bg-red-600/10 p-3 text-center ' +
                'text-lg font-bold text-red-700 dark:text-red-300'
              }
              role="status"
            >
              {/* แถบนี้เหลือบรรทัดเดียว — คำอธิบายยาว 2 บรรทัดเดิม (เงื่อนไขการแข่งตัดสาย
                  / "กำลังเริ่มตัดสาย…") กินที่บนจอทั้งที่กรรมการอ่านรอบเดียวก็รู้แล้ว
                  ตัวสถานะจริงไปอยู่บน modal ตัดสายที่เด้งตามมาทันทีอยู่แล้ว */}
              💣 ช่องที่เหลือเป็นระเบิดทั้งหมด - บังคับตัดสายระเบิด
            </div>
          )}
          {/* FIX_LISTS ชุดที่สี่ #6: ไม่มีแถบคำอธิบาย "เลือกช่อง / กด Enter" คั่นแล้ว —
              ตารางตัวเลขขยับขึ้นไปชิดแถบ "ทีม X กรุณาเลือกแผ่นป้าย…" ทันที
              (พิมพ์เลขเลือกช่องยังใช้ได้เหมือนเดิม แค่ไม่กินที่บนจอ)
              FIX_LISTS ชุดที่แปด #1: แถบสแกน (คำสั่ง/ผล) ไม่ได้เป็น element แยกอีกแล้ว —
                ย้ายเข้าไปอยู่ใน TurnPrompt ด้านบน (แทนที่ข้อความ "กรุณาเลือกแผ่นป้าย…") */}
          <Board
            rangeMin={state.rangeMin}
            rangeMax={state.rangeMax}
            cells={state.cells}
            cardCells={state.cardCells}
            disabled={state.phase !== 'opening' && state.phase !== 'cards'}
            onOpen={(cell) => dispatch({ type: 'OPEN_CELL', cell })}
            scanning={scanning}
            // FIX_LISTS ชุดที่สาม #3: mark ช่องที่สแกนแล้วด้วยสีขอบ (เอนจินล้างให้เองตอนระเบิดย้าย)
            scanMarks={state.scanMarks}
            // FIX_LISTS ชุดที่เจ็ด #2/#3: โหมดเลือกช่องสแกน — คลิกเดียวจบ + preview โซนตอน hover
            scanPicking={scanPick !== null}
            scanRadius={state.settings.scanRadius}
            onScanPick={(cell) => {
              if (scanPick === null) return
              dispatch({
                type: 'PLAY_CARD',
                card: scanPick.card,
                index: scanPick.index,
                targetCell: cell,
              })
              setScanPick(null)
            }}
            // FIX_LISTS ชุดที่สิบสอง #1: ช่องที่เลือกค้างอยู่ → ขึ้นไปโชว์ในแถบด้านบน
            onPickedChange={setPickedCell}
          />
        </main>
        {/* FIX #16: ล็อก panel ขวาแบบ floating — เลื่อนกระดานยาว ๆ แล้วยังเห็นสถานะ/log */}
        {/* FIX #16: เลื่อนกระดานยาว ๆ แล้วยังเห็นสถานะ/log
            FIX_LISTS ชุดที่เก้า #1: ไม่ต้อง sticky แล้ว — ตัวแม่ไม่ scroll ตั้งแต่แรก
            คอลัมน์นี้สูงเต็มกรอบและ scroll เองถ้า log ยาว (min-h-0 ให้ยอมหดได้) */}
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <StatusPanel />
          <LogPanel />
        </aside>
      </div>
      {state.phase === 'defusing' && <DefuseModal />}
      {state.phase === 'blocking' && <BlockPrompt />}
      {state.phase === 'defending' && <AttackPrompt />}
      {state.phase === 'gameover' && <GameOverScreen onExit={onExit} />}
      <Hand
        locked={!cardMode}
        // FIX_LISTS ชุดที่เจ็ด #2: Scan กด ✓ → การ์ดหายจากจอ แล้วมาเลือกช่องบนกระดาน
        onPickCell={(card, index) => setScanPick({ card, index })}
      />
      <GameEffects />
    </div>
  )
}

// FIX_LISTS ชุดที่แปด #1: แถบข้อความของตา — "ช่องเดียว" ที่สลับเนื้อหาไปตามสถานะ
//   ปกติ        → "ทีม X กรุณาเลือกแผ่นป้ายหรือใช้ item"
//   กำลังสแกน   → "เลือกช่องที่จะสแกน…" (แทนที่ข้อความปกติ ไม่ใช่แถบใหม่ที่มาดันกระดาน)
//   ได้ผลสแกน   → "เจอระเบิด / ไม่เจอระเบิด" ในช่องเดิม ไม่มี modal ให้กดปิด
// สีขอบสื่อความหมายเดียวกับที่กระดานใช้ (เขียว neon = กำลังสแกน, แดง = เจอ, ฟ้า = ปลอดภัย)
// แยกเป็น component เพื่อให้ GameScreen ไม่บวมและเทสจับเนื้อหาแต่ละสถานะได้ตรง ๆ
export function TurnPrompt({
  teamName,
  handCount,
  cardMode,
  onBackToCards,
  scanPicking,
  scanRadius,
  onCancelScan,
  scanResult,
  onDismissScanResult,
  pendingOpens = 1,
  pickedCell = null,
  defusing = false,
}: {
  teamName: string
  handCount: number
  cardMode: boolean
  onBackToCards: () => void
  scanPicking: boolean
  scanRadius: number
  onCancelScan: () => void
  scanResult: ScanResult | null
  onDismissScanResult: () => void
  // FIX_LISTS ชุดที่สิบเอ็ด #1: >1 = ทีมนี้โดน Attack ค้างอยู่ ต้องเปิดหลายป้าย
  pendingOpens?: number
  // FIX_LISTS ชุดที่สิบสอง #1: ช่องที่เลือกค้างอยู่รอกดย้ำเพื่อเปิด (null = ยังไม่เลือก)
  pickedCell?: number | null
  // true = phase 'defusing' — modal ตัดสายเปิดทับอยู่ แถบนี้เป็นพื้นหลังที่มองทะลุลงมาเห็น
  defusing?: boolean
}) {
  const base = 'flex flex-wrap items-center gap-3 rounded-xl border-2 p-3'

  // กำลังตัดสายระเบิด — มาก่อนทุก branch เพราะจังหวะนั้นไม่มีอย่างอื่นให้ทำแล้ว
  // (ผลสแกน/ช่องที่เลือกค้าง เป็นเรื่องของช่วงก่อนหน้า ไม่ควรค้างให้อ่านทับกัน)
  if (defusing) {
    return (
      <div className={base + ' border-red-600 bg-red-600/10'} role="status">
        <span className="text-lg font-bold text-red-700 dark:text-red-300">
          💣 {teamName} กำลังตัดสายระเบิด
        </span>
      </div>
    )
  }

  // ผลสแกนมาก่อน: เป็นข้อมูลที่เพิ่งได้มา ต้องอ่านให้จบก่อนสั่งสแกนใบถัดไป
  if (scanResult !== null) {
    const found = scanResult.found
    return (
      <div
        role="status"
        className={
          base +
          (found
            ? ' border-red-500 bg-red-500/10 shadow-[0_0_18px_rgba(239,68,68,0.35)]'
            : ' border-sky-400 bg-sky-400/10 shadow-[0_0_18px_rgba(56,189,248,0.35)]')
        }
      >
        <span
          className={
            'text-lg font-bold ' +
            (found ? 'text-red-700 dark:text-red-300' : 'text-sky-700 dark:text-sky-300')
          }
        >
          {found ? '💣 มีระเบิดอยู่ใกล้ ๆ!' : '✅ ไม่มีระเบิดอยู่ใกล้ ๆ'}
        </span>
        <span className="text-sm font-semibold opacity-80">
          ตรวจช่วง {scanResult.lo}–{scanResult.hi} (รอบเลข {scanResult.center})
        </span>
        {/* กดปิดเองได้ถ้าอยากกลับไปเห็นข้อความปกติ — ไม่กดก็หายเองตอนขึ้นตาใหม่ */}
        <button
          onClick={onDismissScanResult}
          title="ปิดผลสแกน"
          aria-label="ปิดผลสแกน"
          className="ml-auto rounded-lg border-2 border-border px-2.5 py-1 text-sm font-bold hover:border-primary"
        >
          ✕
        </button>
      </div>
    )
  }

  // กำลังรอเลือกช่องสแกน: ข้อความปกติหายไป เหลือคำสั่งอันนี้อันเดียว
  if (scanPicking) {
    return (
      <div
        role="status"
        className={
          base +
          ' border-emerald-400 bg-emerald-400/10 text-lg font-bold text-emerald-700 ' +
          'shadow-[0_0_18px_rgba(34,197,94,0.35)] dark:text-emerald-300'
        }
      >
        🔍 เลือกช่องที่จะสแกน — ชี้ที่ช่องเพื่อดูขอบเขต แล้วกดหนึ่งครั้งเพื่อสแกน
        <span className="text-sm font-semibold opacity-80">(รัศมี ±{scanRadius} ช่อง)</span>
        <button
          onClick={onCancelScan}
          title="ยกเลิกการสแกน"
          aria-label="ยกเลิกการสแกน"
          className="ml-auto rounded-lg border-2 border-emerald-400 px-2.5 py-1 text-sm font-bold hover:bg-emerald-400/20"
        >
          ✕ ยกเลิก
        </button>
      </div>
    )
  }

  // FIX_LISTS ชุดที่สิบเอ็ด #1: โดน Attack อยู่ → ข้อความ "ต้องเปิดอีก N ป้าย" มาอยู่ใน
  // แถบเดียวกันนี้ (สีเหลืองเตือนแบบเดิม) ต่อท้ายด้วยคำสั่งปกติว่าให้เลือกป้าย/ใช้ item
  const attacked = pendingOpens > 1
  // FIX_LISTS ชุดที่สิบสอง #1: เลือกช่องค้างไว้ → คำสั่ง "กดช่องเดิมอีกครั้งเพื่อเปิด"
  //   มาแทนข้อความปกติในแถบเดียวกันนี้ (เดิมเป็นบรรทัดแยกใต้กระดาน)
  //   ยังคงโชว์ "ต้องเปิดอีก N ป้าย" ไว้ด้วย — ระหว่างโดน Attack ก็ยังต้องรู้ว่าเหลือกี่ป้าย
  const picking = pickedCell !== null
  return (
    <div
      className={
        base +
        (attacked
          ? ' border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100'
          : ' border-primary bg-primary/5')
      }
      role={picking ? 'status' : undefined}
    >
      {attacked && (
        <span className="text-lg font-bold">
          ⚔ {teamName} ต้องเปิดอีก {pendingOpens} ป้าย
        </span>
      )}
      {picking ? (
        <span className="text-lg font-bold">
          เลือกช่อง <span className="font-mono text-2xl font-black">{pickedCell}</span> —
          กดช่องเดิมอีกครั้งเพื่อเปิด (กดช่องอื่นเพื่อเปลี่ยน)
        </span>
      ) : (
        <span className="text-lg font-bold">
          {attacked
            ? 'กรุณาเลือกแผ่นป้ายหรือใช้ item'
            : `${teamName} กรุณาเลือกแผ่นป้ายหรือใช้ item`}
        </span>
      )}
      {/* FIX_LISTS ชุดที่สิบสอง #1: ระหว่างเลือกช่องค้างอยู่ ไม่ต้องชวนไปดูการ์ดในมือ —
          จังหวะนั้นเหลือแค่ "กดย้ำเพื่อเปิด / กดช่องอื่นเพื่อเปลี่ยน" ให้ตัดสินใจ */}
      {handCount > 0 && !picking && (
        <span className="text-sm text-muted-foreground">
          ({handCount} ใบในมือ — กดการ์ดด้านล่างเพื่อเปิดดู)
        </span>
      )}
      {!cardMode && (
        <button
          onClick={onBackToCards}
          className="ml-auto rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-bold"
        >
          🃏 กลับไปใช้การ์ด
        </button>
      )}
    </div>
  )
}

// FIX #19: ชื่อเกมอยู่หัวเว็บตอนเล่น (เดิมหน้าโล่งไปหน่อย)
// FIX #21: ปุ่มจบเกมเป็น icon ออกห้อง
// FIX_LISTS ชุดที่แปด #2: ปุ่มธีม/เต็มจอ/โหมดจอ ไม่ลอยมุมขวาบนแล้ว — มาอยู่บนแถบนี้
//   ระดับเดียวกับระดับเสียงและปุ่มออกห้อง จึงไม่ต้องเว้น pr-40/pr-52 ให้แถบลอยอีก
//   flex-wrap เผื่อจอแคบ/โหมด TV ที่ตัวอักษรโต — ปุ่มตกบรรทัดได้ ไม่ล้นออกนอกจอ
function GameHeader({ onExit, overlay }: { onExit: () => void; overlay: boolean }) {
  return (
    // หัวเว็บต้องกดได้ตลอด แม้ modal (ตัดสาย/บล็อก/โจมตี) เปิดอยู่ —
    // .game-nav ยก z-index เหนือ overlay ที่ถูกลดลงเป็น 30 แล้ว
    //
    // FIX_LISTS ชุดที่สิบห้า: data-overlay บอก CSS ว่ามี modal คลุมจออยู่ — ไม่ใช่เพื่อ
    //   ซ่อนแถบ (ปุ่มต้องกดได้ตลอด) แต่เพื่อหรี่โลโก้/ชื่อเกมที่เป็นตัวหนังสือเปล่า
    //   ให้กลมกลืนไปกับ modal ไม่ใช่ลอยเด่นอยู่บนพื้นดำ
    <header
      data-overlay={overlay ? 'on' : 'off'}
      className="game-nav mx-auto mb-4 flex w-full max-w-375 flex-wrap items-center gap-3"
    >
      <div className="game-nav-brand flex min-w-0 items-center gap-3 transition-opacity">
        <BombMark />
        <div className="min-w-0">
          <h1 className="truncate font-serif text-2xl font-bold leading-tight">Minenumber</h1>
          <p className="section-label">เลขระเบิด</p>
        </div>
      </div>
      <button
        onClick={onExit}
        title="จบเกมนี้ / ออกจากห้อง"
        aria-label="จบเกมนี้ / ออกจากห้อง"
        className={
          // FIX_LISTS ชุดใหม่ #2: แถบปุ่มมุมขวาบนมี 3 ปุ่มแล้ว (ธีม/เต็มจอ/โหมดจอ)
          // ต้องเว้นระยะให้พอ ไม่งั้นปุ่ม "ออกจากห้อง" ลอดไปอยู่ใต้แถบนั้น
          'ml-auto flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 ' +
          'text-sm font-bold text-destructive shadow transition hover:border-destructive'
        }
      >
        <ExitIcon />
        <span className="hidden sm:inline">ออกจากห้อง</span>
      </button>
      {/* FIX_LISTS ชุดใหม่ #5: ปรับระดับเสียงได้ระหว่างเล่น ไม่ต้องกลับไปหน้าตั้งค่า
          FIX_LISTS ชุดที่สี่ #4: แถบเสียงย้ายมาอยู่บรรทัดเดียวกับปุ่มออกจากห้อง (ถัดจากปุ่ม)
          แทนที่จะลอย fixed อยู่ใต้แถวปุ่มธีม — บรรทัดหัวเว็บมีที่ว่างอยู่แล้ว */}
      <VolumeControl />
      {/* FIX_LISTS ชุดที่แปด #2: สาม menu ที่เคยลอยมุมขวาบน (ธีม / เต็มจอ / โหมดจอ)
          มาต่อท้ายแถบนี้ — ระดับเดียวกับระดับเสียงและปุ่มออกห้อง
          App หยุดเรนเดอร์แถบลอยตอนอยู่หน้าเกม จึงไม่มีปุ่มซ้ำสองชุด */}
      <ThemeToggle />
      <DisplayModeToggle />
    </header>
  )
}

// icon ประตูออก (door-open + ลูกศร) — วาดเองไม่พึ่ง lib ภายนอก
function ExitIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function CurrentTeamBanner() {
  const { state, dispatch } = useGame()
  const current = state.teams[state.currentTeamIndex]
  const next = nextAliveTeam(state.teams, state.currentTeamIndex, state.direction)
  // FIX #18: กรรมการกด pause เวลาได้
  const [paused, setPaused] = useState(false)

  // ขึ้นตาใหม่ → เลิก pause อัตโนมัติ
  useEffect(() => {
    setPaused(false)
  }, [state.turnNumber, state.currentTeamIndex])

  return (
    <div
      className={
        'flex flex-wrap items-center gap-4 rounded-2xl border-2 border-primary bg-card p-4 ' +
        'shadow-[0_0_24px_color-mix(in_srgb,var(--primary)_35%,transparent)]'
      }
    >
      <div className="flex items-center gap-3">
        <span className="pulse-dot" />
        <span className="section-label">ตาปัจจุบัน</span>
      </div>
      <h2 className="font-serif text-4xl font-bold">{current.name}</h2>

      {/* FIX #30: บอกทีมถัดไป
          FIX_LISTS ชุดที่สาม #12: ป้ายทิศทางย้ายไปอยู่มุมขวาบนของ panel "ทีม" แทน
          (อยู่ติดกับลำดับทีมจริง ๆ อ่านแล้วเข้าใจทันทีว่ากำลังไล่ขึ้นหรือไล่ลง) */}
      <div className="ml-auto flex items-center gap-3 text-sm">
        {next && (
          <span className="text-muted-foreground">
            ถัดไป: <b className="text-foreground">{next.name}</b>
          </span>
        )}
        <span className="font-mono text-muted-foreground">รอบ {state.turnNumber}</span>
      </div>

      <div className="flex items-center gap-2">
        {/* FIX #18: กรรมการย้อนกลับไปทีมก่อนหน้าได้ตามที่พิจารณา
            FIX_LISTS #9: ปุ่มไปทีมถัดไปอยู่ข้างกัน — จับเป็นกลุ่มเดียว ไม่ให้ปุ่มกระจายจนรก */}
        <div className="flex overflow-hidden rounded-lg border border-border bg-background">
          <button
            onClick={() => dispatch({ type: 'UNDO_TURN' })}
            title="ย้อนกลับไปทีมก่อนหน้า (กรรมการพิจารณา)"
            aria-label="ย้อนกลับไปทีมก่อนหน้า"
            className="px-3 py-2 text-sm font-bold hover:bg-secondary"
          >
            ↩ ย้อนทีม
          </button>
          <span className="w-px self-stretch bg-border" aria-hidden="true" />
          {/* ข้ามตาให้ทีมปัจจุบัน = เสีย turn เหมือนหมดเวลา (ไม่ได้จั่วการ์ด) */}
          <button
            onClick={() => dispatch({ type: 'TIMEOUT' })}
            disabled={state.phase !== 'cards' && state.phase !== 'opening'}
            title="ข้ามไปทีมถัดไป (ทีมนี้เสีย turn)"
            aria-label="ไปทีมถัดไป"
            className="px-3 py-2 text-sm font-bold hover:bg-secondary disabled:opacity-40"
          >
            ทีมถัดไป ↪
          </button>
        </div>
        {/* FIX #18: pause เวลา — ทีมไหนเลือกไม่ทันจะเสีย turn ไม่มีการเลือกให้อัตโนมัติ
            FIX_LISTS ชุดที่แปด #3: ย้ายมาอยู่ "ติดซ้ายของวงนับถอยหลัง" (เดิมอยู่หัวกลุ่มปุ่ม
              ย้อนทีม/ทีมถัดไป) — ปุ่มที่คุมเวลาจึงอยู่ข้างตัวเลขเวลาที่มันคุมจริง ๆ */}
        {state.settings.turnSeconds > 0 && (
          <button
            onClick={() => setPaused((p) => !p)}
            title={paused ? 'เดินเวลาต่อ' : 'หยุดเวลาชั่วคราว'}
            aria-label={paused ? 'เดินเวลาต่อ' : 'หยุดเวลาชั่วคราว'}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold"
          >
            {paused ? '▶' : '⏸'}
          </button>
        )}
        <TimerCircle
          duration={state.settings.turnSeconds}
          phase={state.phase}
          paused={paused}
          // turnKey ต้องไม่ชนกันข้ามตาของทีมต่างกัน: turnNumber * 1000 + currentTeamIndex
          // ใช้ได้ตราบใดที่ maxTeams < 1000 — ถ้าใครเพิ่ม maxTeams ต้องเปลี่ยนสูตรนี้
          turnKey={state.turnNumber * 1000 + state.currentTeamIndex}
          onTimeout={() => dispatch({ type: 'TIMEOUT' })}
        />
        {/* FIX_LISTS ชุดที่สาม #13: จำนวนระเบิดที่เหลือมาอยู่ในช่องว่างข้างตัวนับถอยหลัง
            เป็นตัวเลขเดียวที่คนดูต้องรู้ตลอดเวลา — โหมด TV เอาที่เหลือออกหมด (StatusPanel) */}
        <div className="text-center">
          <p className="section-label">ระเบิดเหลือ</p>
          <p className="font-mono text-4xl font-black leading-none text-destructive">
            {state.realBombsRemaining ?? state.bombsRemaining}
          </p>
        </div>
      </div>
    </div>
  )
}

// FIX #30: หาทีมถัดไปที่ยังรอด ตามทิศทางปัจจุบัน
export function nextAliveTeam(
  teams: { id: string; name: string; alive: boolean }[],
  currentIndex: number,
  direction: 1 | -1,
): { id: string; name: string } | null {
  const len = teams.length
  let i = currentIndex
  for (let step = 1; step < len; step++) {
    i = (i + direction + len) % len
    if (teams[i].alive) return teams[i]
  }
  return null
}

function TeamList() {
  const { state } = useGame()
  const currentIdx = state.currentTeamIndex
  const isGameover = state.phase === 'gameover'
  // FIX #38: อันดับ + เหรียญ — ระหว่างเล่นเปิดแค่ทองแดง (ทีมที่ตายจนเหลือ 3 ทีม)
  // ทอง/เงินโผล่พร้อมกันตอนเกมจบ เพราะก่อนนั้นยังไม่รู้ว่าใครชนะ
  const { rankings } = computeRankings(state.teams)
  const rankOf = new Map(rankings.map((r) => [r.team.id, r.rank]))
  const down = state.direction === 1
  // FIX_LISTS ชุดที่สิบ #2: ทีมเยอะจน panel ล้น → เลื่อนให้แถวของ "ทีมที่ถึงตา" โผล่มาเอง
  //   block: 'nearest' = เลื่อนเท่าที่จำเป็น ถ้าแถวนั้นอยู่ในจออยู่แล้วก็ไม่ขยับ
  //   (ระหว่างนั้นกรรมการยังเลื่อนดูทีมอื่นได้ตามปกติ จะถูกดึงกลับก็ต่อเมื่อเปลี่ยนตา)
  const currentRowRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentIdx])
  return (
    // FIX_LISTS ชุดที่เก้า #1: หน้าจอไม่ scroll ทั้งหน้าแล้ว — ทีมเยอะ ๆ ต้องเลื่อนในกรอบตัวเอง
    //   h-max เดิมทำให้ panel ยืดทะลุจอออกไปโดยไม่มีใคร scroll ให้
    //   overflow-y-auto + min-h-0 → รายชื่อยาวก็เลื่อนอ่านได้ครบทุกทีม
    // FIX_LISTS ชุดที่สิบ #2: พื้นหลัง panel ต้องจบที่ "ทีมสุดท้าย" ไม่เผื่อที่ว่างให้ทีมที่ไม่มี
    //   grid ตัวนอกเป็น items-stretch → panel เคยถูกยืดเต็มความสูงคอลัมน์ เหลือพื้นเทา
    //   ยาวโล่งใต้ทีมสุดท้าย self-start = สูงเท่าเนื้อหาจริง
    //   max-h-full + overflow-y-auto = ถ้าทีมเยอะจนล้นค่อย scroll (ไม่ทะลุออกนอกจอ)
    // FIX_LISTS ชุดที่สิบสี่ #2: max-h-full พึ่งความสูงของ grid row ซึ่ง items-stretch
    //   ทำให้ row สูงตามคอลัมน์ที่สูงที่สุด → เกิน 10 ทีมแล้ว panel ยังยืดตามไปได้เรื่อย ๆ
    //   .mn-team-scroll ตั้งเพดานเป็น 10 แถวจริง ๆ (× scale) เกินจากนั้น scroll เมาส์
    <aside className="panel mn-team-scroll flex max-h-full min-h-0 flex-col gap-1 self-start overflow-y-auto">
      {/* FIX_LISTS ชุดที่สาม #12: ทิศทางการเดินเกมมาอยู่มุมขวาบนของ panel ทีม
          แสดงเป็นลูกศรขึ้น/ลง — ตรงกับทิศที่ตาจะไหลไปในรายชื่อด้านล่างจริง ๆ
          (ตามลำดับ = ไล่ลง ↓, ย้อนกลับ = ไล่ขึ้น ↑) */}
      <div className="mb-2 flex items-center gap-2">
        <h3 className="section-label">ทีม</h3>
        <span
          className="ml-auto flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-sm font-bold"
          title={down ? 'เล่นตามลำดับทีม (ไล่ลง)' : 'เล่นย้อนกลับ (ไล่ขึ้น)'}
          aria-label={down ? 'ทิศทางเกม: ตามลำดับ' : 'ทิศทางเกม: ย้อนกลับ'}
        >
          {/* FIX_LISTS ชุดที่สี่ #5: โชว์แค่ "ทิศ" + ลูกศร ไม่ต้องมีคำว่า ตามลำดับ/ย้อนกลับ */}
          ทิศ
          <span aria-hidden="true" className="text-base leading-none">
            {down ? '↓' : '↑'}
          </span>
        </span>
      </div>
      {state.teams.map((t, i) => {
        const medal = visibleMedal(t, state.teams.length, isGameover, rankOf.get(t.id) ?? 99)
        // ลำดับความสำคัญ: ทีมปัจจุบัน > เหรียญ > ยังรอด > ตาย
        // เหรียญต้องมาก่อน branch ตาย ไม่งั้นทีมที่ได้ทองแดงจะถูกหรี่จนมองไม่เห็น
        // ทุก branch มี border-2 (branch ที่ไม่มีเหรียญใช้ border-transparent)
        // เพื่อให้ความสูงแถวไม่ขยับตอนเหรียญโผล่ — ดู FIX #26 เรื่อง layout นิ่ง
        const rowClass =
          i === currentIdx && !isGameover
            ? 'border-primary bg-primary/10 font-bold'
            : medal !== null
              ? `${medalClass(medal)} font-bold`
              : t.alive
                ? 'border-transparent bg-background'
                : 'border-transparent opacity-40 line-through'
        return (
        <div
          key={t.id}
          ref={i === currentIdx ? currentRowRef : undefined}
          className={'flex items-center gap-2 rounded-lg border-2 px-3 py-2 ' + rowClass}
        >
          {medal !== null && (
            <span className="shrink-0 text-base" title={`อันดับ ${medal}`}>
              {MEDAL_EMOJI[medal - 1]}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-base">{t.name}</span>
          {t.glitchTurnsLeft > 0 && (
            <span
              className="rounded-full bg-purple-600 px-2 py-0.5 text-xs font-bold text-white"
              title="ติด glitch"
            >
              ⚡{t.glitchTurnsLeft}
            </span>
          )}
          {t.shieldCharges > 0 && (
            <span
              className="rounded-full bg-cyan-600 px-2 py-0.5 text-xs font-bold text-white"
              title="กาง Shield — กันระเบิดได้"
            >
              🛡{t.shieldCharges}
            </span>
          )}
          {t.pendingOpens > 1 && (
            <span
              className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white"
              title="ต้องเปิดหลายป้าย"
            >
              ⚔{t.pendingOpens}
            </span>
          )}
        </div>
        )
      })}
    </aside>
  )
}

function StatusPanel() {
  const { state } = useGame()
  // FIX_LISTS ชุดที่สาม #13: โหมด TV เอาข้อมูลรอง ๆ ออกทั้งแผง
  // (โอกาสโดนระเบิด / ช่องเหลือ / สถานะ / ระเบิดเหลือที่ย้ายไปข้างตัวนับเวลาแล้ว)
  // คนดูท้ายห้องต้องการแค่กระดาน ชื่อทีม เวลา และจำนวนระเบิด
  const tv = useDisplayMode() === 'tv'
  // FIX #28: โอกาสโดนระเบิดระหว่างเล่น = ระเบิด / ช่องที่ยังไม่เปิด
  // FIX_LISTS #16: นับเฉพาะ "ระเบิดจริง" — ระบบไม่เห็น glitch bomb จึงไม่เอามาคิดรวม
  // (snapshot เก่าไม่มี field นี้ → ตกกลับไปใช้ยอดรวมเหมือนเดิม)
  const hidden = hiddenCellCount(state)
  const realBombs = state.realBombsRemaining ?? state.bombsRemaining
  const chance = Math.round(hitChance(realBombs, hidden) * 100)
  const chanceClass =
    chance >= 50
      ? 'text-red-600 dark:text-red-400'
      : chance >= 30
        ? 'text-orange-500'
        : chance >= 15
          ? 'text-yellow-500'
          : 'text-emerald-600 dark:text-emerald-400'

  // FIX_LISTS ชุดที่สาม #13: โหมด TV — ไม่มีแผงนี้เลย (ระเบิดเหลืออยู่ข้างตัวนับเวลาแล้ว)
  if (tv) return null

  return (
    <div className="panel flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        {/* FIX_LISTS ชุดที่สาม #13: "ระเบิดเหลือ" ย้ายไปอยู่ข้างตัวนับถอยหลังแล้ว
            ที่นี่จึงเหลือข้อมูลรองที่ใช้เฉพาะโหมด Laptop */}
        <div className="text-center">
          <p className="section-label">ช่องเหลือ</p>
          <p className="font-mono text-3xl font-black">{hidden}</p>
        </div>
        <div className="text-center">
          <p className="section-label">สถานะ</p>
          <p className="text-lg font-bold">{phaseLabel(state.phase)}</p>
        </div>
      </div>

      {/* FIX #28: แถบโอกาสโดนระเบิดถ้าเปิดช่องแบบสุ่ม */}
      <div>
        <div className="mb-1 flex items-center justify-between text-sm font-bold">
          <span>โอกาสโดนระเบิด</span>
          <span className={`font-mono text-xl font-black ${chanceClass}`}>{chance}%</span>
        </div>
        <div className="range-bar">
          <div
            className={
              chance >= 50
                ? 'bg-red-600'
                : chance >= 30
                  ? 'bg-orange-500'
                  : chance >= 15
                    ? 'bg-yellow-400'
                    : 'bg-emerald-500'
            }
            style={{ width: `${Math.max(chance, 1)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

// นับช่องที่ยังไม่เปิด — ใช้ทั้งแถบสถานะ (#16) และเช็คบังคับตัดสาย (#14)
export function hiddenCellCount(state: {
  rangeMin: number
  rangeMax: number
  cells: Record<number, unknown>
}): number {
  let hidden = 0
  for (let n = state.rangeMin; n <= state.rangeMax; n++) {
    if (!(n in state.cells)) hidden++
  }
  return hidden
}

// FIX_LISTS ชุดที่สิบสี่ #2: จำนวนบรรทัด log ที่เก็บไว้แสดงใน panel (ล่าสุดอยู่บนสุด)
//   ตรงกับจำนวนแถวที่ .mn-log-scroll เปิดให้เห็นก่อนต้อง scroll
export const LOG_VISIBLE = 10

function LogPanel() {
  const { state } = useGame()
  // FIX_LISTS ชุดที่สาม #11: โหมด TV ไม่มีบันทึกใน panel ขวา — คนดูอ่านไม่ทันอยู่แล้ว
  // และพื้นที่ตรงนั้นต้องเว้นไว้ให้แผงการ์ด/แผงโจมตีที่มาทับ (ชุดที่สาม #5)
  const tv = useDisplayMode() === 'tv'
  // engine push log ต่อท้าย (เก่า→ใหม่) — ต้องตัดท้ายแล้วกลับด้าน ไม่ใช่ slice(0,10)
  // ไม่งั้นพอเกิน 10 เหตุการณ์ panel จะค้างอยู่ที่ 10 อันแรกตลอดเกม
  // FIX_LISTS ชุดที่สิบสี่ #2: เดิมเก็บ 40 รายการ แล้วหวังให้ overflow ของกรอบตัดเอง
  //   แต่ตัวแม่ (aside คอลัมน์ขวา) เป็น overflow-y-auto อยู่แล้ว → กรอบใน flex-1 ไม่เคย
  //   ถูกจำกัดความสูงจริง panel จึงยืดลงเรื่อย ๆ แล้วไปดัน StatusPanel ให้เลื่อนหลุดจอ
  //   ตัดที่ LOG_VISIBLE รายการล่าสุดพอ (เก่ากว่านั้นดูย้อนหลังได้ที่หน้า Leaderboard)
  const latest = state.log.slice(-LOG_VISIBLE).reverse()
  if (tv) return null
  return (
    <div className="panel flex min-h-0 flex-col gap-1">
      <h3 className="section-label mb-1">บันทึก</h3>
      {latest.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีเหตุการณ์</p>}
      {/* FIX_LISTS ชุดที่เก้า #1: เดิมล็อก max-h-96 (384px) ตายตัว — จอสูงก็ได้เท่านั้น
          จอเตี้ยก็ยังล้น ตอนนี้ยืดตามที่ว่างจริงที่เหลือในคอลัมน์ขวา (flex-1 + min-h-0)
          FIX_LISTS ชุดที่สิบสี่ #2: flex-1 อย่างเดียวไม่พอ — ตัวแม่ scroll ได้ ความสูง
          ที่ "เหลือ" จึงไม่มีเพดาน กรอบนี้ต้องคุมเพดานของตัวเองด้วย .mn-log-scroll
          (สูงเท่า 10 บรรทัด × scale) เกินจากนั้นหมุนเมาส์อ่านในกรอบ ไม่ยืดลงไปเรื่อย ๆ */}
      <div className="mn-log-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {latest.map((l) => (
          <p
            key={l.id}
            className={`border-b border-border py-1.5 text-sm leading-5 last:border-0 ${logClass(l.level)}`}
          >
            {/* FIX #33: timestamp ทุกบรรทัด */}
            <span className="mr-2 font-mono text-xs text-muted-foreground">{logTime(l.at)}</span>
            {l.message}
          </p>
        ))}
      </div>
    </div>
  )
}

// FIX #31/#32: สีข้อความตามระดับ — danger แดง (ตกรอบ), warn เหลือง (ต้องตัดสาย)
export function logClass(level?: string): string {
  switch (level) {
    case 'danger':
      return 'font-bold text-red-600 dark:text-red-400'
    case 'warn':
      return 'font-bold text-yellow-600 dark:text-yellow-400'
    case 'good':
      return 'font-semibold text-emerald-600 dark:text-emerald-400'
    default:
      return ''
  }
}

// FIX #33: แสดงเวลาแบบ HH:MM:SS (log เก่าที่ไม่มี at → ไม่แสดงเวลา)
export function logTime(at?: number): string {
  if (!at) return ''
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function phaseLabel(p: string): string {
  switch (p) {
    case 'cards':
      return 'ใช้การ์ด'
    case 'opening':
      return 'เปิดป้าย'
    case 'defusing':
      return 'ตัดสาย'
    case 'gameover':
      return 'จบเกม'
    default:
      return p
  }
}
