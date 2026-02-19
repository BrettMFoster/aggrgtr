import './globals.css'
import { Analytics } from '@vercel/analytics/react'
import { Providers } from './providers'

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
      <body>
        <Providers>
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}
