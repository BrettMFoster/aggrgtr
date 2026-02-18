import './globals.css'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/react'
import { Providers } from './providers'
import AdBanner from './components/AdBanner'

export const metadata = {
  title: {
    default: 'aggrgtr - Data Dashboards & Analytics',
    template: '%s | aggrgtr',
  },
  description: 'Live data dashboards for RuneScape population tracking, OSRS world stats, hiscores analytics, and trend analysis. Updated every 3 minutes.',
  metadataBase: new URL('https://www.aggrgtr.com'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.aggrgtr.com',
    siteName: 'aggrgtr',
    title: 'aggrgtr - Data Dashboards & Analytics',
    description: 'Live data dashboards for RuneScape population tracking, OSRS world stats, hiscores analytics, and trend analysis.',
  },
  twitter: {
    card: 'summary',
    title: 'aggrgtr - Data Dashboards & Analytics',
    description: 'Live data dashboards for RuneScape population tracking, OSRS world stats, hiscores analytics, and trend analysis.',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.aggrgtr.com',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5708927690150651"
          crossOrigin="anonymous"
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
