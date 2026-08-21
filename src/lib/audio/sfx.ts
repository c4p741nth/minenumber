// เสียง effect (W7) — ใช้ไฟล์จริงใน public/sounds/ โดยมี WebAudio เป็น fallback
// ถ้าไฟล์โหลดไม่ขึ้น (offline / 404) จะเล่น WebAudio ที่ generate เองแทน
// ไม่ควรมี error หลุด console ตอนเล่นเสียง

// map ชื่อเหตุการณ์ → ไฟล์เสียง (ดูตารางใน docs/TASKS-V3.md §W7.2)
const SOUND_FILES: Record<string, string> = {
  'bomb-timer': '/sounds/bomb-timer.mp3',
  finished: '/sounds/finished.mp3',
  'wire-cut': '/sounds/wire-cut.mp3',
  'defuse-failed': '/sounds/defuse-failed.mp3',
  'defuse-success': '/sounds/defuse-success.mp3',
  'glitch-bomb-hit': '/sounds/glitch-bomb-hit.mp3',
  'got-item': '/sounds/got-item.mp3',
  'item-unavailable': '/sounds/item-unavailable.mp3',
  'secure-block': '/sounds/secure-block.mp3',
  'select-block': '/sounds/select-block.mp3',
  'select-item': '/sounds/select-item.mp3',
  'use-item': '/sounds/use-item.mp3',
}

let ctx: AudioContext | null = null
let muted = false
let sfxVolume = 0.8
const SFX_VOLUME_KEY = 'mn.sfxVolume'
// undefined = ยังไม่ได้ลองโหลด, HTMLAudioElement = พร้อม, null = โหลดไม่ขึ้น
const audioCache = new Map<string, HTMLAudioElement | null>()
const failedSounds = new Set<string>()

function loadSfxVolume(): void {
  try {
    const raw = globalThis.localStorage?.getItem(SFX_VOLUME_KEY)
    if (raw !== null && raw !== '') {
      const v = Number(raw)
      if (!Number.isNaN(v)) sfxVolume = Math.min(Math.max(v, 0), 1)
    }
  } catch {
    // ignore
  }
}
loadSfxVolume()

// volume ของ sfx แยกจากเพลง background (W8) — เก็บใน localStorage
export function setSfxVolume(v: number): void {
  sfxVolume = Math.min(Math.max(v, 0), 1)
  try {
    globalThis.localStorage?.setItem(SFX_VOLUME_KEY, String(sfxVolume))
  } catch {
    // ignore
  }
}

export function getSfxVolume(): number {
  return sfxVolume
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

// เรียกตอน user gesture แรก (กดเริ่มเกม) เพื่อปลดล็อก autoplay policy + preload ไฟล์เสียง
export function unlockAudio(): void {
  ac()
  for (const name of Object.keys(SOUND_FILES)) {
    getAudio(name)
  }
}

export function setMuted(m: boolean): void {
  muted = m
}

export function isMuted(): boolean {
  return muted
}

// โหลด (หรือคืนจาก cache) Audio object — preload ครั้งเดียวแล้ว cloneNode() ตอนเล่น (เล่นซ้อนได้)
function getAudio(name: string): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null
  const cached = audioCache.get(name)
  if (cached !== undefined) return cached
  const path = SOUND_FILES[name]
  if (!path) return null
  const el = new Audio(path)
  el.preload = 'auto'
  el.addEventListener('error', () => {
    failedSounds.add(name)
    audioCache.set(name, null)
  })
  audioCache.set(name, el)
  return el
}

// เล่นไฟล์เสียง — คืน true ถ้าพยายามเล่นไฟล์, false ถ้าต้องใช้ fallback
function playFile(name: string): boolean {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return false
  if (muted) return false
  if (failedSounds.has(name)) return false
  const audio = getAudio(name)
  if (!audio) return false
  const node = audio.cloneNode() as HTMLAudioElement
  node.volume = sfxVolume
  node
    .play()
    .then(() => {})
    .catch(() => {
      // autoplay ยังถูกล็อก / ไฟล์ decode ไม่ได้ → ใช้ WebAudio fallback รอบนี้
      failedSounds.add(name)
    })
  return true
}

// เล่นเหตุการณ์: ไฟล์ก่อน, ถ้าไม่ได้ (โหลดไม่ขึ้น / ไม่มีไฟล์) → WebAudio fallback
function playFx(name: string, fallback: () => void): void {
  if (muted) return
  const ok = playFile(name)
  if (!ok) fallback()
}

