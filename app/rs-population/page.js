'use client'
import { useState, useEffect } from 'react'

const SHEETS_URL = 'https://docs.google.com/spreadsheets/d/1VmFRFnLJyAh5wD6DXIJPfX-bTxrg_ouzg4NJEzsBZUs/gviz/tq?tqx=out:json'

export default function RSPopulation() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [timeRange, setTimeRange] = useState('24h')

  useEffect(() => {
    fetchData()
    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const parseSheetData = (text) => {
    const jsonStr = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/)?.[1]
    if (!jsonStr) return []

    const json = JSON.parse(jsonStr)
    const rows = json.table.rows

    return rows.map(row => {
      // Handle different date formats from Google Sheets
      let timestamp
      const dateVal = row.c[0]?.v
      const dateFormatted = row.c[0]?.f

      if (typeof dateVal === 'string' && dateVal.startsWith('Date(')) {
        // Google Sheets Date(year,month,day,hour,min,sec) format
        const parts = dateVal.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/)
        if (parts) {
          timestamp = new Date(parts[1], parts[2], parts[3], parts[4] || 0, parts[5] || 0, parts[6] || 0)
        }
      } else if (dateVal) {
        timestamp = new Date(dateVal)
      } else if (dateFormatted) {
        timestamp = new Date(dateFormatted)
      }

      return {
        timestamp,
        osrs: row.c[1]?.v || 0,
        rs3: row.c[2]?.v || 0,
        total: row.c[3]?.v || 0
      }
    }).filter(d => d.timestamp && !isNaN(d.timestamp.getTime()))
  }

  const fetchData = async () => {
    try {
      // Fetch both Historical (daily) and Data (15-min) sheets in parallel
      const [historicalRes, liveRes] = await Promise.all([
        fetch(SHEETS_URL + '&sheet=Historical'),
        fetch(SHEETS_URL + '&sheet=Data')
      ])

      const [historicalText, liveText] = await Promise.all([
        historicalRes.text(),
        liveRes.text()
      ])

      const historicalData = parseSheetData(historicalText)
      const liveData = parseSheetData(liveText)

      // Combine: historical data first, then live data
      // Historical has daily data, live has 15-min data
      // Dedupe by keeping live data when timestamps overlap
      const combined = [...historicalData]

      // Find the latest historical timestamp
      const latestHistorical = historicalData.length > 0
        ? Math.max(...historicalData.map(d => d.timestamp.getTime()))
        : 0

      // Add live data that's newer than historical
      for (const point of liveData) {
        if (point.timestamp.getTime() > latestHistorical) {
          combined.push(point)
        }
      }

      // Sort by timestamp
      combined.sort((a, b) => a.timestamp - b.timestamp)

      setData(combined)
      setLoading(false)
    } catch (err) {
      console.error('Fetch error:', err)
      setError(err.message)
      setLoading(false)
    }
  }

  const filterData = () => {
    if (data.length === 0) return []
    const now = new Date()
    const cutoffs = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      'all': Infinity
    }
    const cutoff = now.getTime() - cutoffs[timeRange]
    return data.filter(d => d.timestamp.getTime() > cutoff)
  }

  const filteredData = filterData()
  const latest = filteredData[filteredData.length - 1]
  const maxTotal = Math.max(...filteredData.map(d => d.total), 1)

  // Calculate stats
  const avgTotal = filteredData.length > 0
    ? Math.round(filteredData.reduce((sum, d) => sum + d.total, 0) / filteredData.length)
    : 0
  const peakTotal = Math.max(...filteredData.map(d => d.total), 0)
  const peakTime = filteredData.find(d => d.total === peakTotal)?.timestamp

  return (
    <main style={styles.main}>
      <nav style={styles.nav}>
        <div style={styles.navInner}>
          <a href="/" style={styles.logo}>aggrgtr</a>
          <div style={styles.navLinks}>
            <a href="/" style={styles.navLink}>Datasets</a>
            <a href="/rs-population" style={styles.navLinkActive}>RS Population</a>
          </div>
        </div>
      </nav>

      <section style={styles.header}>
        <h1 style={styles.h1}>RuneScape Population Tracker</h1>
        <p style={styles.subtitle}>
          Live player counts for Old School RuneScape and RuneScape 3. Updated every 15 minutes.
        </p>
      </section>

      {loading ? (
        <div style={styles.loading}>Loading data...</div>
      ) : error ? (
        <div style={styles.error}>Error: {error}</div>
      ) : (
        <>
          {/* Current Stats */}
          <section style={styles.statsSection}>
            <div style={styles.statsGrid}>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>OSRS Players</div>
                <div style={styles.statValue}>{latest?.osrs?.toLocaleString() || '-'}</div>
                <div style={styles.statGame}>Old School</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>RS3 Players</div>
                <div style={styles.statValue}>{latest?.rs3?.toLocaleString() || '-'}</div>
                <div style={styles.statGame}>RuneScape 3</div>
              </div>
              <div style={{...styles.statCard, ...styles.statCardTotal}}>
                <div style={styles.statLabel}>Total Online</div>
                <div style={styles.statValueLarge}>{latest?.total?.toLocaleString() || '-'}</div>
                <div style={styles.statTime}>
                  {latest?.timestamp ? `Updated ${formatTime(latest.timestamp)}` : ''}
                </div>
              </div>
            </div>
          </section>

          {/* Time Range Filters */}
          <section style={styles.filterSection}>
            <div style={styles.filterBar}>
              {['1h', '24h', '7d', '30d', 'all'].map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  style={timeRange === range ? styles.filterActive : styles.filterBtn}
                >
                  {range === 'all' ? 'All Time' : range}
                </button>
              ))}
            </div>
          </section>

          {/* Chart */}
          <section style={styles.chartSection}>
            <div style={styles.chartContainer}>
              <div style={styles.chartHeader}>
                <h3 style={styles.chartTitle}>Player Count Over Time</h3>
                <div style={styles.chartLegend}>
                  <span style={styles.legendOsrs}>OSRS</span>
                  <span style={styles.legendRs3}>RS3</span>
                </div>
              </div>
              <div style={styles.chart}>
                {filteredData.length > 0 ? (
                  <svg viewBox={`0 0 800 300`} style={styles.svg}>
                    {/* Grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map(pct => (
                      <g key={pct}>
                        <line
                          x1="60" y1={280 - pct * 250}
                          x2="790" y2={280 - pct * 250}
                          stroke="#222" strokeWidth="1"
                        />
                        <text x="55" y={285 - pct * 250} fill="#555" fontSize="10" textAnchor="end">
                          {Math.round(maxTotal * pct / 1000)}k
                        </text>
                      </g>
                    ))}

                    {/* OSRS area */}
                    <path
                      d={generatePath(filteredData, 'osrs', maxTotal, 800, 300)}
                      fill="rgba(74, 222, 128, 0.1)"
                      stroke="#4ade80"
                      strokeWidth="2"
                    />

                    {/* RS3 area */}
                    <path
                      d={generatePath(filteredData, 'rs3', maxTotal, 800, 300)}
                      fill="rgba(96, 165, 250, 0.1)"
                      stroke="#60a5fa"
                      strokeWidth="2"
                    />
                  </svg>
                ) : (
                  <div style={styles.noData}>No data for selected range</div>
                )}
              </div>
            </div>
          </section>

          {/* Summary Stats */}
          <section style={styles.summarySection}>
            <div style={styles.summaryGrid}>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>Average ({timeRange})</div>
                <div style={styles.summaryValue}>{avgTotal.toLocaleString()}</div>
              </div>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>Peak ({timeRange})</div>
                <div style={styles.summaryValue}>{peakTotal.toLocaleString()}</div>
                {peakTime && (
                  <div style={styles.summaryMeta}>{formatDateTime(peakTime)}</div>
                )}
              </div>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>Data Points</div>
                <div style={styles.summaryValue}>{filteredData.length}</div>
              </div>
            </div>
          </section>

          {/* Data Source */}
          <section style={styles.sourceSection}>
            <p style={styles.sourceText}>
              Data scraped from official RuneScape world list pages every 15 minutes.
              OSRS data from individual worlds. RS3 calculated from homepage total.
            </p>
            <a
              href="https://docs.google.com/spreadsheets/d/1VmFRFnLJyAh5wD6DXIJPfX-bTxrg_ouzg4NJEzsBZUs"
              target="_blank"
              rel="noopener noreferrer"
              style={styles.sourceLink}
            >
              View Raw Data in Google Sheets
            </a>
          </section>
        </>
      )}

      <footer style={styles.footer}>
        <p>aggrgtr © 2025</p>
      </footer>
    </main>
  )
}

