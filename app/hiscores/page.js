'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import useSWR from 'swr'

// Compact hour formatter: 8a, 12p, 2a
const fmtHourShort = (h) => {
  if (h === 0 || h === 24) return '12a'
  if (h === 12) return '12p'
  return h < 12 ? `${h}a` : `${h - 12}p`
}

// Compact number formatter for mobile axis labels
const fmtK = (v) => {
  if (v >= 1000000) return (v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1) + 'M'
  if (v >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'K'
  return v.toString()
}

const VW = 900    // viewBox width (desktop)
const MVW = 470   // viewBox width (mobile) — matches 375:280 container ratio
const VH = 350    // viewBox height

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

  const refreshInterval = 3 * 60 * 1000

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
    const chartStartPct = chartLeft / chartVW
    const chartEndPct = chartRight / chartVW
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

    if (viewMode === 'all_monthly' || viewMode === 'all_weekly') {
      // Label every other month (Feb, Apr, Jun, Aug, Oct, Dec)
      const biMonths = [1, 3, 5, 7, 9, 11] // JS month indices
      const result = []
      const seen = new Set()
      for (let i = 0; i < chartData.length; i++) {
        const d = chartData[i]
        const m = d.timestamp.getUTCMonth()
        const y = d.timestamp.getUTCFullYear()
        const key = `${y}-${m}`
        if (biMonths.includes(m) && !seen.has(key)) {
          seen.add(key)
          result.push({ index: i, text: monthNames[m] + " '" + y.toString().slice(-2) })
        }
      }
      // Always include the most recent month so current data is labeled
      const lastPt = chartData[chartData.length - 1]
      const lastM = lastPt.timestamp.getUTCMonth()
      const lastY = lastPt.timestamp.getUTCFullYear()
      const lastKey = `${lastY}-${lastM}`
      if (!seen.has(lastKey)) {
        result.push({ index: chartData.length - 1, text: monthNames[lastM] + " '" + lastY.toString().slice(-2) })
      }
      return result
    }

    // For live view, anchor labels to actual hour boundaries
    if (viewMode === 'live') {
      let lastHour = -1
      for (let i = 0; i < chartData.length; i++) {
        const h = chartData[i].timestamp.getHours()
        if (h !== lastHour) {
          const hr = h % 12 || 12
          const ampm = h < 12 ? ' AM' : ' PM'
          labels.push({ index: i, text: isMobile ? fmtHourShort(h) : hr + ampm })
          lastHour = h
        }
      }
      return labels
    }

    // For week view, anchor labels to actual day boundaries (every day)
    if (viewMode === 'week') {
      let lastDate = -1
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      for (let i = 0; i < chartData.length; i++) {
        const d = chartData[i].timestamp
        const date = d.getDate()
        if (date !== lastDate) {
          labels.push({ index: i, text: date + ' ' + dayNames[d.getDay()] })
          lastDate = date
        }
      }
      return labels
    }

    // For month view, anchor labels to actual day boundaries
    if (viewMode === 'month') {
      let lastDate = -1
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      for (let i = 0; i < chartData.length; i++) {
        const d = chartData[i].timestamp
        const date = d.getDate()
        if (date !== lastDate) {
          labels.push({ index: i, text: monthNames[d.getMonth()] + ' ' + date })
          lastDate = date
        }
      }
      return labels
    }

    const count = 6
    for (let i = 0; i < count; i++) {
      const idx = Math.floor((i / (count - 1)) * (chartData.length - 1))
      const d = chartData[idx]
      const text = d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

  const chartVW = isMobile ? MVW : VW
  const chartLeft = isMobile ? 50 : 50
  const chartRight = isMobile ? MVW - 12 : 888
  const chartWidth = chartRight - chartLeft

  const getY = (val) => 310 - ((val - minVal) / (maxVal - minVal)) * 295

  const formatYLabel = (val) => {
    // Round to nice numbers based on magnitude
    const abs = Math.abs(val)
    let rounded
    if (abs >= 100000) rounded = Math.round(val / 10000) * 10000
    else if (abs >= 10000) rounded = Math.round(val / 1000) * 1000
    else if (abs >= 1000) rounded = Math.round(val / 100) * 100
    else rounded = Math.round(val / 10) * 10
    return isMobile ? fmtK(rounded) : rounded.toLocaleString()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
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
              <a href="/hiscores" style={{ background: '#222', border: 'none', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '600' }}>Hiscores Counts</a>
              <a href="/rs-trends" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Trends</a>
              <a href="/osrs-worlds" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>OSRS Worlds</a>
              <a href="/blog" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Blog</a>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: isMobile ? '16px' : '24px 20px' }}>
          <h1 style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '600', letterSpacing: '-1px', color: '#fff', margin: '0 0 8px 0' }}>RS3 Hiscores Tracker</h1>
          <p style={{ fontSize: isMobile ? '14px' : '16px', color: '#fff', margin: '0 0 6px 0' }}>RS3 accounts that gained XP — {viewMode === 'all_monthly' ? 'monthly totals' : viewMode === 'all_weekly' ? 'weekly totals' : viewMode === 'month' ? 'daily peak (30 days)' : viewMode === 'week' ? 'daily peak' : 'current week running count'}</p>

          {loading ? (
            <div style={{ color: '#fff', padding: '40px', textAlign: 'center' }}>Loading...</div>
          ) : error ? (
            <div style={{ color: '#ff4444', padding: '40px', textAlign: 'center' }}>Error: {error?.message || 'Failed to load data'}</div>
          ) : (
            <>
              {/* KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '10px' }}>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px 12px' : '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '500', color: '#fff', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>Current Week</div>
                  <div style={{ fontSize: isMobile ? '22px' : '28px', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums', fontWeight: '700', color: '#4ade80' }}>{summary.current_week_total?.toLocaleString() || '-'}</div>
                  <div style={{ fontSize: isMobile ? '11px' : '13px', color: '#fff', marginTop: '6px' }}>Accounts with XP gain</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px 12px' : '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '500', color: '#fff', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>Last Week</div>
                  <div style={{ fontSize: isMobile ? '22px' : '28px', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums', fontWeight: '700', color: '#fff' }}>{summary.last_week_total?.toLocaleString() || '-'}</div>
                  <div style={{ fontSize: isMobile ? '11px' : '13px', color: '#fff', marginTop: '6px' }}>{summary.last_week_label || ''}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px 12px' : '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '500', color: '#fff', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>Current Month</div>
                  <div style={{ fontSize: isMobile ? '22px' : '28px', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums', fontWeight: '700', color: '#c084fc' }}>{summary.current_month_total?.toLocaleString() || '-'}</div>
                  <div style={{ fontSize: isMobile ? '11px' : '13px', color: '#fff', marginTop: '6px' }}>{summary.current_month_label || ''}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px 12px' : '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '500', color: '#fff', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>Last Month</div>
                  <div style={{ fontSize: isMobile ? '22px' : '28px', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums', fontWeight: '700', color: '#60a5fa' }}>{summary.last_month_total?.toLocaleString() || '-'}</div>
                  <div style={{ fontSize: isMobile ? '11px' : '13px', color: '#fff', marginTop: '6px' }}>{summary.last_month_label || ''}</div>
                </div>
              </div>

              {/* Chart */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px' : '12px 16px', marginBottom: isMobile ? '8px' : '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: isMobile ? '8px' : '12px', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '12px' : '0' }}>
                  <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: 0 }}>
                    Active Accounts
                  </h2>
                  <div style={{ display: 'flex', gap: '4px', background: '#1a1a1a', borderRadius: '8px', padding: '3px', flexWrap: 'wrap' }}>
                    {viewModes.map(mode => (
                      <button
                        key={mode.id}
                        onClick={() => setViewMode(mode.id)}
                        style={{
                          background: viewMode === mode.id ? '#333' : 'transparent',
                          border: viewMode === mode.id ? '1px solid #555' : '1px solid #333',
                          color: viewMode === mode.id ? '#fff' : '#ddd',
                          padding: isMobile ? '8px 14px' : '8px 18px',
                          borderRadius: '6px',
                          fontSize: isMobile ? '13px' : '15px',
                          cursor: 'pointer',
                          fontWeight: viewMode === mode.id ? '600' : '400'
                        }}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  ref={chartRef}
                  style={{ height: isMobile ? '320px' : '420px', position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => { setHoveredPoint(null); setHoveredIndex(-1) }}
                  onTouchMove={handleTouchMove}
                  onTouchStart={(e) => { if (e.touches && e.touches[0]) handleInteraction(e.touches[0].clientX, e.touches[0].clientY) }}
                  onTouchEnd={() => { setHoveredPoint(null); setHoveredIndex(-1) }}
                >
                  {chartData.length > 0 && (
                    <svg width="100%" height="100%" viewBox={`0 0 ${chartVW} ${(isMobile && (viewMode === 'week' || viewMode === 'month' || viewMode === 'all_weekly' || viewMode === 'all_monthly')) ? VH + 30 : VH}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                      {/* Time period bands */}
                      {(() => {
                        const bands = getTimeBands()
                        const n = chartData.length - 1 || 1
                        return bands.map((band, i) => {
                          // For single-point bands (daily data), extend to fill the gap
                          const rawX1 = band.start / n
                          const rawX2 = band.end / n
                          const prevEnd = i > 0 ? bands[i - 1].end / n : rawX1
                          const nextStart = i < bands.length - 1 ? bands[i + 1].start / n : rawX2
                          const x1 = chartLeft + (band.start === band.end
                            ? Math.max(0, (rawX1 + prevEnd) / 2) * chartWidth
                            : rawX1 * chartWidth)
                          const x2 = chartLeft + (band.start === band.end
                            ? Math.min(1, (rawX2 + nextStart) / 2) * chartWidth
                            : rawX2 * chartWidth)
                          // For first/last single-point bands, extend to chart edge
                          const finalX1 = i === 0 ? chartLeft : x1
                          const finalX2 = i === bands.length - 1 ? chartLeft + chartWidth : x2
                          return (
                            <rect
                              key={i}
                              x={finalX1}
                              y={15}
                              width={finalX2 - finalX1}
                              height={295}
                              fill={i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)'}
                            />
                          )
                        })
                      })()}

                      {/* Y-axis grid and labels */}
                      {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                        const val = minVal + pct * (maxVal - minVal)
                        return (
                          <g key={pct}>
                            <line x1={chartLeft} y1={310 - pct * 295} x2={chartRight} y2={310 - pct * 295} stroke="#333" strokeWidth="1" />
                            <text x={chartLeft - 5} y={315 - pct * 295} fill="#ffffff" fontSize={isMobile ? '18' : '11'} textAnchor="end" style={{ fontFamily: 'monospace' }}>{formatYLabel(Math.round(val))}</text>
                          </g>
                        )
                      })}

                      {/* X-axis labels */}
                      {(() => {
                        const allLabels = getXAxisLabels()
                        const isAngled = (viewMode === 'all_weekly' || viewMode === 'all_monthly') || (isMobile && (viewMode === 'week' || viewMode === 'month' || viewMode === 'live'))
                        const minGap = isAngled ? (isMobile ? 25 : 35) : isMobile ? 90 : 55
                        const visible = []
                        let lastX = -Infinity
                        for (const label of allLabels) {
                          const x = chartLeft + (label.index / (chartData.length - 1 || 1)) * chartWidth
                          if (x - lastX >= minGap) {
                            visible.push({ ...label, x })
                            lastX = x
                          }
                        }
                        // Always show the last label (current period)
                        if (allLabels.length > 0) {
                          const last = allLabels[allLabels.length - 1]
                          const lastLabelX = chartLeft + (last.index / (chartData.length - 1 || 1)) * chartWidth
                          const alreadyShown = visible.length > 0 && visible[visible.length - 1].index === last.index
                          if (!alreadyShown) {
                            // Use tighter gap for forced last label so nearby labels (e.g. Jan + Feb) can coexist
                            const lastGap = isAngled ? minGap * 0.5 : minGap
                            if (visible.length > 0 && lastLabelX - visible[visible.length - 1].x < lastGap) {
                              visible.pop()
                            }
                            visible.push({ ...last, x: lastLabelX })
                          }
                        }
                        return visible
                      })().map((label, i, arr) => {
                        const isAngled = (viewMode === 'all_weekly' || viewMode === 'all_monthly') || (isMobile && (viewMode === 'week' || viewMode === 'month' || viewMode === 'live'))
                        return (
                          <text
                            key={i}
                            x={label.x}
                            y={isAngled ? 325 : 335}
                            fill="#ffffff"
                            fontSize={isAngled ? (isMobile ? '14' : '10') : isMobile ? '18' : '12'}
                            fontWeight="bold"
                            textAnchor={isAngled ? 'end' : i === arr.length - 1 ? 'end' : 'middle'}
                            transform={isAngled ? `rotate(-45, ${label.x}, 325)` : undefined}
                          >
                            {label.text}
                          </text>
                        )
                      })}

                      {/* Area fill */}
                      <path
                        d={`M ${chartLeft},310 ${chartData.map((d, i) => `L ${chartLeft + (i / (chartData.length - 1 || 1)) * chartWidth},${getY(d.total)}`).join(' ')} L ${chartRight},310 Z`}
                        fill="rgba(74, 222, 128, 0.15)"
                      />
                      {/* Line */}
                      <path
                        d={`M ${chartData.map((d, i) => `${chartLeft + (i / (chartData.length - 1 || 1)) * chartWidth},${getY(d.total)}`).join(' L ')}`}
                        fill="none"
                        stroke="#4ade80"
                        strokeWidth="2"
                      />

                      {/* Hover indicator */}
                      {hoveredPoint && hoveredIndex >= 0 && (() => {
                        const x = chartLeft + (hoveredIndex / (chartData.length - 1 || 1)) * chartWidth
                        return (
                          <>
                            <line x1={x} y1={15} x2={x} y2={310} stroke="#fff" strokeWidth="1" strokeDasharray="4" />
                            <circle cx={x} cy={getY(hoveredPoint.total)} r="6" fill="#4ade80" />
                          </>
                        )
                      })()}
                    </svg>
                  )}

                  {chartData.length === 0 && !loading && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff' }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '10px' }}>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '8px 12px' : '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '500', color: '#fff', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>Peak Weekly</div>
                  <div style={{ fontSize: isMobile ? '18px' : '20px', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums', fontWeight: '700', color: '#4ade80' }}>{summary.peak_weekly?.toLocaleString() || '-'}</div>
                  <div style={{ fontSize: '12px', color: '#fff', marginTop: '2px', lineHeight: '1.2' }}>{summary.peak_weekly_label || '-'}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '8px 12px' : '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '500', color: '#fff', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>Peak Monthly</div>
                  <div style={{ fontSize: isMobile ? '18px' : '20px', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums', fontWeight: '700', color: '#60a5fa' }}>{summary.peak_monthly?.toLocaleString() || '-'}</div>
                  <div style={{ fontSize: '12px', color: '#fff', marginTop: '2px', lineHeight: '1.2' }}>{summary.peak_monthly_label || '-'}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '8px 12px' : '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '500', color: '#fff', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>4-Week Avg</div>
                  <div style={{ fontSize: isMobile ? '18px' : '20px', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums', fontWeight: '700', color: '#4ade80' }}>{summary.avg_4week?.toLocaleString() || '-'}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '8px 12px' : '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '500', color: '#fff', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>12-Month Avg</div>
                  <div style={{ fontSize: isMobile ? '18px' : '20px', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums', fontWeight: '700', color: '#60a5fa' }}>{summary.avg_12month?.toLocaleString() || '-'}</div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <footer style={{ borderTop: '1px solid #222', padding: '16px 32px', fontSize: '13px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <a href="/about" style={{ color: '#fff', textDecoration: 'none' }}>About</a>
          <a href="/privacy" style={{ color: '#fff', textDecoration: 'none' }}>Privacy Policy</a>
        </div>
        <span>aggrgtr 2026 — Not affiliated with Jagex Ltd.</span>
      </footer>
    </div>
  )
}