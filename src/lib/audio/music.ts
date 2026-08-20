// เพลง background จาก YouTube (W8) — ใช้ YouTube IFrame API ฝัง player ซ่อนไว้
// ห้าม download/แปลงไฟล์ (ผิด ToS) — ต้องใช้ player ของ YouTube เอง
// มี fallback: ถ้า iframe API โหลดไม่ได้ → UI เพลงไม่ขึ้น เกมยังเล่นต่อ

const ID_RE = /^[A-Za-z0-9_-]{11}$/

// แยก ID จาก URL YouTube — คืน string (วิดีโอ/เพลย์ลิสต์) หรือ null ถ้าไม่ใช่
// รองรับ: youtube.com/watch?v=, youtu.be/, youtube.com/playlist?list=,
// youtube.com/shorts/, youtube-nocookie.com, ID เปล่า ๆ 11 ตัว
export function parseYouTubeId(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  if (ID_RE.test(trimmed)) return trimmed

  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    return null
  }

  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '').replace(/^music\./, '')

  if (host === 'youtu.be') {
    const id = u.pathname.replace(/^\//, '').split('/')[0]
    return ID_RE.test(id) ? id : null
  }
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null

  const v = u.searchParams.get('v')
  if (v && ID_RE.test(v)) return v

  const list = u.searchParams.get('list')
  if (list && list.length > 11) return list

  const shorts = u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/)
  if (shorts) return shorts[1]

  return null
}

// แยกว่าที่ parse ได้เป็นเพลย์ลิสต์หรือวิดีโอ (เพลย์ลิสต์ขึ้นต้นด้วย PL และยาวกว่า 11)
export function isPlaylistId(id: string): boolean {
  return id.length > 11 && id.startsWith('PL')
}

// URL สำหรับฝัง iframe แบบ enablejsapi — ใช้ได้กับวิดีโอ/เพลย์ลิสต์
export function youtubeEmbedUrl(id: string): string {
  if (isPlaylistId(id)) {
    return `https://www.youtube.com/embed/videoseries?list=${id}&enablejsapi=1&playsinline=1`
  }
  return `https://www.youtube.com/embed/${id}?enablejsapi=1&playsinline=1`
}