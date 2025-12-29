import './globals.css'
import { Analytics } from '@vercel/analytics/react'

export const metadata = {
  title: 'aggrgtr - Affordable Public Data for Small Business',
  description: 'Clean, structured government data at small-business pricing. Crime stats, census demographics, school data, and more.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
