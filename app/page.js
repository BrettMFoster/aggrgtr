'use client'
import { useState, useEffect } from 'react'

export default function Home() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const rsDatasets = [
    {
      id: 'rs-population',
      title: 'Population',
      status: 'live',
      desc: 'Live OSRS and RS3 player counts with Steam overlay. Historical data back to 2002.',
      stats: ['3-min intervals', '20+ years of data'],
      link: '/rs-population'
    },
    {
      id: 'rs-trends',
      title: 'Trends & YoY',
      status: 'live',
      desc: 'Year-over-year comparisons with regression trendlines and day-of-week filters.',
      stats: ['Seasonal analysis', 'Trendlines'],
      link: '/rs-trends'
    },
    {
      id: 'hiscores',
      title: 'Hiscores',
      status: 'live',
      desc: 'RS3 active account tracking from the official hiscores. Weekly and monthly snapshots.',
      stats: ['Weekly snapshots', 'Monthly totals'],
      link: '/hiscores'
    },
    {
      id: 'osrs-worlds',
      title: 'OSRS Worlds',
      status: 'live',
      desc: 'Live world population data. Sort and filter by region, type, and player count.',
      stats: ['Per-world data', 'Historical charts'],
      link: '/osrs-worlds'
    },
  ]


  return (
    <main style={styles.main}>
      {/* Navigation */}
      <nav style={{ borderBottom: '1px solid #222', padding: isMobile ? '12px 16px' : '14px 48px', display: 'flex', justifyContent: 'space-between' }}>
        <a href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: '600', fontSize: isMobile ? '16px' : '18px' }}>aggrgtr</a>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <a href="/about" style={{ color: '#fff', textDecoration: 'none' }}>About</a>
          <a href="https://paypal.me/aggrgtr" target="_blank" rel="noopener" style={{ color: '#4ade80', textDecoration: 'none', fontWeight: '500' }}>Donate</a>
          <a href="/subscribe" style={{ color: '#fff', textDecoration: 'none' }}>Subscribe</a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: isMobile ? '32px 16px 12px' : '24px 48px 8px', maxWidth: '900px' }}>
        <h1 style={{ ...styles.h1, fontSize: isMobile ? '24px' : '32px', textAlign: isMobile ? 'center' : 'left' }}>Open datasets, cleaned and documented</h1>
        <p style={{ ...styles.subtitle, textAlign: isMobile ? 'center' : 'left' }}>
          Live dashboards and datasets. Download directly or access via API.
        </p>
      </section>

      {/* RuneScape Section */}
      <section id="runescape" style={{ padding: isMobile ? '12px 16px 24px' : '0 48px 32px', maxWidth: '900px' }}>
        <div style={{ border: '1px solid #222', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: '#111', borderBottom: '1px solid #222' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', margin: 0 }}>RuneScape</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1px', background: '#222' }}>
            {rsDatasets.map(dataset => (
              <a key={dataset.id} href={dataset.link} style={{ textDecoration: 'none', color: 'inherit', background: '#0a0a0a', padding: '14px 16px', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#141414'}
                onMouseLeave={e => e.currentTarget.style.background = '#0a0a0a'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#fff', margin: 0 }}>{dataset.title}</h3>
                  <span style={styles.badgeLive}>Live</span>
                </div>
                <p style={{ fontSize: '14px', color: '#aaa', margin: 0, lineHeight: '1.4' }}>{dataset.desc}</p>
              </a>
            ))}
            {/* Data - left */}
            <div style={{ background: '#0a0a0a', padding: '14px 16px', opacity: 0.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#fff', margin: 0 }}>Data</h3>
                <span style={{ fontSize: '10px', background: '#1a1a1a', color: '#999', padding: '3px 8px', borderRadius: '4px', fontWeight: '500' }}>Coming Soon</span>
              </div>
              <p style={{ fontSize: '14px', color: '#aaa', margin: 0, lineHeight: '1.4' }}>Downloadable datasets and API access.</p>
            </div>
            {/* Blog - right */}
            <a href="/blog" style={{ textDecoration: 'none', color: 'inherit', background: '#0a0a0a', padding: '14px 16px', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#141414'}
              onMouseLeave={e => e.currentTarget.style.background = '#0a0a0a'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#fff', margin: 0 }}>Blog</h3>
              </div>
              <p style={{ fontSize: '14px', color: '#aaa', margin: 0, lineHeight: '1.4' }}>Updates, analysis, and development notes.</p>
            </a>
          </div>
        </div>
      </section>

      {/* About / Updates */}
      <section id="about" style={{ ...styles.aboutSection, padding: isMobile ? '24px 16px' : '32px 48px', maxWidth: '900px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '24px' }}>
          <div style={styles.aboutCard}>
            <h3 style={styles.aboutTitle}>What is this?</h3>
            <p style={styles.aboutText}>
              Aggregation of public data that is overneeded and underserviced.
              Most data here is free, but datasets requiring significant time
              and effort to compile will be available for a fee.
            </p>
          </div>
          <div style={styles.aboutCard}>
            <h3 style={styles.aboutTitle}>Get updates</h3>
            <p style={styles.aboutText}>
              New datasets and API access coming soon.
            </p>
            <a href="/subscribe" style={styles.subscribeLink}>
              Subscribe for updates →
            </a>
          </div>
          <div style={styles.aboutCard}>
            <h3 style={styles.aboutTitle}>Request data</h3>
            <p style={styles.aboutText}>
              Know of a dataset you'd like to see here? Contact me for pricing.
            </p>
            <a href="mailto:foster.brett.m@gmail.com" style={styles.subscribeLink}>
              foster.brett.m@gmail.com
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #222', padding: isMobile ? '16px' : '20px 48px', maxWidth: '900px', fontSize: '12px', color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <a href="/about" style={{ color: '#666', textDecoration: 'none' }}>About</a>
          <a href="/privacy" style={{ color: '#666', textDecoration: 'none' }}>Privacy Policy</a>
        </div>
        <span>aggrgtr 2026</span>
      </footer>
    </main>
  )
}

const styles = {
  main: {
    minHeight: '100vh',
    background: '#0a0a0a',
    color: '#e5e5e5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  nav: {
    position: 'sticky',
    top: 0,
    background: 'rgba(10, 10, 10, 0.8)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid #1a1a1a',
    zIndex: 100,
  },
  navInner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 32px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  logo: {
    fontSize: '18px',
    fontWeight: '600',
    letterSpacing: '-0.5px',
    color: '#e5e5e5',
    textDecoration: 'none',
  },
  navLinks: {
    display: 'flex',
    gap: '24px',
    alignItems: 'center',
  },
  navLink: {
    color: '#888',
    textDecoration: 'none',
    fontSize: '14px',
    transition: 'color 0.2s',
  },
  hero: {
    padding: '80px 32px 40px',
  },
  h1: {
    fontSize: '36px',
    fontWeight: '600',
    letterSpacing: '-1px',
    lineHeight: '1.2',
    marginBottom: '10px',
    color: '#fff',
  },
  subtitle: {
    fontSize: '16px',
    color: '#ccc',
    lineHeight: '1.6',
    margin: 0,
  },
  filterSection: {
    padding: '0 32px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  filterBar: {
    display: 'flex',
    gap: '8px',
    borderBottom: '1px solid #1a1a1a',
    paddingBottom: '16px',
  },
  filterBtn: {
    background: 'transparent',
    border: '1px solid #2a2a2a',
    color: '#666',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  filterActive: {
    background: '#1a1a1a',
    border: '1px solid #333',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  section: {
    padding: '32px 32px 64px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  dataGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
  },
  dataCard: {
    background: '#111',
    border: '1px solid #1a1a1a',
    borderRadius: '8px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: '200px',
    transition: 'border-color 0.2s',
  },
  cardTop: {
    flex: 1,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    gap: '8px',
  },
  cardTitle: {
    fontSize: '15px',
    fontWeight: '600',
    margin: 0,
    color: '#fff',
  },
  badgeLive: {
    fontSize: '10px',
    background: '#052e16',
    color: '#4ade80',
    padding: '3px 8px',
    borderRadius: '4px',
    fontWeight: '500',
  },
  badgeComing: {
    fontSize: '10px',
    background: '#1a1a1a',
    color: '#999',
    padding: '3px 8px',
    borderRadius: '4px',
    fontWeight: '500',
  },
  cardDesc: {
    fontSize: '13px',
    color: '#999',
    lineHeight: '1.5',
    marginBottom: '12px',
  },
  cardMeta: {
    display: 'flex',
    gap: '12px',
    fontSize: '12px',
    color: '#999',
  },
  cardBottom: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '16px',
    borderTop: '1px solid #1a1a1a',
    marginTop: '16px',
  },
  formatTag: {
    fontSize: '11px',
    color: '#999',
    fontFamily: 'monospace',
  },
  downloadBtn: {
    background: '#1a1a1a',
    border: '1px solid #333',
    color: '#fff',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  viewBtn: {
    background: '#052e16',
    border: '1px solid #166534',
    color: '#4ade80',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
    textDecoration: 'none',
  },
  notifyBtn: {
    background: 'transparent',
    border: '1px solid #2a2a2a',
    color: '#999',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  apiSoon: {
    fontSize: '12px',
    color: '#999',
  },
  aboutSection: {
    padding: '64px 32px',
    background: '#0f0f0f',
    borderTop: '1px solid #1a1a1a',
  },
  aboutGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '32px',
  },
  aboutCard: {
    padding: '0',
  },
  aboutTitle: {
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '12px',
    color: '#fff',
  },
  aboutText: {
    fontSize: '14px',
    color: '#ccc',
    lineHeight: '1.6',
    marginBottom: '16px',
  },
  form: {
    display: 'flex',
    gap: '8px',
  },
  input: {
    padding: '10px 14px',
    fontSize: '14px',
    border: '1px solid #2a2a2a',
    borderRadius: '6px',
    flex: 1,
    background: '#0a0a0a',
    color: '#fff',
    outline: 'none',
  },
  submitBtn: {
    background: '#fff',
    color: '#0a0a0a',
    padding: '10px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    border: 'none',
    cursor: 'pointer',
  },
  successMsg: {
    color: '#4ade80',
    fontSize: '14px',
  },
  subscribeLink: {
    color: '#4ade80',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
  },
  footer: {
    padding: '32px',
    textAlign: 'center',
    fontSize: '13px',
    color: '#333',
  },
}
