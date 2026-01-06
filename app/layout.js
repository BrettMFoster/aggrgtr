import './globals.css'
import { Analytics } from '@vercel/analytics/react'
import { Providers } from './providers'

export const metadata = {
  title: 'aggrgtr',
  description: 'Clean, structured government data. Crime stats, census demographics, school data, and more.',
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
