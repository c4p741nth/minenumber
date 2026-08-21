import { useEffect, useState } from 'react'
import { readDisplayMode, subscribeDisplayMode, type DisplayMode } from '@/lib/display'

// FIX_LISTS ชุดที่สาม #11/#13: โหมดจอปัจจุบัน (laptop/tv) แบบ reactive
// แยกไฟล์จาก display.ts เพื่อให้ display.ts ยังเป็นโมดูลเปล่า ๆ ที่เทสเรียกได้โดยไม่ต้องมี React
export function useDisplayMode(): DisplayMode {
  const [mode, setMode] = useState<DisplayMode>(() => readDisplayMode())
  useEffect(() => subscribeDisplayMode(setMode), [])
  return mode
}
