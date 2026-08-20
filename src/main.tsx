import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App'
import './globals.css'
// FIX #41: import เพื่อ side effect — applyTheme(loadTheme()) รันที่ระดับ module
// ต้องอยู่ก่อน createRoot ไม่งั้นเรนเดอร์ธีมสว่างแล้วสลับ = จอกระพริบขาว
import '@/lib/theme'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
)