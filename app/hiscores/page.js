'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import useSWR from 'swr'

const viewModes = [
  { id: 'live', label: 'Live (24h)' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'all_weekly', label: 'All Time (Weekly)' },
  { id: 'all_monthly', label: 'All Time (Monthly)' },
]

export default function Hiscores() {
  const [viewMode, setViewMode] = useState('live')
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const [hoveredIndex, setHoveredIndex] = useState(-1)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [isMobile, setIsMobile] = useState(false)
  const chartRef = useRef(null)

  const refreshInterval = viewMode === 'live' ? 3 * 60 * 1000 : (viewMode === 'week' || viewMode === 'month') ? 15 * 60 * 1000 : 60 * 60 * 1000

  const { data: apiData, error } = useSWR(
    `/api/rs-hiscores?view=${viewMode}`,
    { refreshInterval }
  )

  const loading = !apiData
  const rows = apiData?.rows || []
  const summary = apiData?.summary || {}

  const chartData = useMemo(() => {
    return rows.map(r => ({
      timestamp: new Date(r.timestamp * 1000),
      total: r.total_accounts,
    }))
  }, [rows])

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const maxVal = useMemo(() => {
    if (chartData.length === 0) return 1
    const max = Math.max(...chartData.map(d => d.total))
    return max * 1.05
  }, [chartData])

  const minVal = useMemo(() => {
    if (chartData.length === 0) return 0
    return Math.min(...chartData.map(d => d.total)) * 0.95
  }, [chartData])

  const handleInteraction = (clientX, clientY) => {
    if (!chartRef.current || chartData.length === 0) return
    const rect = chartRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const chartWidth = rect.width
    const chartStartPct = 60 / 900
    const chartEndPct = 880 / 900
    const chartAreaWidth = chartWidth * (chartEndPct - chartStartPct)
    const chartAreaStart = chartWidth * chartStartPct
    const relativeX = x - chartAreaStart
    const pct = Math.max(0, Math.min(1, relativeX / chartAreaWidth))
    const dataIndex = Math.round(pct * (chartData.length - 1))
    const clampedIndex = Math.max(0, Math.min(chartData.length - 1, dataIndex))
    setHoveredPoint(chartData[clampedIndex])
    setHoveredIndex(clampedIndex)
    setMousePos({ x: clientX, y: clientY })
  }

  const handleMouseMove = (e) => handleInteraction(e.clientX, e.clientY)
  const handleTouchMove = (e) => {
    if (e.touches && e.touches[0]) {
      e.preventDefault()
      handleInteraction(e.touches[0].clientX, e.touches[0].clientY)
    }
  }

  const getXAxisLabels = () => {
    if (chartData.length === 0) return []
    const labels = []

    // Use UTC for year/all views (monthly/weekly data stored as midnight UTC dates)
    const utcOpts = { timeZone: 'UTC' }
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    if (viewMode === 'all_monthly') {
      const allMonths = []
      const seenMonths = new Set()
      for (let i = 0; i < chartData.length; i++) {
        const d = chartData[i]
        const monthKey = `${d.timestamp.getUTCFullYear()}-${d.timestamp.getUTCMonth()}`
        if (!seenMonths.has(monthKey)) {
          seenMonths.add(monthKey)
          const text = monthNames[d.timestamp.getUTCMonth()] + " '" + d.timestamp.getUTCFullYear().toString().slice(-2)
          allMonths.push({ index: i, text })
        }
      }
      const maxLabels = 16
      if (allMonths.length <= maxLabels) return allMonths
      const result = []
      for (let i = 0; i < maxLabels; i++) {
        const idx = Math.floor((i / (maxLabels - 1)) * (allMonths.length - 1))
        result.push(allMonths[idx])
      }
      return result
    }

    if (viewMode === 'all_weekly') {
      const allMonths = []
      const seenMonths = new Set()
      for (let i = 0; i < chartData.length; i++) {
        const d = chartData[i]
        const monthKey = `${d.timestamp.getUTCFullYear()}-${d.timestamp.getUTCMonth()}`
        if (!seenMonths.has(monthKey)) {
          seenMonths.add(monthKey)
          const text = monthNames[d.timestamp.getUTCMonth()] + " '" + d.timestamp.getUTCFullYear().toString().slice(-2)
          allMonths.push({ index: i, text })
        }
      }
      const maxLabels = 16
      if (allMonths.length <= maxLabels) return allMonths
      const result = []
      for (let i = 0; i < maxLabels; i++) {
        const idx = Math.floor((i / (maxLabels - 1)) * (allMonths.length - 1))
        result.push(allMonths[idx])
      }
      return result
    }

    const count = viewMode === 'month' ? 8 : 6
    for (let i = 0; i < count; i++) {
      const idx = Math.floor((i / (count - 1)) * (chartData.length - 1))
      const d = chartData[idx]
      let text
      if (viewMode === 'live') {
        text = d.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      } else if (viewMode === 'week') {
        text = d.timestamp.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
      } else {
        text = d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      }
      labels.push({ index: idx, text })
    }
    return labels
  }

  const getTimeBands = () => {
    if (chartData.length === 0) return []
    const bands = []
    let currentBandStart = 0
    let currentKey = null

    for (let i = 0; i < chartData.length; i++) {
      const d = chartData[i]
      let key
      if (viewMode === 'all_monthly') {
        key = d.timestamp.getUTCFullYear()
      } else if (viewMode === 'all_weekly') {
        key = `${d.timestamp.getUTCFullYear()}-${d.timestamp.getUTCMonth()}`
      } else if (viewMode === 'month') {
        // Band by week number
        const dayOfYear = Math.floor((d.timestamp - new Date(d.timestamp.getFullYear(), 0, 0)) / 86400000)
        key = `${d.timestamp.getFullYear()}-W${Math.floor(dayOfYear / 7)}`
      } else if (viewMode === 'week') {
        key = d.timestamp.toISOString().split('T')[0]
      } else if (viewMode === 'live') {
        key = d.timestamp.getHours()
      }

      if (currentKey === null) {
        currentKey = key
      } else if (key !== currentKey) {
        bands.push({ start: currentBandStart, end: i - 1, key: currentKey })
        currentBandStart = i
        currentKey = key
      }
    }
    bands.push({ start: currentBandStart, end: chartData.length - 1, key: currentKey })
    return bands
  }

  const getY = (val) => 310 - ((val - minVal) / (maxVal - minVal)) * 270

  const formatYLabel = (val) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`
    if (val >= 1000) return `${Math.round(val / 1000)}k`
    return val.toString()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid #222', padding: '16px 32px', display: 'flex', justifyContent: 'space-between' }}>
        <a href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: '600', fontSize: '18px' }}>aggrgtr</a>
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
              <a href="/hiscores" style={{ background: '#222', border: 'none', color: '#fff', padding: isMobile ? '8px 12px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '13px' : '16px', textDecoration: 'none', fontWeight: '600' }}>Hiscores</a>
            </div>
          </div>
          <div style={{ marginBottom: isMobile ? '0' : '16px' }}>
            {!isMobile && <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Time Range</div>}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '4px', flexWrap: 'wrap' }}>
              {viewModes.map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setViewMode(mode.id)}
                  style={{
                    background: viewMode === mode.id ? '#1a1a1a' : 'transparent',
                    border: viewMode === mode.id ? '1px solid #333' : '1px solid transparent',
                    color: viewMode === mode.id ? '#e5e5e5' : '#888',
                    padding: isMobile ? '8px 12px' : '8px 10px',
                    borderRadius: '6px',
                    fontSize: isMobile ? '13px' : '14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontWeight: viewMode === mode.id ? '500' : '400'
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          {!isMobile && <div style={{ fontSize: '11px', color: '#666', marginTop: '24px' }}>Unique accounts that gained XP. Scraped from RS3 hiscores every 3 minutes.</div>}
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: isMobile ? '16px' : '24px 20px' }}>
          <h1 style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '600', letterSpacing: '-1px', color: '#fff', margin: '0 0 8px 0' }}>RS3 Hiscores Tracker</h1>
          <p style={{ fontSize: isMobile ? '14px' : '16px', color: '#666', margin: isMobile ? '0 0 16px 0' : '0 0 32px 0' }}>RS3 accounts that gained XP — {viewMode === 'all_monthly' ? 'monthly totals' : viewMode === 'all_weekly' ? 'weekly totals' : viewMode === 'month' ? 'daily peak (30 days)' : viewMode === 'week' ? 'daily peak' : 'current week running count'}</p>

          {loading ? (
            <div style={{ color: '#fff', padding: '40px', textAlign: 'center' }}>Loading...</div>
          ) : error ? (
            <div style={{ color: '#ff4444', padding: '40px', textAlign: 'center' }}>Error: {error?.message || 'Failed to load data'}</div>
          ) : (
            <>
              {/* KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? '8px' : '16px', marginBottom: isMobile ? '16px' : '40px' }}>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: '700', color: '#fff', marginBottom: isMobile ? '6px' : '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Current Week</div>
                  <div style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '700', color: '#4ade80' }}>{summary.current_total?.toLocaleString() || '-'}</div>
                  <div style={{ fontSize: isMobile ? '11px' : '13px', color: '#888', marginTop: '6px' }}>Accounts with XP gain</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: '700', color: '#fff', marginBottom: isMobile ? '6px' : '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Current Month</div>
                  <div style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '700', color: '#c084fc' }}>{summary.current_month_total?.toLocaleString() || '-'}</div>
                  <div style={{ fontSize: isMobile ? '11px' : '13px', color: '#888', marginTop: '6px' }}>{summary.current_month_label || ''}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: '700', color: '#fff', marginBottom: isMobile ? '6px' : '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Last Week</div>
                  <div style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '700', color: '#fff' }}>{summary.last_week_total?.toLocaleString() || '-'}</div>
                  <div style={{ fontSize: isMobile ? '11px' : '13px', color: '#888', marginTop: '6px' }}>{summary.last_week_label || ''}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: '700', color: '#fff', marginBottom: isMobile ? '6px' : '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Week High</div>
                  <div style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '700', color: '#60a5fa' }}>{summary.week_high?.toLocaleString() || '-'}</div>
                  <div style={{ fontSize: isMobile ? '11px' : '13px', color: '#888', marginTop: '6px' }}>Peak this week</div>
                </div>
              </div>

              {/* Chart */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '28px', marginBottom: isMobile ? '16px' : '40px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '12px' : '20px' }}>
                  <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: 0 }}>
                    Active Accounts - {viewModes.find(m => m.id === viewMode)?.label}
                  </h2>
                </div>

                <div
                  ref={chartRef}
                  style={{ height: isMobile ? '280px' : '420px', position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => { setHoveredPoint(null); setHoveredIndex(-1) }}
                  onTouchMove={handleTouchMove}
                  onTouchStart={(e) => { if (e.touches && e.touches[0]) handleInteraction(e.touches[0].clientX, e.touches[0].clientY) }}
                  onTouchEnd={() => { setHoveredPoint(null); setHoveredIndex(-1) }}
                >
                  {chartData.length > 0 && (
                    <svg width="100%" height="100%" viewBox="0 0 900 350" preserveAspectRatio="none">
                      {/* Time period bands */}
                      {getTimeBands().map((band, i) => {
                        const x1 = 60 + (band.start / (chartData.length - 1 || 1)) * 820
                        const x2 = 60 + (band.end / (chartData.length - 1 || 1)) * 820
                        return (
                          <rect
                            key={i}
                            x={x1}
                            y={40}
                            width={x2 - x1}
                            height={270}
                            fill={i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)'}
                          />
                        )
                      })}

                      {/* Y-axis grid and labels */}
                      {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                        const val = minVal + pct * (maxVal - minVal)
                        return (
                          <g key={pct}>
                            <line x1="60" y1={310 - pct * 270} x2="880" y2={310 - pct * 270} stroke="#333" strokeWidth="1" />
                            <text x="55" y={315 - pct * 270} fill="#ffffff" fontSize="12" textAnchor="end">{formatYLabel(Math.round(val))}</text>
                          </g>
                        )
                      })}

                      {/* X-axis labels */}
                      {(() => {
                        const allLabels = getXAxisLabels()
                        const minGap = 55
                        const visible = []
                        let lastX = -Infinity
                        for (const label of allLabels) {
                          const x = 60 + (label.index / (chartData.length - 1 || 1)) * 820
                          if (x - lastX >= minGap) {
                            visible.push({ ...label, x })
                            lastX = x
                          }
                        }
                        return visible
                      })().map((label, i) => (
                        <text
                          key={i}
                          x={label.x}
                          y={335}
                          fill="#ffffff"
                          fontSize="12"
                          textAnchor="middle"
                        >
                          {label.text}
                        </text>
                      ))}

                      {/* Area fill */}
                      <path
                        d={`M 60,310 ${chartData.map((d, i) => `L ${60 + (i / (chartData.length - 1 || 1)) * 820},${getY(d.total)}`).join(' ')} L ${60 + 820},310 Z`}
                        fill="rgba(74, 222, 128, 0.15)"
                      />
                      {/* Line */}
                      <path
                        d={`M ${chartData.map((d, i) => `${60 + (i / (chartData.length - 1 || 1)) * 820},${getY(d.total)}`).join(' L ')}`}
                        fill="none"
                        stroke="#4ade80"
                        strokeWidth="2"
                      />

                      {/* Hover indicator */}
                      {hoveredPoint && hoveredIndex >= 0 && (() => {
                        const x = 60 + (hoveredIndex / (chartData.length - 1 || 1)) * 820
                        return (
                          <>
                            <line x1={x} y1={40} x2={x} y2={310} stroke="#fff" strokeWidth="1" strokeDasharray="4" />
                            <circle cx={x} cy={getY(hoveredPoint.total)} r="6" fill="#4ade80" />
                          </>
                        )
                      })()}
                    </svg>
                  )}

                  {chartData.length === 0 && !loading && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
                      No data available for this time range
                    </div>
                  )}

                  {/* Tooltip */}
                  {hoveredPoint && (() => {
                    const tooltipWidth = 180
                    const tooltipHeight = 80
                    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 800
                    const spaceOnRight = screenWidth - mousePos.x
                    const spaceOnBottom = screenHeight - mousePos.y
                    const left = spaceOnRight < tooltipWidth + 30 ? mousePos.x - tooltipWidth - 15 : mousePos.x + 15
                    const top = spaceOnBottom < tooltipHeight + 20 ? mousePos.y - tooltipHeight : mousePos.y - 40
                    return (
                      <div style={{
                        position: 'fixed',
                        left,
                        top,
                        background: '#1a1a1a',
                        border: '1px solid #444',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        zIndex: 1000,
                        pointerEvents: 'none',
                        minWidth: '160px'
                      }}>
                        <div style={{ fontSize: '13px', color: '#fff', marginBottom: '8px', fontWeight: '600', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
                          {(viewMode === 'all_monthly' || viewMode === 'all_weekly')
                            ? hoveredPoint.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
                            : hoveredPoint.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {viewMode === 'live' && ` ${hoveredPoint.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                        </div>
                        <div style={{ fontSize: '14px', color: '#fff' }}>
                          <span style={{ color: '#4ade80', fontWeight: '700' }}>Accounts:</span> {hoveredPoint.total.toLocaleString()}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Summary stats */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(2, 1fr)', gap: isMobile ? '8px' : '24px', marginBottom: isMobile ? '8px' : '20px' }}>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '11px' : '14px', color: '#fff', marginBottom: isMobile ? '4px' : '8px', fontWeight: '600' }}>Peak Weekly</div>
                  <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: '700', color: '#4ade80' }}>{summary.peak_weekly?.toLocaleString() || '-'}</div>
                  <div style={{ fontSize: isMobile ? '10px' : '12px', color: '#888', marginTop: '4px' }}>{summary.peak_weekly_label || '-'}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '11px' : '14px', color: '#fff', marginBottom: isMobile ? '4px' : '8px', fontWeight: '600' }}>Peak Monthly</div>
                  <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: '700', color: '#60a5fa' }}>{summary.peak_monthly?.toLocaleString() || '-'}</div>
                  <div style={{ fontSize: isMobile ? '10px' : '12px', color: '#888', marginTop: '4px' }}>{summary.peak_monthly_label || '-'}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(2, 1fr)', gap: isMobile ? '8px' : '24px' }}>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '11px' : '14px', color: '#fff', marginBottom: isMobile ? '4px' : '8px', fontWeight: '600' }}>4-Week Avg</div>
                  <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: '700', color: '#4ade80' }}>{summary.avg_4week?.toLocaleString() || '-'}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '11px' : '14px', color: '#fff', marginBottom: isMobile ? '4px' : '8px', fontWeight: '600' }}>12-Month Avg</div>
                  <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: '700', color: '#60a5fa' }}>{summary.avg_12month?.toLocaleString() || '-'}</div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <footer style={{ borderTop: '1px solid #222', padding: '24px 32px', fontSize: '12px', color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <a href="/about" style={{ color: '#666', textDecoration: 'none' }}>About</a>
          <a href="/privacy" style={{ color: '#666', textDecoration: 'none' }}>Privacy Policy</a>
        </div>
        <span>aggrgtr 2026 — Not affiliated with Jagex Ltd.</span>
      </footer>
    </div>
  )
}