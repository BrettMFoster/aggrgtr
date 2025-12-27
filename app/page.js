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

  const datasets = [
    {
      id: 'rs-population',
      title: 'RuneScape Population',
      category: 'gaming',
      status: 'live',
      desc: 'Live player counts for OSRS and RS3. Updated every 3 minutes from official sources.',
      stats: ['3-min intervals', 'Per-world data'],
      link: '/rs-population'
    },
    {
      id: 'fbi',
      title: 'FBI Crime Statistics',
      category: 'government',
      status: 'live',
      desc: 'Violent and property crime from FBI NIBRS. Agency, county, and state level data.',
      stats: ['13,000+ agencies', '2020-2024'],
      link: '/fbi-crime'
    },
    {
      id: 'census',
      title: 'Census Demographics',
      category: 'government',
      status: 'available',
      desc: 'Population, income, age distribution, housing. County, tract, and ZIP level.',
      stats: ['All US geographies', '100+ variables']
    },
    {
      id: 'schools',
      title: 'School District Data',
      category: 'government',
      status: 'coming',
      desc: 'Test scores, graduation rates, student-teacher ratios, per-pupil spending.',
      stats: ['13,000+ districts', '20+ metrics']
    },
  ]


  return (
    <main style={styles.main}>
      {/* Navigation */}
      <nav style={{ borderBottom: '1px solid #222', padding: isMobile ? '12px 16px' : '16px 32px', display: 'flex', justifyContent: 'space-between' }}>
        <a href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: '600', fontSize: isMobile ? '16px' : '18px' }}>aggrgtr</a>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <a href="https://paypal.me/aggrgtr" target="_blank" rel="noopener" style={{ color: '#4ade80', textDecoration: 'none', fontWeight: '500' }}>Donate</a>
          <a href="/subscribe" style={{ color: '#fff', textDecoration: 'none' }}>Subscribe</a>
          <a href="#" style={{ color: '#fff', textDecoration: 'none' }}>GitHub</a>
        </div>
      </nav>

      {/* Hero - minimal */}
      <section style={{ ...styles.hero, padding: isMobile ? '40px 16px 20px' : '80px 32px 40px' }}>
        <h1 style={{ ...styles.h1, fontSize: isMobile ? '24px' : '36px' }}>Open datasets, cleaned and documented</h1>
        <p style={styles.subtitle}>
          Public data from government sources and live APIs.
          Download directly or access via API.
        </p>
      </section>


      {/* Data Catalog */}
      <section id="datasets" style={{ ...styles.section, padding: isMobile ? '16px 16px 32px' : '32px 32px 64px' }}>
        <div style={{ ...styles.dataGrid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {datasets.map(dataset => (
            <div key={dataset.id} style={styles.dataCard}>
              <div style={styles.cardTop}>
                <div style={styles.cardHeader}>
                  <h3 style={styles.cardTitle}>{dataset.title}</h3>
                  {dataset.status === 'live' && <span style={styles.badgeLive}>Live</span>}
                  {dataset.status === 'coming' && <span style={styles.badgeComing}>Coming Soon</span>}
                </div>
                <p style={styles.cardDesc}>{dataset.desc}</p>
                <div style={styles.cardMeta}>
                  {dataset.stats.map((stat, i) => (
                    <span key={i}>{stat}</span>
                  ))}
                </div>
              </div>
              <div style={styles.cardBottom}>
                {dataset.link ? (
                  <a href={dataset.link} style={styles.viewBtn}>View Dashboard</a>
                ) : dataset.status === 'available' ? (
                  <span style={styles.apiSoon}>API Coming Soon</span>
                ) : (
                  <button style={styles.notifyBtn}>Notify Me</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* About / Updates */}
      <section id="about" style={{ ...styles.aboutSection, padding: isMobile ? '32px 16px' : '64px 32px' }}>
        <div style={{ ...styles.aboutGrid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))' }}>
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
      <footer style={{ borderTop: '1px solid #222', padding: isMobile ? '16px' : '24px 32px', fontSize: '12px', color: '#999', textAlign: 'right' }}>
        aggrgtr 2025
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
    maxWidth: '700px',
    margin: '0 auto',
    textAlign: 'center',
  },
  h1: {
    fontSize: '36px',
    fontWeight: '600',
    letterSpacing: '-1px',
    lineHeight: '1.2',
    marginBottom: '16px',
    color: '#fff',
  },
  subtitle: {
    fontSize: '16px',
    color: '#999',
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
    maxWidth: '800px',
    margin: '0 auto',
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
    color: '#999',
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
