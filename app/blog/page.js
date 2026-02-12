'use client'
import { useState, useEffect } from 'react'

const posts = [
  {
    date: '2026-02-12',
    title: 'Welcome to the aggrgtr Blog',
    body: `This is where I'll be posting commentary, analysis, and updates about the data we track. Check back for insights on RS3 population trends, hiscores movements, and other findings from the dashboards.`
  },
]

export default function BlogPage() {
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
            {!isMobile && <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Dashboards</div>}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: isMobile ? '8px' : '6px' }}>
              <a href="/rs-population" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '8px 12px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '13px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Population</a>
              <a href="/osrs-worlds" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '8px 12px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '13px' : '16px', textDecoration: 'none', fontWeight: '400' }}>OSRS Worlds</a>
              <a href="/hiscores" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '8px 12px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '13px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Hiscores</a>
              <a href="/rs-trends" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '8px 12px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '13px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Trends</a>
              <a href="/data" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '8px 12px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '13px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Data</a>
              <a href="/blog" style={{ background: '#222', border: 'none', color: '#fff', padding: isMobile ? '8px 12px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '13px' : '16px', textDecoration: 'none', fontWeight: '600' }}>Blog</a>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: isMobile ? '16px' : '24px 20px', maxWidth: '800px' }}>
          <h1 style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '600', letterSpacing: '-1px', color: '#fff', margin: '0 0 32px 0' }}>Blog</h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {posts.map((post, i) => (
              <article key={i} style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '16px' : '24px' }}>
                <div style={{ fontSize: '13px', color: '#888', marginBottom: '8px' }}>{new Date(post.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                <h2 style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '600', color: '#fff', margin: '0 0 12px 0' }}>{post.title}</h2>
                <div style={{ fontSize: '15px', lineHeight: '1.7', color: '#ccc', whiteSpace: 'pre-line' }}>{post.body}</div>
              </article>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}