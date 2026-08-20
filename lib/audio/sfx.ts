// เสียงทั้งหมด generate ด้วย WebAudio API — ไม่ใช้ไฟล์ภายนอก
// (ไม่ต้องหา asset, ไม่มีปัญหาลิขสิทธิ์, bundle เล็ก, ทำงาน offline)

let ctx: AudioContext | null = null
let muted = false

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

// เรียกตอน user gesture แรก (กดเริ่มเกม) เพื่อปลดล็อก autoplay policy
export function unlockAudio(): void {
  ac()
}

export function setMuted(m: boolean): void {
  muted = m
}

export function isMuted(): boolean {
  return muted
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

function clickSfx(): void {
  tone(700, 0.05, 'square', 0.1)
}

function tickSfx(): void {
  tone(1400, 0.03, 'square', 0.08)
}

function explosionSfx(): void {
  // white noise + lowpass sweep ลง
  noise(0.7, 0.5, 5000, 120)
  tone(120, 0.5, 'sine', 0.4, undefined, 40)
}

function defuseSuccessSfx(): void {
  // sine chime ไล่ขึ้น 3 โน้ต
  const c = ac()
  if (!c || muted) return
  const start = c.currentTime
  tone(523, 0.25, 'sine', 0.2, start)
  tone(659, 0.25, 'sine', 0.2, start + 0.12)
  tone(784, 0.4, 'sine', 0.2, start + 0.24)
}

function glitchSfx(): void {
  // square wave + random pitch jump + static burst
  const c = ac()
  if (!c || muted) return
  const start = c.currentTime
  for (let i = 0; i < 5; i++) {
    tone(200 + Math.random() * 600, 0.06, 'square', 0.12, start + i * 0.08)
  }
  noise(0.2, 0.15, 4000, 800, start)
}

function cardPlaySfx(): void {
  noise(0.12, 0.1, 1200, 3500)
}

function timeoutSfx(): void {
  // buzzer สองจังหวะ
  const c = ac()
  if (!c || muted) return
  const start = c.currentTime
  tone(180, 0.15, 'sawtooth', 0.25, start)
  tone(180, 0.15, 'sawtooth', 0.25, start + 0.2)
}

function fanfareSfx(): void {
  // arpeggio major
  const c = ac()
  if (!c || muted) return
  const start = c.currentTime
  const notes = [523, 659, 784, 1047]
  notes.forEach((f, i) => tone(f, 0.3, 'square', 0.15, start + i * 0.12))
}

export const sfx = {
  click: clickSfx,
  tick: tickSfx,
  explosion: explosionSfx,
  defuseSuccess: defuseSuccessSfx,
  glitch: glitchSfx,
  cardPlay: cardPlaySfx,
  timeout: timeoutSfx,
  fanfare: fanfareSfx,
}