
import { useEffect, useRef, useState } from 'react'
import { useGame } from '@/components/game/GameProvider'
import { sfx } from '@/lib/audio/sfx'
import {
  CARD_ART,
  CARD_BACK,
  CARD_COLORS,
  CARD_DESCRIPTIONS,
  CARD_META,
  cardNeedsCellTarget,
  cardNeedsTeamTarget,
} from '@/lib/game/cards'
import type { DisplayMode } from '@/lib/display'
import type { CardType } from '@/lib/game/types'
import { useDisplayMode } from '@/lib/useDisplayMode'

interface HandProps {
  // ล็อกการ์ด — ผู้เล่นเลือก "เปิดป้ายเลย" ในตานี้ (ยังจั่ว/เห็นมือได้ แต่ใช้ไม่ได้)
  locked?: boolean
  // FIX_LISTS ชุดที่เจ็ด #2: การ์ดที่เลือกช่องบนกระดาน (Scan) ไม่มีช่องกรอกเลขแล้ว
  //   กด ✓ → การ์ดหายจากจอ → ไปเลือกช่องบนกระดานเอง
  //   Hand กับ Board เป็นพี่น้องกันใต้ GameScreen จึงคุยกันตรง ๆ ไม่ได้
  //   ต้องยกโหมดเลือกช่องขึ้นไปไว้ที่ GameScreen แล้วส่ง callback ลงมา
  //   index = ตำแหน่งใบในมือ (engine ต้องใช้ตอน PLAY_CARD)
  onPickCell?: (card: CardType, index: number) => void
}

// B7: ย่อขนาดการ์ดเมื่อใบเยอะ ก่อนจะปล่อยให้ scroll แนวนอน
// แยกเป็น pure function ที่ export เพื่อให้ threshold มีเทสคุม (เหมือน cellSizeFor ของ Board)
// FIX_LISTS ชุดที่สาม #9: ช่องการ์ดเดิม (64/48/36px) แคบเกินจนดูไม่ออกว่าเป็นการ์ด
// ขยายทุกขั้นขึ้น (88/68/52px) — ยังคุมด้วย scroll แนวนอนเหมือนเดิมเมื่อใบเยอะจริง ๆ
// FIX_LISTS ชุดที่ห้า #3: โหมด TV ทุกอย่างรอบ ๆ การ์ดโตขึ้น 1.5 เท่า (padding/หัวแถบ/ปุ่ม)
// แต่ความกว้างการ์ดเป็น px ดิบ จึงเท่าเดิม → แถบการ์ดในมือรวมสูงเกินจนเบียด header
// จึงหดการ์ดลงเฉพาะโหมด TV ให้เล็กลงเชิงสัมพัทธ์กับตัวหนังสือรอบข้าง
//
// FIX_LISTS ชุดที่หก #1: icon การ์ดในมือยังเล็กไปทั้งสองโหมด — ขยายทั้งกระดาน
//   laptop 88/68/52 → 124/96/74 (ราว 1.4 เท่า)
//   TV ตัวคูณ 0.75 → 0.85 เพื่อให้โตขึ้นด้วย แต่ยังเล็กกว่า laptop เชิงสัมพัทธ์
//   (แถบมือหุบเก็บได้อยู่แล้ว และ scroll แนวนอนคุมกรณีใบเยอะ)
//
// FIX_LISTS ชุดที่เจ็ด #1: ขอใหญ่กว่าเดิมอีก 50% — 124/96/74 → 186/144/111
//   คูณ 1.5 ทุกขั้นตรง ๆ (ทั้งสองโหมด เพราะตัวคูณ TV 0.85 อยู่นอกวงเล็บ)
//   แถบมือจึงสูงขึ้นตาม → GameScreen ต้องเพิ่ม padding ล่างให้กระดานด้วย
// เลข mode เป็น optional — เรียกแบบเดิม (arg เดียว) ได้ขนาดของโหมด laptop
export function cardWidthFor(count: number, mode: DisplayMode = 'laptop'): number {
  const base = count > 20 ? 111 : count > 12 ? 144 : 186
  return mode === 'tv' ? Math.round(base * 0.85) : base
}

// FIX #43: Block หงายหน้าอยู่แล้ว + เก็บไว้ในมือได้ (ไม่ถูกบังคับใช้/ทิ้ง)
// การ์ดอื่นเปิดดูแล้ว "เห็นข้อมูลลับ" (เช่น Scan รู้ผลก่อนตัดสินใจ) จึงต้องบังคับตัดสินใจ
// แต่ Block เป็นการ์ดตั้งรับ หงายอยู่แล้วไม่มีอะไรรั่ว → ปิดกลับได้
export function isFaceUpCard(card: CardType): boolean {
  return card === 'block'
}

