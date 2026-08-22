import { useGame } from '@/components/game/GameProvider'
import { CARD_ART, CARD_META } from '@/lib/game/cards'

// FIX #25: ทีมที่ถือ Block ถูกถามว่าจะใช้กัน effect ไหม
// FIX_LISTS #10: ถามทีละทีมจนกว่าจะมีคนกัน หรือทุกทีมที่ถือ Block ตอบว่าไม่กัน
//   หัวคิว (askQueue[0]) คือทีมที่กำลังถูกถามอยู่ตอนนี้
// FIX_LISTS ชุดใหม่ #1: กัน Block ด้วย Block ได้ — ตอนเป็นชั้น counter ต้องบอกให้ชัด
//   ว่ากำลังจะ "ล้ม Block ของทีมไหน" ไม่ใช่กัน effect ต้นทาง (คนละเรื่องกัน)
// FIX_LISTS ชุดที่สิบสี่ #2: เดิมปิดเป็นความลับว่าอีกฝ่ายใช้การ์ดอะไร (ใบคว่ำ) — ยกเลิกแล้ว
//   ตอนนี้หงายให้เห็นตรง ๆ ว่ากำลังกันการ์ดอะไรอยู่ เหตุผล:
//   1. ผู้เล่นตัดสินใจไม่ถูกว่าจะทิ้ง Block ใบที่มีจำกัดไปกับ effect ที่มองไม่เห็น
//   2. AttackPrompt (จังหวะตัดสินใจแบบเดียวกัน) หงาย CARD_ART.attack อยู่แล้ว
//   3. `pendingBlock.card` อยู่ใน PublicGameState อยู่แล้ว จึงไม่เคยเป็นความลับจริงในทางเทคนิค
//
// FIX_LISTS ชุดที่สิบสอง #4: เดิมกล่องนี้มีแต่ text ล้วน ไม่มีรูปการ์ดสักใบ ทั้งที่
// AttackPrompt (จังหวะตัดสินใจแบบเดียวกัน) โชว์การ์ดจริง — สองหน้าจอดูเป็นคนละเกม
// ตอนนี้วางการ์ดคู่ที่กำลังปะทะกันให้เห็นภาพ: [ของอีกฝ่าย] ⚔ [🚫 Block ของคุณ]
//   - ชั้นปกติ: ฝั่งซ้ายหงายเป็น CARD_ART ของ effect ต้นทาง (attack/skip/reverse/shuffle)
//   - ชั้น counter: ฝั่งซ้ายหงายเป็น Block เพราะเจ้าของประกาศออกมาแล้ว
export function BlockPrompt() {
  const { state, dispatch } = useGame()
  const pending = state.pendingBlock
  if (!pending) return null

  // snapshot เก่าไม่มี askQueue → ตกกลับไปถามทีมเป้าหมายเหมือนพฤติกรรมเดิม
  const responderId = pending.askQueue?.[0] ?? pending.targetTeamId
  const responder = state.teams.find((t) => t.id === responderId)
  if (!responder) return null

  const chain = pending.chain ?? []
  const isCounter = pending.counter === true && chain.length > 0
  // ทีมที่ประกาศกันไว้ล่าสุด — คือเจ้าของ Block ที่กำลังจะถูกล้ม
  const lastBlocker = state.teams.find((t) => t.id === chain[chain.length - 1])
  // FIX_LISTS ชุดที่สิบสอง #4: ใช้ทั้งใต้รูปการ์ดและในบรรทัดคำอธิบาย — คำนวณที่เดียว
  const blocksLeft = responder.hand.filter((c) => c === 'block').length
  // FIX_LISTS ชุดที่สิบสี่ #2: ชื่อทีมที่ใช้การ์ดต้นทาง — โชว์คู่กับหน้าการ์ดที่หงายแล้ว
  const sourceName =
    state.teams.find((t) => t.id === pending.sourceTeamId)?.name ?? 'อีกทีม'

  // FIX_LISTS ชุดที่สาม #2: กันได้เฉพาะ effect ที่ลงกับทีมตัวเอง — คิวจึงมีทีมเดียวเสมอ
  // ไม่มีเคส "กันแทนทีมอื่น" (defendingOther) และไม่มีทีมรอถามต่ออีก (waiting)

  // FIX: จัดหน้าตาให้เป็นชุดเดียวกับ AttackPrompt — เดิมสองจอนี้เป็นจังหวะตัดสินใจ
  //   แบบเดียวกัน (modal เต็มจอ + การ์ดหงาย + ปุ่มยืนยัน) แต่หน้าตาคนละแบบ:
  //   AttackPrompt มีแถบ chip สรุปสถานะบนหัว + กล่องสรุปผลก่อนกด + เงาใต้กล่อง
  //   ส่วนอันนี้เป็นกล่องเปล่า ๆ ขอบเทา ตัวหนังสือกลาง ๆ
  //   ยกโครงเดียวกันมาใช้: ขอบสีตามบริบท + shadow เดียวกัน + แถว chip + กล่องสรุป
  //   ⚠️ เนื้อหา/ปุ่ม/ข้อความ ไม่เปลี่ยน — เปลี่ยนแค่การจัดวางกับสี
  return (
    <div
      className="fixed inset-0 z-30 flex overflow-y-auto bg-black/80 p-6"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={
          // FIX_LISTS ชุดที่สิบสอง #4: ขยายจาก max-w-lg — การ์ดสองใบวางคู่กันแล้วแคบไป
          // max-w-3xl + shadow ชุดเดียวกับ AttackPrompt
          'm-auto w-full max-w-3xl rounded-2xl border-2 bg-card p-6 text-center ' +
          'shadow-[0_12px_40px_rgba(0,0,0,0.45)] ' +
          (isCounter ? 'border-amber-500' : 'border-slate-500')
        }
      >
        {/* แถวหัวแบบ AttackPrompt: ป้ายบอกจังหวะ + chip สรุปของที่มีในมือ */}
        <div className="flex flex-wrap items-center gap-3 text-left">
          <p className="section-label">
            {isCounter
              ? `ชั้นที่ ${chain.length + 1} — มีทีมประกาศ Block`
              : `${sourceName} ใช้ ${CARD_META[pending.card].name} ใส่คุณ`}
          </p>
          {/* chip นับ Block คงเหลือ — ทรงเดียวกับ chip ของ AttackPrompt
              (ที่นั่นนับ "ใช้ไป N/M" เพราะเลือกได้หลายใบ ที่นี่ตัดสินใจใบเดียว
               จึงบอกยอดคงเหลือแทน) */}
          <span
            className={
              'ml-auto rounded-full border-2 px-3 py-1 font-mono text-base font-black ' +
              (blocksLeft > 0
                ? 'border-(--confirm) text-(--confirm)'
                : 'border-border text-muted-foreground')
            }
            aria-live="polite"
          >
            🚫 Block {blocksLeft}
          </span>
        </div>

        <h2 className="mt-2 text-left font-serif text-3xl font-bold leading-tight">
          {responder.name}
        </h2>

        {/* FIX_LISTS ชุดที่สิบสอง #4: การ์ดคู่ที่กำลังปะทะกัน — ใบซ้าย = ของอีกฝ่าย
            (หงายแล้วตั้งแต่ชุดที่สิบสี่ #2), ใบขวา = Block ที่เรากำลังจะตัดสินใจใช้ */}
        <div className="mt-5 flex items-center justify-center gap-3">
          <figure className="m-0">
            <img
              src={isCounter ? CARD_ART.block : CARD_ART[pending.card]}
              alt={
                isCounter
                  ? `${CARD_META.block.name} ของ ${lastBlocker?.name ?? 'อีกทีม'}`
                  : `${CARD_META[pending.card].name} ที่ ${sourceName} ใช้ใส่คุณ`
              }
              className="h-44 w-auto rounded-xl shadow-lg"
              draggable={false}
            />
            <figcaption className="mt-1.5 text-xs font-bold text-muted-foreground">
              {isCounter
                ? (lastBlocker?.name ?? 'อีกทีม')
                : `${sourceName} ใช้ ${CARD_META[pending.card].name}`}
            </figcaption>
          </figure>

          <span className="text-3xl font-black text-muted-foreground" aria-hidden="true">
            ⚔
          </span>

          <figure className="m-0">
            <img
              src={CARD_ART.block}
              alt={`${CARD_META.block.name} ในมือของ ${responder.name}`}
              className="h-44 w-auto rounded-xl shadow-lg ring-4 ring-(--confirm)"
              draggable={false}
            />
            <figcaption className="mt-1.5 text-xs font-bold text-(--confirm)">
              ของคุณ — เหลือ {blocksLeft} ใบ
            </figcaption>
          </figure>
        </div>

        {/* กล่องสรุปก่อนตัดสินใจ — ทรงเดียวกับกล่อง "ป้องกันไว้/ต้องเปิดเพิ่ม" ของ AttackPrompt
            (rounded-lg bg-secondary p-3) ให้สองจอนี้อ่านเป็นชุดเดียวกัน */}
        <div className="mt-4 rounded-lg bg-secondary p-3 text-left text-base">
          {isCounter && lastBlocker ? (
            <>
              <p className="text-lg leading-7">
                <b>{lastBlocker.name}</b> ประกาศใช้ <b>🚫 Block</b> — จะใช้ Block ของคุณ
                <br />
                เพื่อ <b className="text-amber-600 dark:text-amber-400">ล้ม Block ใบนั้น</b> ไหม?
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                ถ้าล้มสำเร็จ และ {lastBlocker.name} ไม่มี Block เหลือ — effect เดิมจะทำงานตามปกติ
              </p>
            </>
          ) : (
            <>
              <p className="text-lg leading-7">
                <b>{sourceName}</b> ใช้ <b>{CARD_META[pending.card].name}</b> ใส่คุณ — จะใช้การ์ด{' '}
                <b>🚫 Block</b> เพื่อกันไว้ไหม?
              </p>
            </>
          )}
        </div>

        {/* FIX_LISTS ชุดใหม่ #1: เห็นภาพว่าตอนนี้กันซ้อนกันมากี่ชั้นแล้ว */}
        {chain.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-sm">
            {chain.map((id, i) => {
              const t = state.teams.find((x) => x.id === id)
              return (
                <span key={`${id}-${i}`} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-muted-foreground">→</span>}
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 font-bold">
                    🚫 {t?.name ?? id}
                  </span>
                </span>
              )
            })}
          </div>
        )}

        {isCounter && (
          <p className="mt-3 text-xs text-muted-foreground">
            ชั้นเลขคี่ = effect ถูกกันสำเร็จ · ชั้นเลขคู่ = effect ทำงานตามปกติ
          </p>
        )}

        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => dispatch({ type: 'RESOLVE_BLOCK', use: true })}
            className="rounded-lg bg-(--confirm) px-6 py-3 text-lg font-black text-white"
          >
            🚫 {isCounter ? 'ใช้ Block ล้ม' : 'ใช้ Block กัน'}
          </button>
          <button
            onClick={() => dispatch({ type: 'RESOLVE_BLOCK', use: false })}
            className="rounded-lg border-2 border-border bg-background px-6 py-3 text-lg font-bold"
          >
            ไม่{isCounter ? 'ล้ม' : 'กัน'} (เก็บการ์ดไว้)
          </button>
        </div>
      </div>
    </div>
  )
}
