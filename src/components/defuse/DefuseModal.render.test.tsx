import { afterEach, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DefuseModal } from './DefuseModal'
import { GameProvider } from '@/components/game/GameProvider'
import { createGame, type GameHandle } from '@/lib/game/engine'
import { defaultSettings } from '@/lib/game/config'
import type { GameSettings } from '@/lib/game/types'

afterEach(cleanup)

function settingsFor(): GameSettings {
  return {
    ...defaultSettings(),
    teamNames: ['ทีม 1', 'ทีม 2'],
    rangeMin: 1,
    rangeMax: 20,
    cardsEnabled: false,
    glitchEnabled: false,
    defuseSeconds: 15,
  }
}

// เปิดช่องที่เป็นระเบิดจริง → เข้า phase 'defusing'
function defusingGame(): GameHandle {
  const settings = settingsFor()
  for (let seed = 0; seed < 30000; seed++) {
    const h = createGame(settings, seed)
    const secret = h.serializeSecret()
    const bombCell = Object.entries(secret).find(([, k]) => k === 'real')?.[0]
    if (bombCell === undefined) continue
    h.dispatch({ type: 'OPEN_CELL', cell: Number(bombCell) })
    if (h.getState().phase === 'defusing') return h
  }
  throw new Error('no seed found')
}

// FIX_LISTS ชุดที่สาม #15: กดตัดสายแล้วต้องรู้ผลทันที ไม่มีจอ "กำลังตัดสาย…" คั่น
test('ชุดที่สาม #15: กดตัดสายแล้วเฉลยผลทันที ไม่มีช่วงหน่วง', () => {
  const h = defusingGame()
  render(
    <GameProvider handle={h}>
      <DefuseModal />
    </GameProvider>,
  )
  // หัวเรื่องเป็น <h2> สองบรรทัด: ชื่อทีม <br> ตัดสาย — getByText('ตัดสาย') แบบ exact
  // จับไม่ได้เพราะ textContent ของ h2 คือ 'ทีม xตัดสาย' จึงเช็คที่ role heading แทน
  expect(screen.getByRole('heading').textContent).toContain('ตัดสาย')

  fireEvent.click(screen.getByLabelText('ตัดสายแดง'))

  // ต้องไม่มีจอลุ้นคั่นอีกแล้ว
  expect(screen.queryByText(/กำลังตัดสาย/)).toBeNull()
  // เฉลยผลทันทีในเฟรมเดียวกัน (รอด หรือ ระเบิด อย่างใดอย่างหนึ่ง)
  const survived = h.getState().defuseResult?.survived
  expect(survived === true || survived === false).toBe(true)
  expect(screen.getByText(survived ? 'กู้สำเร็จ!' : 'ระเบิด!')).toBeDefined()
  // ปุ่มรับทราบต้องพร้อมให้กดเลย ไม่ต้องรอ
  expect(screen.getByText('รับทราบ')).toBeDefined()
})
