'use client'
import { useState, useEffect } from 'react'

export default function RSPopulation() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [viewMode, setViewMode] = useState('live') // live, day, week, month, year, all
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    fetchData()
    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const fetchData = async () => {
    try {
      // Fetch both Historical (daily) and Data (15-min) from our API proxy
      const [historicalRes, liveRes] = await Promise.all([
        fetch('/api/rs-data?sheet=Historical'),
        fetch('/api/rs-data?sheet=Data')
      ])

      const [historicalJson, liveJson] = await Promise.all([
        historicalRes.json(),
        liveRes.json()
      ])

      const historicalData = (historicalJson.rows || []).map(r => ({
        ...r,
        timestamp: new Date(r.timestamp)
      }))
      const liveData = (liveJson.rows || []).map(r => ({
        ...r,
        timestamp: new Date(r.timestamp)
      }))

      // Combine: historical data first, then live data
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

  const getFilteredData = () => {
    if (data.length === 0) return []
    const now = new Date()

    const cutoffs = {
      'live': 24 * 60 * 60 * 1000,        // Last 24 hours (15-min resolution)
      'day': 24 * 60 * 60 * 1000,
      'week': 7 * 24 * 60 * 60 * 1000,
      'month': 30 * 24 * 60 * 60 * 1000,
      'year': 365 * 24 * 60 * 60 * 1000,
      'all': Infinity
    }

    const cutoff = now.getTime() - cutoffs[viewMode]
    let filtered = data.filter(d => d.timestamp.getTime() > cutoff)

    // For longer time ranges, aggregate to reduce data points
    if (viewMode === 'month' || viewMode === 'year' || viewMode === 'all') {
      filtered = aggregateByDay(filtered)
    } else if (viewMode === 'week') {
      // Keep hourly for week view
      filtered = aggregateByHour(filtered)
    }

    return filtered
  }

  const aggregateByDay = (data) => {
    const byDay = {}
    for (const point of data) {
      const dayKey = point.timestamp.toISOString().split('T')[0]
      if (!byDay[dayKey]) {
        byDay[dayKey] = { osrs: [], rs3: [], total: [] }
      }
      byDay[dayKey].osrs.push(point.osrs)
      byDay[dayKey].rs3.push(point.rs3)
      byDay[dayKey].total.push(point.total)
    }

    return Object.entries(byDay).map(([day, values]) => ({
      timestamp: new Date(day),
      osrs: Math.round(values.osrs.reduce((a, b) => a + b, 0) / values.osrs.length),
      rs3: Math.round(values.rs3.reduce((a, b) => a + b, 0) / values.rs3.length),
      total: Math.round(values.total.reduce((a, b) => a + b, 0) / values.total.length)
    })).sort((a, b) => a.timestamp - b.timestamp)
  }

  const aggregateByHour = (data) => {
    const byHour = {}
    for (const point of data) {
      const hourKey = point.timestamp.toISOString().slice(0, 13)
      if (!byHour[hourKey]) {
        byHour[hourKey] = { osrs: [], rs3: [], total: [] }
      }
      byHour[hourKey].osrs.push(point.osrs)
      byHour[hourKey].rs3.push(point.rs3)
      byHour[hourKey].total.push(point.total)
    }

    return Object.entries(byHour).map(([hour, values]) => ({
      timestamp: new Date(hour + ':00:00Z'),
      osrs: Math.round(values.osrs.reduce((a, b) => a + b, 0) / values.osrs.length),
      rs3: Math.round(values.rs3.reduce((a, b) => a + b, 0) / values.rs3.length),
      total: Math.round(values.total.reduce((a, b) => a + b, 0) / values.total.length)
    })).sort((a, b) => a.timestamp - b.timestamp)
  }

  const filteredData = getFilteredData()
  const latest = data[data.length - 1]
  const maxTotal = Math.max(...filteredData.map(d => d.total), 1)
  const maxOsrs = Math.max(...filteredData.map(d => d.osrs), 1)

  // Calculate stats
  const avgTotal = filteredData.length > 0
    ? Math.round(filteredData.reduce((sum, d) => sum + d.total, 0) / filteredData.length)
    : 0
  const peakTotal = Math.max(...filteredData.map(d => d.total), 0)
  const peakOsrs = Math.max(...filteredData.map(d => d.osrs), 0)
  const peakRs3 = Math.max(...filteredData.map(d => d.rs3), 0)

  const viewModes = [
    { id: 'live', label: 'Live (24h)' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' },
    { id: 'all', label: 'All (2013+)' }
  ]

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

      <div style={isMobile ? styles.pageContainerMobile : styles.pageContainer}>
        {/* Sidebar */}
        <aside style={isMobile ? styles.sidebarMobile : styles.sidebar}>
          <div style={styles.sidebarSection}>
            <h3 style={styles.sidebarTitle}>Time Range</h3>
            <div style={isMobile ? styles.sidebarNavMobile : styles.sidebarNav}>
              {viewModes.map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setViewMode(mode.id)}
                  style={viewMode === mode.id ?
                    (isMobile ? styles.sidebarBtnActiveMobile : styles.sidebarBtnActive) :
                    (isMobile ? styles.sidebarBtnMobile : styles.sidebarBtn)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {!isMobile && (
            <div style={styles.sidebarSection}>
              <h3 style={styles.sidebarTitle}>Data Source</h3>
              <p style={styles.sidebarText}>
                Scraped from official RuneScape pages every 15 minutes.
              </p>
            </div>
          )}

          {!isMobile && latest && (
            <div style={styles.sidebarSection}>
              <h3 style={styles.sidebarTitle}>Last Update</h3>
              <p style={styles.sidebarText}>
                {formatDateTime(latest.timestamp)}
              </p>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <div style={isMobile ? styles.contentMobile : styles.content}>
          <header style={styles.header}>
            <h1 style={styles.h1}>RuneScape Population Tracker</h1>
            <p style={styles.subtitle}>
              Live player counts for Old School RuneScape and RuneScape 3
            </p>
          </header>

          {loading ? (
            <div style={styles.loading}>Loading data...</div>
          ) : error ? (
            <div style={styles.error}>Error: {error}</div>
          ) : (
            <>
              {/* Current Stats */}
              <section style={styles.statsSection}>
                <div style={isMobile ? styles.statsGridMobile : styles.statsGrid}>
                  <div style={styles.statCard}>
                    <div style={styles.statLabel}>OSRS Players</div>
                    <div style={styles.statValueOsrs}>{latest?.osrs?.toLocaleString() || '-'}</div>
                    <div style={styles.statGame}>Old School RuneScape</div>
                  </div>
                  <div style={styles.statCard}>
                    <div style={styles.statLabel}>RS3 Players</div>
                    <div style={styles.statValueRs3}>{latest?.rs3?.toLocaleString() || '-'}</div>
                    <div style={styles.statGame}>RuneScape 3</div>
                  </div>
                  <div style={{...styles.statCard, ...styles.statCardTotal}}>
                    <div style={styles.statLabel}>Total Online</div>
                    <div style={styles.statValueLarge}>{latest?.total?.toLocaleString() || '-'}</div>
                    <div style={styles.statTime}>
                      {latest?.timestamp ? formatTime(latest.timestamp) : ''}
                    </div>
                  </div>
                </div>
              </section>

              {/* Chart */}
              <section style={styles.chartSection}>
                <div style={styles.chartContainer}>
                  <div style={styles.chartHeader}>
                    <h3 style={styles.chartTitle}>
                      Player Count - {viewModes.find(m => m.id === viewMode)?.label}
                    </h3>
                    <div style={styles.chartLegend}>
                      <span style={styles.legendOsrs}>OSRS</span>
                      <span style={styles.legendRs3}>RS3</span>
                    </div>
                  </div>
                  <div style={styles.chart}>
                    {filteredData.length > 0 ? (
                      <svg viewBox="0 0 900 350" style={styles.svg} preserveAspectRatio="none">
                        {/* Grid lines */}
                        {[0, 0.25, 0.5, 0.75, 1].map(pct => (
                          <g key={pct}>
                            <line
                              x1="50" y1={320 - pct * 280}
                              x2="890" y2={320 - pct * 280}
                              stroke="#222" strokeWidth="1"
                            />
                            <text x="45" y={325 - pct * 280} fill="#fff" fontSize="14" fontWeight="600" textAnchor="end">
                              {Math.round(maxOsrs * pct / 1000)}k
                            </text>
                          </g>
                        ))}

                        {/* X-axis labels */}
                        {getXAxisLabels(filteredData, viewMode).map((label, i, arr) => (
                          <text
                            key={i}
                            x={50 + (label.index / (filteredData.length - 1 || 1)) * 840}
                            y={340}
                            fill="#fff"
                            fontSize="14"
                            fontWeight="600"
                            textAnchor="middle"
                          >
                            {label.text}
                          </text>
                        ))}

                        {/* OSRS area fill */}
                        <path
                          d={generateAreaPath(filteredData, 'osrs', maxOsrs, 900, 350)}
                          fill="rgba(74, 222, 128, 0.15)"
                        />

                        {/* RS3 area fill */}
                        <path
                          d={generateAreaPath(filteredData, 'rs3', maxOsrs, 900, 350)}
                          fill="rgba(96, 165, 250, 0.15)"
                        />

                        {/* OSRS line */}
                        <path
                          d={generateLinePath(filteredData, 'osrs', maxOsrs, 900, 350)}
                          fill="none"
                          stroke="#4ade80"
                          strokeWidth="2"
                        />

                        {/* RS3 line */}
                        <path
                          d={generateLinePath(filteredData, 'rs3', maxOsrs, 900, 350)}
                          fill="none"
                          stroke="#60a5fa"
                          strokeWidth="2"
                        />

                        {/* Invisible overlay for hover detection */}
                        <rect
                          x="50" y="40" width="840" height="280"
                          fill="transparent"
                          style={{ cursor: 'crosshair', pointerEvents: 'all' }}
                          onMouseMove={(e) => {
                            const svg = e.currentTarget.closest('svg')
                            const svgRect = svg.getBoundingClientRect()
                            const chartContainer = svg.parentElement.getBoundingClientRect()
                            const mouseX = e.clientX - svgRect.left
                            const scaleX = 900 / svgRect.width
                            const relX = mouseX * scaleX
                            const dataIndex = Math.round(((relX - 50) / 840) * (filteredData.length - 1))
                            const clampedIndex = Math.max(0, Math.min(filteredData.length - 1, dataIndex))
                            const d = filteredData[clampedIndex]
                            if (d) {
                              setHoveredPoint(d)
                              // Position tooltip relative to container
                              const tooltipX = Math.min(e.clientX - chartContainer.left, chartContainer.width - 180)
                              const tooltipY = e.clientY - chartContainer.top
                              setTooltipPos({ x: Math.max(10, tooltipX), y: Math.max(10, tooltipY - 80) })
                            }
                          }}
                          onMouseLeave={() => setHoveredPoint(null)}
                        />
                        {/* Show hover indicator */}
                        {hoveredPoint && (() => {
                          const i = filteredData.indexOf(hoveredPoint)
                          const x = 50 + (i / (filteredData.length - 1 || 1)) * 840
                          const yOsrs = 320 - (hoveredPoint.osrs / maxOsrs) * 280
                          const yRs3 = 320 - (hoveredPoint.rs3 / maxOsrs) * 280
                          return (
                            <>
                              <line x1={x} y1={40} x2={x} y2={320} stroke="#fff" strokeWidth="1" strokeDasharray="4" />
                              <circle cx={x} cy={yOsrs} r="5" fill="#4ade80" />
                              <circle cx={x} cy={yRs3} r="5" fill="#60a5fa" />
                            </>
                          )
                        })()}
                      </svg>

                      {/* Tooltip */}
                      {hoveredPoint && (
                        <div style={{
                          ...styles.tooltip,
                          left: tooltipPos.x + 10,
                          top: tooltipPos.y - 60
                        }}>
                          <div style={styles.tooltipDate}>
                            {hoveredPoint.timestamp.toLocaleDateString('en-US', {
                              weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                            })}
                            {(viewMode === 'live' || viewMode === 'day' || viewMode === 'week') &&
                              ` ${hoveredPoint.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                            }
                          </div>
                          <div style={styles.tooltipRow}>
                            <span style={styles.tooltipOsrs}>OSRS:</span> {hoveredPoint.osrs.toLocaleString()}
                          </div>
                          <div style={styles.tooltipRow}>
                            <span style={styles.tooltipRs3}>RS3:</span> {hoveredPoint.rs3.toLocaleString()}
                          </div>
                          <div style={styles.tooltipTotal}>
                            Total: {hoveredPoint.total.toLocaleString()}
                          </div>
                        </div>
                      )}
                    ) : (
                      <div style={styles.noData}>No data for selected range</div>
                    )}
                  </div>
                </div>
              </section>

              {/* Stats Summary */}
              <section style={styles.summarySection}>
                <div style={isMobile ? styles.summaryGridMobile : styles.summaryGrid}>
                  <div style={styles.summaryCard}>
                    <div style={styles.summaryLabel}>Average Total</div>
                    <div style={styles.summaryValue}>{avgTotal.toLocaleString()}</div>
                  </div>
                  <div style={styles.summaryCard}>
                    <div style={styles.summaryLabel}>Peak OSRS</div>
                    <div style={styles.summaryValueOsrs}>{peakOsrs.toLocaleString()}</div>
                  </div>
                  <div style={styles.summaryCard}>
                    <div style={styles.summaryLabel}>Peak RS3</div>
                    <div style={styles.summaryValueRs3}>{peakRs3.toLocaleString()}</div>
                  </div>
                  <div style={styles.summaryCard}>
                    <div style={styles.summaryLabel}>Data Points</div>
                    <div style={styles.summaryValue}>{filteredData.length}</div>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      <footer style={styles.footer}>
        <p>aggrgtr 2025</p>
      </footer>
    </main>
  )
}

function generateLinePath(data, key, max, width, height) {
  if (data.length === 0) return ''

  const points = data.map((d, i) => {
    const x = 50 + (i / (data.length - 1 || 1)) * 840
    const y = 320 - (d[key] / max) * 280
    return `${x},${y}`
  })

  return `M ${points.join(' L ')}`
}

function generateAreaPath(data, key, max, width, height) {
  if (data.length === 0) return ''

  const points = data.map((d, i) => {
    const x = 50 + (i / (data.length - 1 || 1)) * 840
    const y = 320 - (d[key] / max) * 280
    return `${x},${y}`
  })

  const firstX = 50
  const lastX = 50 + 840

  return `M ${firstX},320 L ${points.join(' L ')} L ${lastX},320 Z`
}

function getXAxisLabels(data, viewMode) {
  if (data.length === 0) return []

  const labels = []
  const count = Math.min(6, data.length)

  for (let i = 0; i < count; i++) {
    const idx = Math.floor((i / (count - 1)) * (data.length - 1))
    const d = data[idx]

    let text
    if (viewMode === 'live' || viewMode === 'day') {
      text = d.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    } else if (viewMode === 'week') {
      text = d.timestamp.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    } else {
      text = d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    labels.push({ index: idx, text })
  }

  return labels
}

function formatTime(date) {
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Updated just now'
  if (mins < 60) return `Updated ${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Updated ${hours}h ago`
  return `Updated ${Math.floor(hours / 24)}d ago`
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
    background: 'rgba(10, 10, 10, 0.95)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid #1a1a1a',
    zIndex: 100,
  },
  navInner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 32px',
    maxWidth: '1400px',
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
    color: '#fff',
    textDecoration: 'none',
    fontSize: '14px',
  },
  navLinkActive: {
    color: '#fff',
    textDecoration: 'none',
    fontSize: '14px',
  },
  pageContainer: {
    display: 'flex',
    maxWidth: '1400px',
    margin: '0 auto',
    minHeight: 'calc(100vh - 120px)',
  },
  sidebar: {
    width: '220px',
    borderRight: '1px solid #1a1a1a',
    padding: '24px',
    flexShrink: 0,
  },
  sidebarSection: {
    marginBottom: '32px',
  },
  sidebarTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '12px',
  },
  sidebarNav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  sidebarBtn: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    padding: '10px 0',
    borderRadius: '6px',
    fontSize: '15px',
    cursor: 'pointer',
    textAlign: 'left',
  },
  sidebarBtnActive: {
    background: '#1a1a1a',
    border: 'none',
    color: '#fff',
    padding: '10px 12px',
    marginLeft: '-12px',
    borderRadius: '6px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    textAlign: 'left',
  },
  sidebarText: {
    fontSize: '14px',
    color: '#fff',
    lineHeight: '1.5',
    margin: '0 0 8px 0',
  },
  sidebarLink: {
    fontSize: '12px',
    color: '#4ade80',
    textDecoration: 'none',
  },
  content: {
    flex: 1,
    padding: '24px 32px',
    minWidth: 0,
  },
  header: {
    marginBottom: '32px',
  },
  h1: {
    fontSize: '42px',
    fontWeight: '700',
    letterSpacing: '-0.5px',
    marginBottom: '12px',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: '18px',
    color: '#ffffff',
    margin: 0,
  },
  loading: {
    textAlign: 'center',
    padding: '80px 32px',
    color: '#fff',
  },
  error: {
    textAlign: 'center',
    padding: '80px 32px',
    color: '#ef4444',
  },
  statsSection: {
    marginBottom: '24px',
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
    padding: '20px',
    textAlign: 'center',
  },
  statCardTotal: {
    background: 'linear-gradient(135deg, #0f1a0f 0%, #111 100%)',
    borderColor: '#1a2a1a',
  },
  statLabel: {
    fontSize: '16px',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '10px',
    fontWeight: '700',
  },
  statValueOsrs: {
    fontSize: '40px',
    fontWeight: '700',
    color: '#4ade80',
  },
  statValueRs3: {
    fontSize: '40px',
    fontWeight: '700',
    color: '#60a5fa',
  },
  statValueLarge: {
    fontSize: '48px',
    fontWeight: '700',
    color: '#fff',
  },
  statGame: {
    fontSize: '14px',
    color: '#fff',
    marginTop: '6px',
  },
  statTime: {
    fontSize: '14px',
    color: '#4ade80',
    marginTop: '6px',
  },
  chartSection: {
    marginBottom: '24px',
  },
  chartContainer: {
    background: '#111',
    border: '1px solid #1a1a1a',
    borderRadius: '8px',
    padding: '20px',
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  chartTitle: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#fff',
    margin: 0,
  },
  chartLegend: {
    display: 'flex',
    gap: '16px',
    fontSize: '16px',
  },
  legendOsrs: {
    color: '#4ade80',
  },
  legendRs3: {
    color: '#60a5fa',
  },
  chart: {
    height: '350px',
    position: 'relative',
    overflow: 'visible',
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
    color: '#fff',
  },
  summarySection: {
    marginBottom: '24px',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
  },
  summaryCard: {
    background: '#111',
    border: '1px solid #1a1a1a',
    borderRadius: '8px',
    padding: '16px',
    textAlign: 'center',
  },
  summaryLabel: {
    fontSize: '16px',
    color: '#fff',
    marginBottom: '8px',
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#fff',
  },
  summaryValueOsrs: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#4ade80',
  },
  summaryValueRs3: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#60a5fa',
  },
  footer: {
    padding: '24px',
    textAlign: 'center',
    fontSize: '12px',
    color: '#fff',
    borderTop: '1px solid #1a1a1a',
  },
  tooltip: {
    position: 'absolute',
    background: 'rgba(20, 20, 20, 0.95)',
    border: '1px solid #333',
    borderRadius: '6px',
    padding: '10px 12px',
    pointerEvents: 'none',
    zIndex: 10,
    minWidth: '140px',
  },
  tooltipDate: {
    fontSize: '14px',
    color: '#fff',
    marginBottom: '10px',
    borderBottom: '1px solid #444',
    paddingBottom: '8px',
    fontWeight: '600',
  },
  tooltipRow: {
    fontSize: '15px',
    color: '#fff',
    marginBottom: '6px',
  },
  tooltipOsrs: {
    color: '#4ade80',
    fontWeight: '700',
  },
  tooltipRs3: {
    color: '#60a5fa',
    fontWeight: '700',
  },
  tooltipTotal: {
    fontSize: '16px',
    color: '#fff',
    fontWeight: '700',
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid #444',
  },
  // Mobile styles
  pageContainerMobile: {
    display: 'flex',
    flexDirection: 'column',
    maxWidth: '100%',
    margin: '0 auto',
  },
  sidebarMobile: {
    width: '100%',
    borderRight: 'none',
    borderBottom: '1px solid #1a1a1a',
    padding: '16px',
  },
  contentMobile: {
    flex: 1,
    padding: '16px',
    minWidth: 0,
  },
  statsGridMobile: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '12px',
  },
  summaryGridMobile: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
  },
  sidebarNavMobile: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: '8px',
  },
  sidebarBtnMobile: {
    background: 'transparent',
    border: '1px solid #444',
    color: '#fff',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '15px',
    cursor: 'pointer',
  },
  sidebarBtnActiveMobile: {
    background: '#1a1a1a',
    border: '1px solid #444',
    color: '#fff',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
  },
}
