// Seeded RNG — deterministic เพื่อให้เขียน test ได้
// mulberry32 — เร็ว, seed 32 บิต, สุ่มพอใช้สำหรับเกมนี้

export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomInt(rng: () => number, min: number, max: number): number {
  // inclusive ทั้งสองด้าน
  return min + Math.floor(rng() * (max - min + 1))
}

export function pickRandom<T>(rng: () => number, arr: T[]): T {
  if (arr.length === 0) {
    throw new Error('pickRandom: empty array')
  }
  return arr[Math.floor(rng() * arr.length)]
}

// Fisher-Yates — คืนอาร์เรย์ใหม่ ไม่ mutate ตัวเดิม
export function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

// items: [ค่า, น้ำหนัก][] — น้ำหนักเป็นจำนวนเต็ม ≥ 0
export function weightedPick<T>(rng: () => number, items: ReadonlyArray<readonly [T, number]>): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0)
  if (total <= 0) {
    throw new Error('weightedPick: total weight must be > 0')
  }
  let r = rng() * total
  for (const [value, w] of items) {
    r -= w
    if (r < 0) {
      return value
    }
  }
  return items[items.length - 1][0]
}

// Seed สุ่มจริงสำหรับเริ่มเกม — ใช้ crypto ไม่ใช่ Date.now()
export function randomSeed(): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0]
}