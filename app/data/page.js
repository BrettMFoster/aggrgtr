'use client'
import { useState, useEffect } from 'react'
import { track } from '@vercel/analytics'

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
        <div style={{ display: 'flex', gap: isMobile ? '12px' : '24px', alignItems: 'center', fontSize: isMobile ? '13px' : undefined }}>
          <a href="https://paypal.me/aggrgtr" target="_blank" rel="noopener" style={{ color: '#4ade80', textDecoration: 'none', fontWeight: '500' }}>Donate</a>
          <a href="/subscribe" style={{ color: '#fff', textDecoration: 'none' }}>Subscribe</a>
          <a href="/" style={{ color: '#fff', textDecoration: 'none' }}>Datasets</a>
          <a href="https://discord.gg/E6z2CEUknK" target="_blank" rel="noopener" style={{ color: '#5865F2', textDecoration: 'none', fontWeight: '500' }}>Discord</a>
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
            {!isMobile && <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>Dashboards</div>}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: isMobile ? '4px' : '6px', flexWrap: 'wrap' }}>
              <a href="/rs-population" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Population</a>
              <a href="/osrs-worlds" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>OSRS Worlds</a>
              <a href="/hiscores" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Hiscores</a>
              <a href="/rs-trends" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Trends</a>
              <a href="/data" style={{ background: '#222', border: 'none', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '600' }}>Data</a>
              <a href="/blog" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Blog</a>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: isMobile ? '16px' : '24px 20px' }}>
          <h1 style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '600', letterSpacing: '-1px', color: '#fff', margin: '0 0 32px 0' }}>Data</h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { file: 'RS_Population_Quarter_Hour.csv', label: 'Quarter Hour (MisplacedItems)', size: '30 MB' },
              { file: 'RS_Population_Hour.csv', label: 'Hour (MisplacedItems)', size: '7.5 MB' },
              { file: 'RS_Population_Day.csv', label: 'Day (MisplacedItems)', size: '323 KB' },
              { file: 'RS_Population_Week.csv', label: 'Week (MisplacedItems)', size: '47 KB' },
              { file: 'RS_Population_Month.csv', label: 'Month (MisplacedItems)', size: '11 KB' },
              { file: 'RS_Population_Quarter_Year.csv', label: 'Quarter Year (MisplacedItems)', size: '4 KB' },
              { file: 'RS_PlayerCount_Dev.csv', label: 'Quarter Hour (PlayerCount.dev)', size: '310 KB' },
              { file: 'RS_Wayback_Population.csv', label: 'Wayback Machine (2002-2013)', size: '172 KB' },
            ].map(d => (
              <a
                key={d.file}
                href={`/csv/${d.file}`}
                download
                onClick={() => track(`download_${d.file}`)}
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
