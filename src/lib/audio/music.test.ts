import { describe, expect, it } from 'bun:test'
import { isPlaylistId, parseYouTubeId, youtubeEmbedUrl } from './music'

describe('parseYouTubeId', () => {
  it('ID เปล่า ๆ 11 ตัว → วิดีโอ', () => {
    expect(parseYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('youtube.com/watch?v=', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('youtu.be/', () => {
    expect(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=30')).toBe('dQw4w9WgXcQ')
  })

  it('youtube.com/playlist?list=', () => {
    expect(parseYouTubeId('https://www.youtube.com/playlist?list=PL12345678901234567890')).toBe(
      'PL12345678901234567890',
    )
  })

  it('youtube.com/shorts/', () => {
    expect(parseYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('youtube-nocookie.com', () => {
    expect(parseYouTubeId('https://www.youtube-nocookie.com/watch?v=dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    )
  })

  it('มี whitespace ล้อม → trim แล้วยังได้ id', () => {
    expect(parseYouTubeId('  https://youtu.be/dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ')
  })

  it('input ขยะ → null', () => {
    expect(parseYouTubeId('')).toBeNull()
    expect(parseYouTubeId('   ')).toBeNull()
    expect(parseYouTubeId('abc')).toBeNull()
    expect(parseYouTubeId('https://example.com/watch?v=xyz')).toBeNull()
    expect(parseYouTubeId('not a url')).toBeNull()
    expect(parseYouTubeId('https://youtu.be/too-long-or-too-short')).toBeNull()
    expect(parseYouTubeId('https://youtube.com/watch?v=123')).toBeNull()
  })
})

describe('isPlaylistId', () => {
  it('ขึ้นต้น PL + ยาวกว่า 11 → เพลย์ลิสต์', () => {
    expect(isPlaylistId('PL12345678901234567890')).toBe(true)
  })
  it('วิดีโอ 11 ตัว → ไม่ใช่เพลย์ลิสต์', () => {
    expect(isPlaylistId('dQw4w9WgXcQ')).toBe(false)
  })
})

describe('youtubeEmbedUrl', () => {
  it('วิดีโอ → embed แบบ video', () => {
    expect(youtubeEmbedUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1&playsinline=1',
    )
  })
  it('เพลย์ลิสต์ → videoseries + list', () => {
    expect(youtubeEmbedUrl('PL12345678901234567890')).toBe(
      'https://www.youtube.com/embed/videoseries?list=PL12345678901234567890&enablejsapi=1&playsinline=1',
    )
  })
})