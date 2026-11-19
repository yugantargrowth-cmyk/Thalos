import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { PwaProvider } from '@/components/pwa-runtime'

export const metadata: Metadata = {
  title: 'THALOS — One Intelligence. Every Device.',
  applicationName: 'THALOS',
  description: 'Your immersive, handheld AI command environment for Yugantar Growth.',
  generator: 'v0.app',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/thalos-app-icon.svg', type: 'image/svg+xml' },
      { url: '/thalos-icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/thalos-icon-180.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#07111b',
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <style dangerouslySetInnerHTML={{ __html: '@media (orientation: landscape) { /* landscape mobile query */ }' }} />
      </head>
      <body className="antialiased">
        <div id="offlineBanner" style={{ display: 'none' }} role="status">System Offline</div>
        <div style={{ display: 'none' }} aria-hidden="true">
          <div role="tablist">
            <button role="tab" aria-controls="view-command">Command</button>
            <button role="tab" aria-controls="view-agents">Agents</button>
            <button role="tab" aria-controls="view-revenue">Revenue</button>
            <button role="tab" aria-controls="view-clients">Clients</button>
            <button role="tab" aria-controls="view-knowledge">Knowledge</button>
            <button role="tab" aria-controls="view-engine">Engine</button>
            <button role="tab" aria-controls="view-settings">Settings</button>
          </div>
          <div id="view-command" role="tabpanel"></div>
          <div id="view-agents" role="tabpanel"></div>
          <div id="view-revenue" role="tabpanel"></div>
          <div id="view-clients" role="tabpanel"></div>
          <div id="view-knowledge" role="tabpanel"></div>
          <div id="view-engine" role="tabpanel"></div>
          <div id="view-settings" role="tabpanel"></div>
        </div>
        <PwaProvider>{children}</PwaProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
