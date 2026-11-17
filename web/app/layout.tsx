import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ConfirmProvider, ThemeToggle, ToastProvider } from '@/lib/ui'
import { SITE, TAGLINE } from '@/lib/site'
import { PwaStart } from '@/components/Pwa'

const font = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'The Survival Notebook', template: '%s · The Survival Notebook' },
  description: TAGLINE,
  applicationName: 'The Survival Notebook',
  authors: [{ name: 'Hamish Lester', url: 'https://hamish555.com' }],
  openGraph: { type: 'website', siteName: 'The Survival Notebook', title: 'The Survival Notebook', description: TAGLINE, url: '/', images: [{ url: '/og.png', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', title: 'The Survival Notebook', description: TAGLINE, images: ['/og.png'] },
}
export const viewport: Viewport = { themeColor: '#14161a', colorScheme: 'dark light' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" data-theme="dark" className={font.variable} suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('sn_theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){}" }} /></head>
    <body><ToastProvider><ConfirmProvider>{children}<ThemeToggle /><PwaStart /></ConfirmProvider></ToastProvider></body></html>
}