function env(g: GainNode, t0: number, attack: number, peak: number, dur: number): void {
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(peak, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + dur)
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  t0?: number,
  glideTo?: number,
): void {
  const c = ac()
  if (!c || muted) return
  const start = t0 ?? c.currentTime
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (glideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(glideTo, start + dur)
  }
  env(g, start, 0.01, vol, dur)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(start)
  osc.stop(start + dur + 0.05)
}

function noise(
  dur: number,
  vol: number,
  freqFrom: number,
  freqTo: number,
  t0?: number,
): void {
  const c = ac()
  if (!c || muted) return
  const start = t0 ?? c.currentTime
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buffer = c.createBuffer(1, len, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(freqFrom, start)
  filter.frequency.exponentialRampToValueAtTime(freqTo, start + dur)
  const g = c.createGain()
  env(g, start, 0.005, vol, dur)
  src.connect(filter)
  filter.connect(g)
  g.connect(c.destination)
  src.start(start)
  src.stop(start + dur + 0.05)
}

// ---- WebAudio fallback (ตัวเดิม — อย่าลบทิ้ง) ----
function tickSfx(): void {
  tone(1400, 0.03, 'square', 0.08)
}

function explosionFallback(): void {
  noise(0.7, 0.5, 5000, 120)
  tone(120, 0.5, 'sine', 0.4, undefined, 40)
}

function defuseSuccessFallback(): void {
  const c = ac()
  if (!c || muted) return
  const start = c.currentTime
  tone(523, 0.25, 'sine', 0.2, start)
  tone(659, 0.25, 'sine', 0.2, start + 0.12)
  tone(784, 0.4, 'sine', 0.2, start + 0.24)
}

function defuseFailedFallback(): void {
  const c = ac()
  if (!c || muted) return
  const start = c.currentTime
  tone(220, 0.3, 'sawtooth', 0.2, start, 110)
  tone(110, 0.5, 'sine', 0.3, start + 0.1, 50)
}

function glitchFallback(): void {
  const c = ac()
  if (!c || muted) return
  const start = c.currentTime
  for (let i = 0; i < 5; i++) {
    tone(200 + Math.random() * 600, 0.06, 'square', 0.12, start + i * 0.08)
  }
  noise(0.2, 0.15, 4000, 800, start)
}

function cardPlayFallback(): void {
  noise(0.12, 0.1, 1200, 3500)
}

function selectFallback(): void {
  tone(700, 0.05, 'square', 0.1)
}

function timeoutSfx(): void {
  const c = ac()
  if (!c || muted) return
  const start = c.currentTime
  tone(180, 0.15, 'sawtooth', 0.25, start)
  tone(180, 0.15, 'sawtooth', 0.25, start + 0.2)
}

function fanfareSfx(): void {
  const c = ac()
  if (!c || muted) return
  const start = c.currentTime
  const notes = [523, 659, 784, 1047]
  notes.forEach((f, i) => tone(f, 0.3, 'square', 0.15, start + i * 0.12))
}

export const sfx = {
  // เหตุการณ์ที่ map กับไฟล์ใน public/sounds/ (W7.2)
  click: () => playFx('select-block', selectFallback), // เปิดช่อง safe
  explosion: () => playFx('defuse-failed', explosionFallback), // ตัดสายไม่ทัน / เฉลยว่าโดนระเบิด
  defuseSuccess: () => playFx('defuse-success', defuseSuccessFallback), // กู้สำเร็จ
  defuseFailed: () => playFx('defuse-failed', defuseFailedFallback), // จังหวะเฉลยว่าพลาด
  glitch: () => playFx('glitch-bomb-hit', glitchFallback), // เจอ glitch bomb
  cardPlay: () => playFx('use-item', cardPlayFallback), // ใช้การ์ด
  gotItem: () => playFx('got-item', selectFallback), // จั่วการ์ดได้
  selectItem: () => playFx('select-item', selectFallback), // เปิดหน้าไพ่
  itemUnavailable: () => playFx('item-unavailable', selectFallback), // กดการ์ดตอน glitch/block
  secureBlock: () => playFx('secure-block', selectFallback), // ช่องปลอดภัยยืนยันแล้ว / shrink
  // FIX_LISTS #5: เสียงนับถอยหลังตอนตัดสาย — ดังทุก 1 วินาที
  bombTimer: () => playFx('bomb-timer', tickSfx),
  // FIX_LISTS #6: เสียงตอนตัดสายจริง
  wireCut: () => playFx('wire-cut', cardPlayFallback),
  // FIX_LISTS #7: เสียงตอนขึ้น Leaderboard ตอนจบเกม
  finished: () => playFx('finished', fanfareSfx),
  // ยังไม่มีไฟล์ — WebAudio ล้วน
  tick: tickSfx,
  timeout: timeoutSfx,
  fanfare: fanfareSfx,
}