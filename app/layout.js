import './globals.css'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/react'
import { Providers } from './providers'
import AdBanner from './components/AdBanner'

export const metadata = {
  title: 'aggrgtr',
  description: 'Clean, structured government data. Crime stats, census demographics, school data, and more.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5708927690150651"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
        <AdBanner />
        <Analytics />
      </body>
    </html>
  )
}
