'use client'
import { useState, useEffect } from 'react'

export default function Privacy() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const sectionStyle = { marginBottom: '32px' }
  const h2Style = { fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '12px' }
  const pStyle = { fontSize: '15px', color: '#999', lineHeight: '1.7', margin: '0 0 12px 0' }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e5e5e5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Navigation */}
      <nav style={{ borderBottom: '1px solid #222', padding: isMobile ? '12px 16px' : '16px 32px', display: 'flex', justifyContent: 'space-between' }}>
        <a href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: '600', fontSize: isMobile ? '16px' : '18px' }}>aggrgtr</a>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <a href="/about" style={{ color: '#fff', textDecoration: 'none' }}>About</a>
          <a href="/subscribe" style={{ color: '#fff', textDecoration: 'none' }}>Subscribe</a>
        </div>
      </nav>

      {/* Content */}
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: isMobile ? '32px 16px' : '64px 32px' }}>
        <h1 style={{ fontSize: isMobile ? '28px' : '36px', fontWeight: '600', letterSpacing: '-1px', color: '#fff', margin: '0 0 8px 0' }}>Privacy Policy</h1>
        <p style={{ fontSize: '14px', color: '#666', margin: '0 0 40px 0' }}>Last updated: February 8, 2026</p>

        <section style={sectionStyle}>
          <h2 style={h2Style}>Overview</h2>
          <p style={pStyle}>
            aggrgtr is a data aggregation site that displays publicly available data. This policy explains
            what information is collected when you visit the site and how it is used.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>Data we collect</h2>
          <p style={pStyle}>
            <strong style={{ color: '#ccc' }}>We do not collect personal information.</strong> aggrgtr does not require
            user accounts, logins, or registration. We do not use cookies for tracking.
          </p>
          <p style={pStyle}>
            If you subscribe to updates via our subscribe page, your email address is stored solely for the purpose
            of sending you updates about new datasets. You can unsubscribe at any time by contacting us.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>Analytics and hosting</h2>
          <p style={pStyle}>
            This site is hosted on Vercel. Vercel may collect standard server logs including IP addresses,
            browser type, and pages visited. This data is used for performance monitoring and is subject to{' '}
            <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener" style={{ color: '#4ade80', textDecoration: 'none' }}>Vercel's Privacy Policy</a>.
          </p>
          <p style={pStyle}>
            aggrgtr does not use Google Analytics or any third-party tracking scripts.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>Data displayed on this site</h2>
          <p style={pStyle}>
            All data displayed on aggrgtr is collected from publicly available sources including official game
            APIs and public web pages. No private, personal, or user-specific data from any third-party service
            is collected, stored, or displayed.
          </p>
          <p style={pStyle}>
            RuneScape-related data is collected from publicly accessible pages provided by Jagex Ltd.
            This includes aggregate player counts and hiscores statistics. No individual player data,
            account names, or personal information is collected or displayed.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>Third-party services</h2>
          <p style={pStyle}>
            aggrgtr uses the following third-party services:
          </p>
          <ul style={{ ...pStyle, paddingLeft: '20px' }}>
            <li style={{ marginBottom: '8px' }}>Vercel — hosting and deployment</li>
            <li style={{ marginBottom: '8px' }}>Google BigQuery — data storage and querying</li>
            <li style={{ marginBottom: '8px' }}>Namecheap — domain registration</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>Disclaimer</h2>
          <p style={pStyle}>
            aggrgtr is an independent project and is not affiliated with, endorsed by, or sponsored by
            Jagex Ltd., the developers of RuneScape and Old School RuneScape. All trademarks belong to
            their respective owners.
          </p>
          <p style={pStyle}>
            Data is provided "as-is" for informational purposes only. aggrgtr makes no warranties regarding
            the accuracy or completeness of any data displayed.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>Contact</h2>
          <p style={{ ...pStyle, margin: 0 }}>
            For privacy-related questions or concerns:{' '}
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