function generatePath(data, key, max, width, height) {
  if (data.length === 0) return ''

  const points = data.map((d, i) => {
    const x = 60 + (i / (data.length - 1 || 1)) * 730
    const y = 280 - (d[key] / max) * 250
    return `${x},${y}`
  })

  return `M ${points.join(' L ')}`
}

function formatTime(date) {
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatDateTime(date) {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
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
  },
  navLinkActive: {
    color: '#fff',
    textDecoration: 'none',
    fontSize: '14px',
  },
  header: {
    padding: '60px 32px 40px',
    maxWidth: '800px',
    margin: '0 auto',
    textAlign: 'center',
  },
  h1: {
    fontSize: '32px',
    fontWeight: '600',
    letterSpacing: '-1px',
    marginBottom: '12px',
    color: '#fff',
  },
  subtitle: {
    fontSize: '15px',
    color: '#666',
    lineHeight: '1.6',
    margin: 0,
  },
  loading: {
    textAlign: 'center',
    padding: '80px 32px',
    color: '#666',
  },
  error: {
    textAlign: 'center',
    padding: '80px 32px',
    color: '#ef4444',
  },
  statsSection: {
    padding: '0 32px 32px',
    maxWidth: '900px',
    margin: '0 auto',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
  },
  statCard: {
    background: '#111',
    border: '1px solid #1a1a1a',
    borderRadius: '8px',
    padding: '24px',
    textAlign: 'center',
  },
  statCardTotal: {
    background: '#0f1a0f',
    borderColor: '#1a2a1a',
  },
  statLabel: {
    fontSize: '12px',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  },
  statValue: {
    fontSize: '28px',
    fontWeight: '600',
    color: '#fff',
  },
  statValueLarge: {
    fontSize: '36px',
    fontWeight: '600',
    color: '#4ade80',
  },
  statGame: {
    fontSize: '12px',
    color: '#555',
    marginTop: '4px',
  },
  statTime: {
    fontSize: '11px',
    color: '#4a4',
    marginTop: '4px',
  },
  filterSection: {
    padding: '0 32px',
    maxWidth: '900px',
    margin: '0 auto 24px',
  },
  filterBar: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
  },
  filterBtn: {
    background: 'transparent',
    border: '1px solid #2a2a2a',
    color: '#666',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
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
  chartSection: {
    padding: '0 32px 32px',
    maxWidth: '900px',
    margin: '0 auto',
  },
  chartContainer: {
    background: '#111',
    border: '1px solid #1a1a1a',
    borderRadius: '8px',
    padding: '24px',
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  chartTitle: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#fff',
    margin: 0,
  },
  chartLegend: {
    display: 'flex',
    gap: '16px',
    fontSize: '12px',
  },
  legendOsrs: {
    color: '#4ade80',
  },
  legendRs3: {
    color: '#60a5fa',
  },
  chart: {
    height: '300px',
    position: 'relative',
  },
  svg: {
    width: '100%',
    height: '100%',
  },
  noData: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#555',
  },
  summarySection: {
    padding: '0 32px 32px',
    maxWidth: '900px',
    margin: '0 auto',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
  },
  summaryCard: {
    background: '#111',
    border: '1px solid #1a1a1a',
    borderRadius: '8px',
    padding: '20px',
    textAlign: 'center',
  },
  summaryLabel: {
    fontSize: '12px',
    color: '#666',
    marginBottom: '8px',
  },
  summaryValue: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#fff',
  },
  summaryMeta: {
    fontSize: '11px',
    color: '#555',
    marginTop: '4px',
  },
  sourceSection: {
    padding: '32px',
    maxWidth: '900px',
    margin: '0 auto',
    textAlign: 'center',
    borderTop: '1px solid #1a1a1a',
  },
  sourceText: {
    fontSize: '13px',
    color: '#555',
    marginBottom: '12px',
  },
  sourceLink: {
    fontSize: '13px',
    color: '#4ade80',
    textDecoration: 'none',
  },
  footer: {
    padding: '32px',
    textAlign: 'center',
    fontSize: '13px',
    color: '#333',
  },
}
