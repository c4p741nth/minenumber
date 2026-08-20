import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { DM_Serif_Display, Geist, Geist_Mono, Noto_Sans_Thai } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })
const dmSerif = DM_Serif_Display({ weight: '400', subsets: ['latin'], variable: '--font-dm-serif' })
const notoThai = Noto_Sans_Thai({ subsets: ['thai'], variable: '--font-noto-thai' })

export const metadata: Metadata = { title: 'วงระเบิด — Meeting Game', description: 'เกมสุ่มตัวเลขเอาตัวรอดสำหรับเล่นหลายทีมในที่ประชุม' }
export const viewport: Viewport = { colorScheme: 'light dark', themeColor: '#f5f3ee', userScalable: false }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th" className={`${geist.variable} ${geistMono.variable} ${dmSerif.variable} ${notoThai.variable}`}><body className="antialiased">{children}{process.env.NODE_ENV === 'production' && <Analytics />}</body></html>
}
