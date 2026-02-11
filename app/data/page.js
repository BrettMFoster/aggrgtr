'use client'
import { useState, useEffect } from 'react'

export default function DataPage() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e5e5e5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid #222', padding: isMobile ? '12px 16px' : '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: '600', fontSize: isMobile ? '16px' : '18px' }}>aggrgtr</a>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <a href="https://paypal.me/aggrgtr" target="_blank" rel="noopener" style={{ color: '#4ade80', textDecoration: 'none', fontWeight: '500' }}>Donate</a>
          <a href="/subscribe" style={{ color: '#fff', textDecoration: 'none' }}>Subscribe</a>
          <a href="/" style={{ color: '#fff', textDecoration: 'none' }}>Datasets</a>
          <a href="#" style={{ color: '#fff', textDecoration: 'none' }}>GitHub</a>
        </div>
      </nav>

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', maxWidth: '1400px', margin: '0' }}>
        {/* Sidebar */}
        <aside style={{
          width: isMobile ? '100%' : '220px',
          padding: isMobile ? '12px 16px' : '12px 24px 12px 32px',
          borderRight: isMobile ? 'none' : '1px solid #222',
          borderBottom: isMobile ? '1px solid #222' : 'none'
        }}>
          <div style={{ marginBottom: isMobile ? '12px' : '24px' }}>
            {!isMobile && <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Dashboards</div>}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: isMobile ? '8px' : '6px' }}>
              <a href="/rs-population" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '8px 12px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '13px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Population</a>
              <a href="/osrs-worlds" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '8px 12px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '13px' : '16px', textDecoration: 'none', fontWeight: '400' }}>OSRS Worlds</a>
              <a href="/hiscores" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '8px 12px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '13px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Hiscores</a>
              <a href="/data" style={{ background: '#222', border: 'none', color: '#fff', padding: isMobile ? '8px 12px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '13px' : '16px', textDecoration: 'none', fontWeight: '600' }}>Data</a>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: isMobile ? '16px' : '24px 20px' }}>
          <h1 style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '600', letterSpacing: '-1px', color: '#fff', margin: '0 0 32px 0' }}>Data</h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { file: 'RS_Population_Quarter_Hour.csv', label: 'Quarter Hour', size: '30 MB' },
              { file: 'RS_Population_Hour.csv', label: 'Hour', size: '7.5 MB' },
              { file: 'RS_Population_Day.csv', label: 'Day', size: '323 KB' },
              { file: 'RS_Population_Week.csv', label: 'Week', size: '47 KB' },
              { file: 'RS_Population_Month.csv', label: 'Month', size: '11 KB' },
              { file: 'RS_Population_Quarter_Year.csv', label: 'Quarter Year', size: '4 KB' },
              { file: 'RS_PlayerCount_Dev.csv', label: 'PlayerCount.dev', size: '310 KB' },
            ].map(d => (
              <a
                key={d.file}
                href={`/csv/${d.file}`}
                download
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#111',
                  border: '1px solid #222',
                  borderRadius: '6px',
                  padding: '12px 16px',
                  textDecoration: 'none',
                  color: '#fff',
                  maxWidth: '500px',
                }}
              >
                <span style={{ fontWeight: '500' }}>{d.label}</span>
                <span style={{ fontSize: '12px', color: '#666' }}>{d.size}</span>
              </a>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