// การ์ดที่เปิดดูแล้วเก็บกลับเข้ามือได้ — คู่กับ isFaceUpCard โดยเจตนา
// (หงายอยู่แล้ว = ไม่มีข้อมูลลับให้รั่ว = ไม่ต้องบังคับตัดสินใจ)
export function canKeepInHand(card: CardType): boolean {
  return isFaceUpCard(card)
}

// W5.3: ไพ่ในมือคว่ำหน้าทั้งหมด — กดเปิดทีละใบ (revealed) แล้วตัดสินใจ ใช้/ทิ้ง
// เปิดแล้วปิดกลับไม่ได้ และระหว่างเปิดใบหนึ่งอยู่ห้ามเปิดใบอื่นซ้อน
// ยกเว้นการ์ดที่ isFaceUpCard (Block) — หงายตลอด กดแล้วเก็บกลับได้
//
// FIX_LISTS ชุดที่สาม #5: ใบที่เปิดอยู่ย้ายไปแสดงที่แผงมุมขวา (ทับ panel ขวา)
//   แบบเดียวกับ phase บล็อกการโจมตี (AttackPrompt) แทนแถบลอยกลางล่างจอเดิม
//   - ชี้ (hover) ที่การ์ด → popup อธิบาย effect
//   - ปุ่มเลือกเป็น icon กลม ๆ วางคร่อมขอบล่างของการ์ด (ใช้ / ทิ้ง / เก็บไว้ก่อน)
export function Hand({ locked = false, onPickCell }: HandProps) {
  const { state, dispatch } = useGame()
  // FIX_LISTS ชุดที่ห้า #3: ขนาดการ์ดในแถบมือขึ้นกับโหมดจอด้วย (ไม่ใช่แค่จำนวนใบ)
  const displayMode = useDisplayMode()
  const [revealed, setRevealed] = useState<number | null>(null)
  // FIX #20: การ์ดเยอะ ๆ จะรกจอ — หุบเก็บได้
  const [collapsed, setCollapsed] = useState(false)

  // FIX_LISTS: แถบการ์ด (fixed) ทับกระดานอยู่ — กระดานต้องเผื่อที่ว่างด้านล่างเท่าความสูงจริง
  //   เดิมกระดานใช้ pb-84 (336px คงที่) ซึ่งผิดสองทาง:
  //     - เผื่อไว้เสมอแม้กระดานสั้น → เนื้อหาสูงเกินกรอบ เกิด scrollbar ทั้งที่ป้ายยังไม่ล้น
  //     - โหมด TV แถบนี้โตตาม --mn-scale (~500px) แต่ 336px เท่าเดิม → เผื่อไม่พอ
  //   วัดความสูงจริงแล้วประกาศเป็น --mn-hand-h ให้ Board เอาไปใช้
  //   (Hand กับ Board เป็นพี่น้องกัน ส่ง prop หากันไม่ได้ — ใช้ CSS var บน <html>
  //    แบบเดียวกับที่ทำกับ --mn-scale)
  const dockRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = dockRef.current
    const root = globalThis.document?.documentElement
    if (!el || !root) return
    const write = () => {
      root.style.setProperty('--mn-hand-h', `${Math.ceil(el.getBoundingClientRect().height)}px`)
    }
    write()
    if (typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(write)
    obs.observe(el)
    return () => {
      obs.disconnect()
      root.style.removeProperty('--mn-hand-h')
    }
  }, [])
  // FIX_LISTS ชุดที่สาม #5: ชี้ค้างที่การ์ดในแผง → โชว์คำอธิบาย effect
  const [hovering, setHovering] = useState(false)
  // FIX_LISTS ชุดที่หก #6: การ์ดที่ต้องเลือกเป้าหมาย (Attack/Scan) แยกเป็น 2 จังหวะ
  //   จังหวะ 1 = กด ✓ ยืนยันว่าจะใช้การ์ดใบนี้  จังหวะ 2 = เลือกเป้าหมาย
  //   ก่อนหน้านี้แผงเลือกเป้าหมายโผล่ใต้การ์ดทันทีตั้งแต่เปิดการ์ด และปุ่ม ✓ ไม่ขึ้นเลย
  //   ทำให้ "ทิ้ง" กับ "เลือกทีม" อยู่คนละที่จนดูเหมือนใช้การ์ดไปแล้ว
  const [picking, setPicking] = useState(false)

  const current = state.teams[state.currentTeamIndex]
  // FIX_LISTS ชุดที่สิบสี่ #6: ห้ามเลือก/หยิบการ์ดในมือระหว่างจังหวะที่มี modal คุมอยู่
  //   - 'defusing'  = กำลังตัดสาย (ต้องเลือกสายแดง/น้ำเงิน ไม่ใช่มาพลิกการ์ด)
  //   - 'blocking'  = กำลังถูกถามว่าจะใช้ Block กันไหม (ตอบผ่านปุ่มใน BlockPrompt เท่านั้น)
  //   - 'defending' = กำลังเลือกการ์ดที่จะกันการโจมตี (ตอบผ่าน AttackPrompt)
  //   phase เหล่านี้เล่นการ์ดไม่ได้อยู่แล้ว (canPlay ผูกกับ 'cards') แต่ "การ์ดยังกดพลิกได้"
  //   ซึ่งทำให้แผงการ์ดเด้งมาทับ modal และผู้เล่นเข้าใจผิดว่ายังใช้การ์ดได้อยู่
  //   ยกเว้น Skip ตอน 'defending' ที่กติกาอนุญาต (engine: FIX_LISTS ชุดที่สิบสาม #2) —
  //   ทางนั้นมีปุ่มของตัวเองใน AttackPrompt อยู่แล้ว ไม่ต้องพลิกการ์ดจากมือ
  const modalPhase =
    state.phase === 'defusing' || state.phase === 'blocking' || state.phase === 'defending'
  const canPlay = state.phase === 'cards' && !locked && !state.currentGlitched && !state.currentBlocked
  const maxHand = state.settings.maxHandSize
  const handLimited = maxHand > 0
  const handFull = handLimited && current.hand.length >= maxHand

  // ขึ้นตาใหม่ → ปิดการ์ดที่เปิดค้างไว้
  useEffect(() => {
    setRevealed(null)
    setCollapsed(false)
    setHovering(false)
    setPicking(false)
  }, [state.turnNumber, state.currentTeamIndex])

  // FIX_LISTS ชุดที่สิบสี่ #6: เข้าจังหวะที่มี modal (ตัดสาย/กัน Block/กันโจมตี) →
  //   พับการ์ดที่เปิดค้างไว้ทิ้ง ตัว effect ด้านบน depend แค่ตา/ทีม ซึ่ง "ไม่เปลี่ยน"
  //   ตอน phase ขยับจาก 'cards' ไป 'defusing' ในตาเดียวกัน — การ์ดที่พลิกไว้ก่อนกดช่อง
  //   จึงค้างเปิดอยู่แล้วลอยทับ modal ตัดสาย
  useEffect(() => {
    if (!modalPhase) return
    setRevealed(null)
    setHovering(false)
    setPicking(false)
  }, [modalPhase])

  if (!state.settings.cardsEnabled || state.phase === 'gameover') return null

  const revealedCard = revealed !== null ? current.hand[revealed] : null

  function playRevealed(extra?: { targetTeamId?: string; targetCell?: number }) {
    if (revealedCard === null) return
    dispatch({ type: 'PLAY_CARD', card: revealedCard, index: revealed!, ...extra })
    setRevealed(null)
    setHovering(false)
    setPicking(false)
  }

  function discardRevealed() {
    if (revealed === null) return
    dispatch({ type: 'DISCARD_CARD', index: revealed })
    setRevealed(null)
    setHovering(false)
    setPicking(false)
  }

  function onCardClick(i: number) {
    // FIX_LISTS ชุดที่สิบสี่ #6: ระหว่างตัดสาย/เลือกการ์ดกัน — กดไม่ติดเลย (ไม่พลิกการ์ด)
    //   เสียง itemUnavailable ยังดังให้รู้ว่า "ตอนนี้ยังไม่ใช่จังหวะ" ไม่ใช่กดไม่โดน
    if (modalPhase) {
      sfx.itemUnavailable()
      return
    }
    if (!canPlay) {
      sfx.itemUnavailable()
      return
    }
    if (revealed !== null) return // กันเปิดซ้อนระหว่างเปิดใบหนึ่งอยู่
    sfx.selectItem()
    setRevealed(i)
    setPicking(false)
  }

  const needsTeam = revealedCard !== null && cardNeedsTeamTarget(revealedCard)
  const needsCell = revealedCard !== null && cardNeedsCellTarget(revealedCard)
  // Block เล่นตรง ๆ ไม่ได้ — ต้องรอถูกถามตอนทีมอื่นใช้ effect ใส่เรา
  // FIX_LISTS ชุดที่หก #6: การ์ดที่ต้องเลือกเป้าหมายก็มีปุ่ม ✓ ด้วย (กดแล้วค่อยเปิด modal เลือก)
  //   ต่างจากเดิมที่ !needsTeam && !needsCell ตัดปุ่ม ✓ ทิ้งไปเลย
  // FIX_LISTS ชุดที่สิบห้า #2: เข้ารอบบังคับตัดสายแล้ว Shield เป็นโมฆะทั้งวง กางใหม่ไม่ได้
  //   (engine ปฏิเสธ PLAY_CARD อยู่แล้ว — ตรงนี้ตัดปุ่ม ✓ ทิ้งเพื่อไม่ให้กดแล้วเงียบ)
  const shieldVoided = state.forcedWireCut === true && revealedCard === 'shield'
  const playable = revealedCard !== null && revealedCard !== 'block' && !shieldVoided
  // กด ✓ แล้ว: การ์ดที่เลือก "ทีม" → เปิด modal ข้างการ์ดเหมือนเดิม
  //   การ์ดที่เลือก "ช่องบนกระดาน" (Scan) → ยกให้ GameScreen คุม (ชุดที่เจ็ด #2)
  //   การ์ดอื่น → ใช้เลย
  const needsTarget = needsTeam || needsCell
  function onConfirm() {
    // FIX_LISTS ชุดที่เจ็ด #2: Scan — การ์ดหายไปจากจอทันทีที่กด ✓ แล้วไปเลือกช่องบนกระดาน
    //   ยังไม่ dispatch PLAY_CARD ตรงนี้ (การ์ดยังอยู่ในมือ) — GameScreen จะเล่นให้
    //   ตอนผู้เล่นคลิกช่องจริง หรือคืนสภาพเดิมถ้ากดยกเลิก
    if (needsCell && onPickCell && revealedCard !== null) {
      onPickCell(revealedCard, revealed!)
      setRevealed(null)
      setHovering(false)
      setPicking(false)
      return
    }
    if (needsTarget) {
      setPicking(true)
      return
    }
    playRevealed()
  }

  const handCount = current.hand.length
  const cardWidth = cardWidthFor(handCount, displayMode)

  return (
    <>
      {/* FIX_LISTS ชุดที่สาม #5: ใบที่เปิดอยู่ — แผงมุมขวา ทับ panel ขวา
          z-20: อยู่เหนือ panel ขวา แต่ต่ำกว่า modal เต็มจอ (ตอนนี้ z-30) และต่ำกว่า
          หัวเว็บ (.game-nav z-60) ที่ต้องกดได้ตลอดแม้มี modal เปิด */}
      {revealedCard && (
        <div
          className={
            // FIX_LISTS ชุดที่สี่ #1: ใบที่เปิดอยู่ = ภาพการ์ดล้วน ไม่มีกรอบ/พื้นหลังแผง
            //   วางกลางจอแนวตั้ง ชิดขอบขวา และกว้างเท่า panel ขวา (18.75rem)
            //   -translate-y-1/2 คู่กับ top-1/2 = กึ่งกลางจริงโดยไม่ต้องรู้ความสูงการ์ด
            //
            // FIX_LISTS ชุดที่ห้า #2: โหมด TV (--mn-scale 1.5) ทำให้ 18.75rem = 450px
            //   การ์ดสูงตามอัตราส่วน = ~646px + ปุ่ม → ล้นขึ้นไปทับปุ่มธีม/TV มุมขวาบน
            //   และทับวงจับเวลา/ตัวนับระเบิดของ header
            //   คุมด้วย max-w ที่คิดจาก "ความสูงที่ว่างจริง" แทนการล็อกความกว้างอย่างเดียว:
            //     สูงได้ = 100vh - 5.5rem (แถวปุ่มมุมขวาบน) - 7rem (แถบการ์ดในมือ+ปุ่ม)
            //     กว้าง = สูง / 1.435 (อัตราส่วนภาพการ์ด 1288x1848)
            //   min() กับ 18.75rem เดิม → จอสูงพอก็ได้ขนาดเดิมเป๊ะ ไม่มีอะไรเปลี่ยน
            // FIX_LISTS ชุดที่เจ็ด #5: การ์ดเคยล้นออกมาทับคอลัมน์กระดานจนกดช่องริมขวาไม่ได้
            //   ต้นเหตุ: ความกว้างล็อกไว้ที่ 18.75rem (เท่าคอลัมน์ขวาของโหมด Laptop)
            //   แต่โหมด TV คอลัมน์ขวาแคบลงเป็น 13rem (ชุดที่สาม #11) การ์ดจึงกินเข้ามา
            //   ในคอลัมน์กลาง 22–92px = ทับช่องริมขวาทั้งแถว
            //   แก้โดยผูกความกว้างกับ --mn-card-col ที่ GameScreen ประกาศให้ตรงกับ
            //   คอลัมน์ขวาจริงของแต่ละโหมด — การ์ดจึงพอดีคอลัมน์เสมอ ไม่ล้นเข้ากระดาน
            // FIX_LISTS ชุดที่เก้า #2: การ์ดที่เปิดดูต้อง "ไม่คร่อม" ป้ายแถวขวาสุดของกระดาน
            //   เดิมกว้างเท่าคอลัมน์ขวาเป๊ะ ๆ (--mn-card-col) แล้วเงา/ปุ่มที่คร่อมขอบล่าง
            //   ยังล้นออกนอกความกว้างนั้นอีก จึงกินเข้ามาทับช่องริมขวา
            //   หด 0.75 เท่าของคอลัมน์ขวา แล้วชิดขวาเท่าเดิม → เหลือช่องว่างระหว่าง
            //   การ์ดกับกระดานเสมอ ไม่ว่าจะโหมด Laptop หรือ TV
            'fixed right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-3 overflow-visible ' +
            'w-[min(calc(var(--mn-card-col,18.75rem)*0.75),calc(100vw-1.5rem),calc((100vh-12.5rem)/1.435))]'
          }
          role="dialog"
          aria-modal="false"
          aria-label={`การ์ด ${CARD_META[revealedCard].name} — เลือกว่าจะใช้หรือไม่`}
        >
          {/* การ์ด + ปุ่ม icon คร่อมขอบล่าง + popup คำอธิบายตอนชี้ */}
          {/* FIX_LISTS ชุดที่แปด #4: ปุ่มใช้/ทิ้ง/เก็บ "คร่อมขอบล่างการ์ดครึ่งปุ่ม"
              ปุ่มสูง 48px (h-12) → ต้องเผื่อที่ใต้ภาพการ์ดครึ่งปุ่ม = 24px (pb-6)
              แล้ววางแถวปุ่มให้จุดกึ่งกลางตรงกับขอบล่างภาพเป๊ะ ๆ (ดู bottom-6 ด้านล่าง) */}
          <div className="relative pb-6">
            <div
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
              onFocus={() => setHovering(true)}
              onBlur={() => setHovering(false)}
              tabIndex={0}
              // FIX_LISTS ชุดที่เก้า #1: เอา "กรอบใส" รอบการ์ดที่เปิดดูออก
              //   rounded-xl + ring ที่ wrapper วาดกรอบซ้อนอีกชั้นนอกภาพการ์ด เห็นเป็นขอบจาง ๆ
              //   ไม่ตรงมุมโค้งของภาพ — เหลือแค่ภาพการ์ดล้วนตามที่ตั้งใจไว้แต่แรก (ชุดที่สี่ #1)
              //   ยังต้องโฟกัสด้วยคีย์บอร์ดได้ จึงคง tabIndex ไว้และย้าย ring ไปที่ภาพ
              //   (ring ตามมุมโค้งของภาพพอดี และโผล่เฉพาะตอน tab มาถึงเท่านั้น)
              className="group outline-none"
            >
              {/* FIX_LISTS ชุดที่สี่ #1: ภาพการ์ดกว้างเต็มแผง (เท่า panel ขวา) แทนล็อกสูง 11rem
                  FIX_LISTS ชุดที่เก้า #1: ไม่มี shadow-2xl แล้ว — เงาฟุ้งรอบใบอ่านเป็น
                  "กรอบใส" รอบการ์ดเวลาทับ panel ขวา */}
              <img
                src={CARD_ART[revealedCard]}
                alt={CARD_META[revealedCard].name}
                className={
                  'mx-auto h-auto w-full rounded-lg ' +
                  'group-focus-visible:ring-2 group-focus-visible:ring-primary'
                }
                draggable={false}
              />
            </div>

            {/* FIX_LISTS ชุดที่สาม #5: ปุ่ม icon ทับครึ่งล่างของการ์ด — ไม่ต้องเลื่อนหาปุ่ม
                ปุ่มเป้าหมาย (ทีม/เลขช่อง) ยังต้องเลือกก่อน จึงไม่โชว์ปุ่ม "ใช้" ในเคสนั้น
                FIX_LISTS ชุดที่แปด #4: คร่อมขอบล่างภาพครึ่งปุ่มพอดี
                  bottom-6 (24px) = ความสูงของแถบ pb-6 ที่เผื่อไว้ → ขอบล่างของปุ่มไปจบที่
                  ขอบล่างของ wrapper และ translate-y-1/2 เลื่อนลงครึ่งปุ่ม (24px)
                  ผลลัพธ์: ครึ่งบนของปุ่มทับภาพการ์ด ครึ่งล่างพ้นออกมาใต้ภาพ */}
            <div
              className={
                'absolute inset-x-0 bottom-6 flex translate-y-1/2 items-center ' +
                'justify-center gap-2'
              }
            >
              {playable && (
                <button
                  onClick={onConfirm}
                  title={`ใช้ ${CARD_META[revealedCard].name}`}
                  aria-label={`ใช้ ${CARD_META[revealedCard].name}`}
                  className={
                    'grid h-12 w-12 place-items-center rounded-full border-2 border-white/70 ' +
                    'bg-(--confirm) text-2xl text-white shadow-lg transition hover:scale-110'
                  }
                >
                  ✓
                </button>
              )}
              {/* FIX #43: การ์ดที่หงายอยู่แล้ว (Block) เก็บกลับเข้ามือได้ ไม่ถูกบังคับใช้/ทิ้ง
                  FIX_LISTS ชุดที่สิบห้า #2: Shield ที่เป็นโมฆะก็เก็บกลับได้เหมือนกัน —
                  ใช้ไม่ได้แล้วจะบังคับให้ทิ้งอย่างเดียวไม่แฟร์ (ไม่ใช่ความผิดของคนถือ) */}
              {(canKeepInHand(revealedCard) || shieldVoided) && (
                <button
                  onClick={() => {
                    setRevealed(null)
                    setHovering(false)
                  }}
                  title="เก็บไว้ก่อน (คืนเข้ามือ)"
                  aria-label="เก็บไว้ก่อน"
                  className={
                    'grid h-12 w-12 place-items-center rounded-full border-2 border-border ' +
                    'bg-card text-2xl shadow-lg transition hover:scale-110'
                  }
                >
                  ↩
                </button>
              )}
              {/* FIX_LISTS ชุดที่สี่ #3: ถังขยะเป็น logo ขาว-ดำสลับตามธีม
                  (โหมดมืด = icon ขาวพื้นดำ, โหมดสว่าง = icon ดำพื้นขาว)
                  ต้องเป็น SVG ที่รับสีจาก currentColor — emoji 🗑 บังคับสีของมันเองไม่ได้ */}
              <button
                onClick={discardRevealed}
                title="ทิ้งการ์ดใบนี้"
                aria-label="ทิ้งการ์ดใบนี้"
                className={
                  'grid h-12 w-12 place-items-center rounded-full border-2 border-black ' +
                  'bg-white text-black shadow-lg transition hover:scale-110 ' +
                  'dark:border-white dark:bg-black dark:text-white'
                }
              >
                <TrashIcon />
              </button>
            </div>

            {/* popup คำอธิบาย effect — เยื้องไปทางซ้ายของแผง ไม่ให้ล้นขอบจอขวา */}
            {hovering && (
              <div
                role="tooltip"
                className={
                  'pointer-events-none absolute right-full top-0 z-50 mr-3 w-72 rounded-xl ' +
                  'border-2 border-border bg-card p-3 text-left text-foreground shadow-2xl'
                }
              >
                <p className="mb-1 font-bold">
                  {CARD_META[revealedCard].emoji} {CARD_META[revealedCard].name} —{' '}
                  {CARD_META[revealedCard].th}
                </p>
                <p className="text-sm leading-5 text-muted-foreground">
                  {CARD_DESCRIPTIONS[revealedCard]}
                </p>
                {/* FIX_LISTS ชุดที่สิบห้า #2: บอกเหตุผลที่ปุ่ม ✓ หายไป ไม่ใช่ปล่อยให้งง */}
                {shieldVoided && (
                  <p className="mt-2 text-sm font-bold leading-5 text-amber-600 dark:text-amber-400">
                    เข้ารอบบังคับตัดสายแล้ว — Shield เป็นโมฆะ กางใหม่ไม่ได้
                  </p>
                )}
              </div>
            )}
            {/* FIX_LISTS ชุดที่หก #6: เป้าหมาย (ทีมของ Attack / เลขช่องของ Scan) เป็น modal
                ที่โผล่ "กลางซ้ายของการ์ด" หลังกด ✓ แล้วเท่านั้น — ไม่ใช่แผงใต้การ์ดที่ขึ้นมาเอง
                right-full + mr-3 = เกาะขอบซ้ายของการ์ด, top-1/2 + -translate-y-1/2 = กึ่งกลางแนวตั้ง
                (ทิศเดียวกับ popup ตอน hover จึงไม่ล้นขอบจอขวา)
                ยกเลิกได้ด้วยปุ่ม ✕ / Esc — กลับไปจังหวะเดิมที่ยังเลือก ใช้/ทิ้ง ได้อยู่ */}
            {picking && needsTeam && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="เลือกทีมเป้าหมาย"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setPicking(false)
                }}
                className={
                  'absolute right-full top-1/2 z-50 mr-3 flex w-64 -translate-y-1/2 flex-col gap-2 ' +
                  'rounded-xl border-2 border-border bg-card p-3 shadow-2xl'
                }
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold">เลือกทีมเป้าหมาย</p>
                  <button
                    onClick={() => setPicking(false)}
                    title="ยกเลิก"
                    aria-label="ยกเลิกการเลือกเป้าหมาย"
                    className="ml-auto rounded-md border border-border px-1.5 text-sm font-bold hover:border-primary"
                  >
                    ✕
                  </button>
                </div>

                {/* FIX_LISTS ชุดที่เจ็ด #2: เหลือแต่ปุ่มเลือกทีม — ช่องกรอกเลขของ Scan
                    ถูกแทนด้วยการคลิกช่องบนกระดานตรง ๆ แล้ว */}
                <div className="flex flex-wrap gap-2">
                  {state.teams
                    // FIX #23: Attack ใช้กับทีมตัวเองไม่ได้ — ไม่ต้องโชว์ปุ่มทีมตัวเอง
                    .filter((t) => t.alive && t.id !== current.id)
                    .map((t) => (
                      <button
                        key={t.id}
                        onClick={() => playRevealed({ targetTeamId: t.id })}
                        className="rounded-lg border-2 border-border bg-background px-3 py-2 text-base font-bold hover:border-primary"
                      >
                        {t.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* FIX_LISTS ชุดที่หก #3: ไม่มีอะไรต่อท้ายใต้การ์ดแล้ว — คำอธิบายอยู่ใน popup ตอน hover
              และแผงเลือกเป้าหมายย้ายไปเป็น modal กลางซ้ายของการ์ด (ชุดที่หก #6) */}
        </div>
      )}

      {/* FIX #20: ที่เก็บการ์ด — มีหัวแถบบอกจำนวน + ปุ่มหุบ กันรกจอตอนการ์ดเยอะ
          การ์ดย่อลงตามจำนวนใบ (B7) แล้วถ้ายังไม่พอก็ scroll แนวนอน (แถวเดียวเสมอ)

          FIX_LISTS ชุดที่หก #4/#5: แถบนี้เป็นแค่ "ที่วางการ์ด" ไม่ใช่แผงข้อมูล
            - โปร่งใส: ไม่มีพื้นหลัง/เงา/เส้นขอบบนเต็มความกว้างจออีกแล้ว (.hand-dock)
            - ไม่กว้างเต็มจอ: w-fit + max-w-full → กว้างเท่าการ์ดที่มีจริง
              (มือว่าง/ใบเดียวก็ไม่ลากเส้นพาดทั้งจอ) แล้วค่อยตันที่ขอบจอเมื่อใบเยอะ */}
      {/* z-20 (เดิม z-30): เท่ากับ modal เต็มจอพอดี = ใครทับใครขึ้นอยู่กับลำดับใน DOM
          ซึ่งเปราะเกินไป — กดให้ต่ำกว่าชั้น modal ชัด ๆ แถบการ์ดจึงถูกทับตอนมี modal เปิด */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2">
        <div
          ref={dockRef}
          className="hand-dock pointer-events-auto relative w-fit max-w-full rounded-t-2xl px-3 pt-2 pb-1"
        >
          <div className="flex w-full items-center gap-3 pb-1 pr-9">
            <span className="section-label">🃏 การ์ดในมือ</span>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-sm font-black">
              {handCount}
            </span>
            {handLimited && <span className="text-xs text-muted-foreground">/ {maxHand} ใบ</span>}
            {handFull && (
              <span
                className={
                  'rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 ' +
                  'dark:bg-amber-900/50 dark:text-amber-100'
                }
              >
                มือเต็ม — จั่วไม่เข้าแล้ว
              </span>
            )}
          </div>

          {/* FIX_LISTS ชุดที่หก #5: ปุ่มหุบ/กาง = ปุ่ม minimize มุมขวาบนของขอบแถบ
              (absolute เกาะมุมกรอบ ไม่ใช่ปุ่มยาว ๆ ในแถวหัวข้อ) — เครื่องหมายเดียวกับ
              หน้าต่างทั่วไป: – = ย่อเก็บ, ▢ = กางคืน */}
          {handCount > 0 && (
            <button
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? `กางการ์ด (${handCount})` : 'ย่อเก็บการ์ด'}
              aria-label={collapsed ? `กางการ์ด (${handCount})` : 'ย่อเก็บการ์ด'}
              aria-expanded={!collapsed}
              className={
                'absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md border ' +
                'border-border bg-background/70 text-sm font-black leading-none ' +
                'transition hover:border-primary hover:bg-background'
              }
            >
              {collapsed ? '▢' : '–'}
            </button>
          )}

          {!collapsed && (
            // FIX_LISTS ชุดที่หก #2: ไม่ต้องเผื่อที่ให้ outline ของใบที่เลือกแล้ว
            // (เอา .card-picked ออก) เหลือ padding บาง ๆ กันเงา/ขอบการ์ดติดกรอบ scroll
            <div className="hand-scroll max-w-full overflow-x-auto px-1 py-1.5">
              <div className="mx-auto flex w-max gap-2">
                {current.hand.map((card, i) => {
                  // FIX #43: Block หงายหน้า — โชว์ภาพการ์ดจริง + สีของการ์ด
                  // การ์ดอื่นยังคว่ำ (🂠) ไม่รั่วข้อมูล
                  // FIX_LISTS ชุดที่สาม #10: ไม่มีตัวหนังสือ/เลขใบใต้การ์ดแล้ว — เหลือแค่ icon
                  const faceUp = isFaceUpCard(card)
                  const isPicked = revealed === i
                  return (
                    <button
                      key={i}
                      onClick={() => onCardClick(i)}
                      aria-disabled={!canPlay}
                      aria-pressed={isPicked}
                      aria-label={faceUp ? CARD_META[card].name : `การ์ดใบที่ ${i + 1}`}
                      title={
                        faceUp
                          ? `${CARD_META[card].name} — ${CARD_DESCRIPTIONS[card]}`
                          : `ใบที่ ${i + 1} — กดเพื่อเปิดดู`
                      }
                      style={{ width: cardWidth }}
                      className={
                        // FIX_LISTS ชุดที่สี่ #2: ไม่มี padding ในช่องการ์ดแล้ว — icon/ภาพ
                        // ต้องเต็มกรอบ (เดิม p-2 + ขนาด icon คงที่ ทำให้เหลือขอบว่างรอบด้าน)
                        // FIX_LISTS ชุดที่หก #2: ไม่มีขอบใส ๆ (outline .card-picked) รอบใบที่เลือก
                        //   ใบที่เปิดอยู่ไปโชว์เต็มใบที่แผงขวาอยู่แล้ว จึงไม่ต้อง mark ซ้ำในแถบมือ
                        //   aria-pressed ยังบอกสถานะให้ screen reader เหมือนเดิม
                        `grid shrink-0 place-items-center overflow-hidden rounded-xl border-2 transition ` +
                        (faceUp
                          ? `${CARD_COLORS[card]} `
                          : `border-border bg-secondary text-secondary-foreground `) +
                        `${canPlay ? 'cursor-pointer hover:border-primary' : 'cursor-not-allowed opacity-40'}`
                      }
                    >
                      {/* FIX_LISTS ชุดที่ห้า #1: ทั้งใบหงายและใบคว่ำเป็น <img> เหมือนกัน
                          ใบคว่ำเดิมเป็น emoji ที่มีขอบว่างในตัว จึงไม่มีทางเต็มกรอบ
                          block กัน baseline gap ของ inline image (ขอบล่างเหลือเส้นบาง ๆ) */}
                      <img
                        src={faceUp ? CARD_ART[card] : CARD_BACK}
                        alt=""
                        aria-hidden="true"
                        className="block h-auto w-full"
                      />
                    </button>
                  )
                })}
                {current.hand.length === 0 && (
                  <p className="py-2 text-sm text-muted-foreground">ไม่มีการ์ดในมือ</p>
                )}
              </div>
            </div>
          )}
        </div>

        {!canPlay && state.phase === 'cards' && (
          <p className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-muted-foreground">
            {state.currentGlitched
              ? 'ติด glitch — ใช้การ์ดไม่ได้ตานี้'
              : state.currentBlocked
                ? 'โดน Block — ใช้การ์ดไม่ได้ตานี้'
                : 'เข้าช่วงเปิดป้ายแล้ว'}
          </p>
        )}

        {/* FIX_LISTS ชุดที่สิบสี่ #6: บอกให้ชัดว่าทำไมกดการ์ดไม่ได้ตอนนี้ ไม่ใช่ปล่อยให้
            กดแล้วเงียบ (การ์ดหรี่ + เสียง itemUnavailable อย่างเดียวอ่านเหมือนปุ่มเสีย)
            ต้องตอบผ่านปุ่มใน modal ที่เด้งอยู่ตรงหน้าแทน */}
        {modalPhase && (
          <p className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-muted-foreground">
            {state.phase === 'defusing'
              ? 'กำลังตัดสาย — เลือกการ์ดไม่ได้'
              : 'กำลังตัดสินใจกันการโจมตี — เลือกการ์ดไม่ได้'}
          </p>
        )}
      </div>
    </>
  )
}

// FIX_LISTS ชุดที่สี่ #3: ถังขยะแบบ SVG — รับสีจาก currentColor จึงสลับขาว/ดำตามธีมได้
// (วาดเองไม่พึ่ง lib ภายนอก แบบเดียวกับ ExitIcon ใน GameScreen)
function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}
