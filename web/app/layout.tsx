import type { Metadata } from 'next'
import { Sora } from 'next/font/google'
import './globals.css'

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'RegrettableAttritionRadar',
  description: 'Score employee flight risk, quantify replacement cost, and rank where retention spend has the best ROI.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sora.variable}>
      <body className="bg-stone-950 text-stone-100 min-h-screen antialiased font-sans">{children}</body>
    </html>
  )
}
