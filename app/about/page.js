'use client'
import { useState, useEffect } from 'react'

export default function About() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e5e5e5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Navigation */}
      <nav style={{ borderBottom: '1px solid #222', padding: isMobile ? '12px 16px' : '16px 32px', display: 'flex', justifyContent: 'space-between' }}>
        <a href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: '600', fontSize: isMobile ? '16px' : '18px' }}>aggrgtr</a>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <a href="/about" style={{ color: '#4ade80', textDecoration: 'none', fontWeight: '500' }}>About</a>
          <a href="/subscribe" style={{ color: '#fff', textDecoration: 'none' }}>Subscribe</a>
        </div>
      </nav>

      {/* Content */}
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: isMobile ? '32px 16px' : '64px 32px' }}>
        <h1 style={{ fontSize: isMobile ? '28px' : '36px', fontWeight: '600', letterSpacing: '-1px', color: '#fff', margin: '0 0 32px 0' }}>About aggrgtr</h1>

        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '12px' }}>What is this?</h2>
          <p style={{ fontSize: '15px', color: '#999', lineHeight: '1.7', margin: '0 0 16px 0' }}>
            aggrgtr is an independent data aggregation project that collects, cleans, and visualizes publicly available data.
            The site focuses on datasets that are useful but difficult to access in a clean, structured format.
          </p>
          <p style={{ fontSize: '15px', color: '#999', lineHeight: '1.7', margin: '0 0 16px 0' }}>
            Current datasets include RuneScape population tracking (OSRS and RS3 player counts, world-level data,
            and hiscores activity), collected from official public sources and updated at regular intervals.
          </p>
          <p style={{ fontSize: '15px', color: '#999', lineHeight: '1.7', margin: 0 }}>
            All data displayed on this site is sourced from publicly available APIs and web pages. No private, personal,
            or user-specific data is collected or displayed.
          </p>
        </section>

        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '12px' }}>How it works</h2>
          <p style={{ fontSize: '15px', color: '#999', lineHeight: '1.7', margin: '0 0 16px 0' }}>
            Automated scrapers collect data at regular intervals (every 3-15 minutes depending on the dataset)
            from official public sources. This data is stored in Google BigQuery and served to the frontend
            dashboards via API routes. The site is built with Next.js and hosted on Vercel.
          </p>
        </section>

        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '12px' }}>Disclaimer</h2>
          <p style={{ fontSize: '15px', color: '#999', lineHeight: '1.7', margin: '0 0 16px 0' }}>
            aggrgtr is an independent project and is <strong style={{ color: '#ccc' }}>not affiliated with, endorsed by, or sponsored by Jagex Ltd.</strong>,
            the developers of RuneScape and Old School RuneScape. "RuneScape", "OSRS", and "RS3" are trademarks of Jagex Ltd.
          </p>
          <p style={{ fontSize: '15px', color: '#999', lineHeight: '1.7', margin: '0 0 16px 0' }}>
            All RuneScape data is collected from publicly accessible pages and APIs provided by Jagex.
            This site does not interact with game servers, access player accounts, or collect any private player information.
          </p>
          <p style={{ fontSize: '15px', color: '#999', lineHeight: '1.7', margin: 0 }}>
            Data is provided "as-is" for informational purposes. While effort is made to ensure accuracy,
            aggrgtr makes no guarantees about the completeness or correctness of displayed data.
          </p>
        </section>

        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '12px' }}>Contact</h2>
          <p style={{ fontSize: '15px', color: '#999', lineHeight: '1.7', margin: 0 }}>
            For questions, data requests, or to report an issue:{' '}
            <a href="mailto:foster.brett.m@gmail.com" style={{ color: '#4ade80', textDecoration: 'none' }}>foster.brett.m@gmail.com</a>
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #222', padding: isMobile ? '16px' : '24px 32px', fontSize: '12px', color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <a href="/about" style={{ color: '#666', textDecoration: 'none' }}>About</a>
          <a href="/privacy" style={{ color: '#666', textDecoration: 'none' }}>Privacy Policy</a>
        </div>
        <span>aggrgtr 2026</span>
      </footer>
    </div>
  )
}
