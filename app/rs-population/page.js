'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import useSWR from 'swr'

export default function RSPopulation() {
  const [viewMode, setViewMode] = useState('live')
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const [hoveredIndex, setHoveredIndex] = useState(-1)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [isMobile, setIsMobile] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const chartRef = useRef(null)

  // SWR for data fetching with caching
  const { data: historicalJson, error: historicalError } = useSWR(
    '/api/rs-data?sheet=Historical',
    { refreshInterval: 5 * 60 * 1000 }  // Auto-refresh every 5 minutes
  )
  const { data: liveJson, error: liveError } = useSWR(
    '/api/rs-data?sheet=Data',
    { refreshInterval: 5 * 60 * 1000 }  // Auto-refresh every 5 minutes
  )

  const loading = !historicalJson || !liveJson
  const error = historicalError || liveError

  // Process and combine data when it arrives
  const data = useMemo(() => {
    if (!historicalJson || !liveJson) return []

    const historicalData = (historicalJson.rows || []).map(r => ({
      ...r,
      timestamp: new Date(r.timestamp)
    }))
    const liveData = (liveJson.rows || []).map(r => ({
      ...r,
      timestamp: new Date(r.timestamp)
    }))

    const combined = [...historicalData]
    const latestHistorical = historicalData.length > 0
      ? Math.max(...historicalData.map(d => d.timestamp.getTime()))
      : 0

    for (const point of liveData) {
      if (point.timestamp.getTime() > latestHistorical) {
        combined.push(point)
      }
    }
    combined.sort((a, b) => a.timestamp - b.timestamp)
    return combined
  }, [historicalJson, liveJson])

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Get available years from data
  const getAvailableYears = () => {
    if (data.length === 0) return []
    const years = new Set()
    for (const d of data) {
      years.add(d.timestamp.getFullYear())
    }
    return Array.from(years).sort((a, b) => b - a) // newest first
  }

  // Get available months for selected year
  const getAvailableMonths = () => {
    if (data.length === 0) return []
    const months = new Set()
    for (const d of data) {
      if (d.timestamp.getFullYear() === selectedYear) {
        months.add(d.timestamp.getMonth())
      }
    }
    return Array.from(months).sort((a, b) => a - b)
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December']

  const getFilteredData = () => {
    if (data.length === 0) return []
    const now = new Date()
    let filtered

    if (viewMode === 'month') {
      // Filter to specific month/year with hourly granularity
      filtered = data.filter(d =>
        d.timestamp.getFullYear() === selectedYear &&
        d.timestamp.getMonth() === selectedMonth
      )
      filtered = aggregateByHour(filtered)
    } else if (viewMode === 'year') {
      // Filter to specific year
      filtered = data.filter(d => d.timestamp.getFullYear() === selectedYear)
      filtered = aggregateByDay(filtered)
    } else {
      // Original logic for live, week, all
      const cutoffs = {
        'live': 24 * 60 * 60 * 1000,
        'week': 7 * 24 * 60 * 60 * 1000,
        'all': Infinity
      }
      const cutoff = now.getTime() - cutoffs[viewMode]
      filtered = data.filter(d => d.timestamp.getTime() > cutoff)
      if (viewMode === 'all') {
        filtered = aggregateByDay(filtered)
      } else if (viewMode === 'week') {
        filtered = aggregateByHour(filtered)
      }
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
  const maxOsrs = Math.max(...filteredData.map(d => d.osrs), 1)
  const avgTotal = filteredData.length > 0
    ? Math.round(filteredData.reduce((sum, d) => sum + d.total, 0) / filteredData.length)
    : 0
  const peakOsrs = Math.max(...filteredData.map(d => d.osrs), 0)
  const peakRs3 = Math.max(...filteredData.map(d => d.rs3), 0)

  // Find peak dates
  const peakOsrsPoint = filteredData.find(d => d.osrs === peakOsrs)
  const peakRs3Point = filteredData.find(d => d.rs3 === peakRs3)
  const peakOsrsDate = peakOsrsPoint?.timestamp
  const peakRs3Date = peakRs3Point?.timestamp

  // Rolling averages from raw data - separate for OSRS and RS3
  const now = new Date()
  const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000
  const oneYearAgo = now.getTime() - 365 * 24 * 60 * 60 * 1000

  const last30Days = data.filter(d => d.timestamp.getTime() > thirtyDaysAgo)
  const lastYear = data.filter(d => d.timestamp.getTime() > oneYearAgo)

  const avg30DayOsrs = last30Days.length > 0
    ? Math.round(last30Days.reduce((sum, d) => sum + d.osrs, 0) / last30Days.length)
    : 0
  const avg30DayRs3 = last30Days.length > 0
    ? Math.round(last30Days.reduce((sum, d) => sum + d.rs3, 0) / last30Days.length)
    : 0
  const avgYearOsrs = lastYear.length > 0
    ? Math.round(lastYear.reduce((sum, d) => sum + d.osrs, 0) / lastYear.length)
    : 0
  const avgYearRs3 = lastYear.length > 0
    ? Math.round(lastYear.reduce((sum, d) => sum + d.rs3, 0) / lastYear.length)
    : 0

  const viewModes = [
    { id: 'live', label: 'Live (24h)' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' },
    { id: 'all', label: 'All Time' }
  ]

  const handleInteraction = (clientX, clientY) => {
    if (!chartRef.current || filteredData.length === 0) return
    const rect = chartRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const chartWidth = rect.width
    // Chart area starts at ~7% from left (60/900) and ends at ~98% (880/900)
    const chartStartPct = 60 / 900
    const chartEndPct = 880 / 900
    const chartAreaWidth = chartWidth * (chartEndPct - chartStartPct)
    const chartAreaStart = chartWidth * chartStartPct
    const relativeX = x - chartAreaStart
    const pct = Math.max(0, Math.min(1, relativeX / chartAreaWidth))
    const dataIndex = Math.round(pct * (filteredData.length - 1))
    const clampedIndex = Math.max(0, Math.min(filteredData.length - 1, dataIndex))
    setHoveredPoint(filteredData[clampedIndex])
    setHoveredIndex(clampedIndex)
    setMousePos({ x: clientX, y: clientY })
  }

  const handleMouseMove = (e) => {
    handleInteraction(e.clientX, e.clientY)
  }

  const handleTouchMove = (e) => {
    if (e.touches && e.touches[0]) {
      e.preventDefault()
      handleInteraction(e.touches[0].clientX, e.touches[0].clientY)
    }
  }

  const getXAxisLabels = () => {
    if (filteredData.length === 0) return []
    const labels = []

    if (viewMode === 'all') {
      // All Time: show months with years, evenly spaced
      const allMonths = []
      const seenMonths = new Set()
      for (let i = 0; i < filteredData.length; i++) {
        const d = filteredData[i]
        const monthKey = `${d.timestamp.getFullYear()}-${d.timestamp.getMonth()}`
        if (!seenMonths.has(monthKey)) {
          seenMonths.add(monthKey)
          const text = d.timestamp.toLocaleDateString('en-US', { month: 'short' }) + " '" + d.timestamp.getFullYear().toString().slice(-2)
          allMonths.push({ index: i, text })
        }
      }
      const maxLabels = 16
      if (allMonths.length <= maxLabels) {
        return allMonths
      }
      const result = []
      for (let i = 0; i < maxLabels; i++) {
        const idx = Math.floor((i / (maxLabels - 1)) * (allMonths.length - 1))
        result.push(allMonths[idx])
      }
      return result
    }

    if (viewMode === 'year') {
      // Year view: show months, skip first partial month to avoid collision
      const allMonths = []
      const seenMonths = new Set()
      for (let i = 0; i < filteredData.length; i++) {
        const d = filteredData[i]
        const monthKey = `${d.timestamp.getFullYear()}-${d.timestamp.getMonth()}`
        if (!seenMonths.has(monthKey)) {
          seenMonths.add(monthKey)
          const text = d.timestamp.toLocaleDateString('en-US', { month: 'short' }) + " '" + d.timestamp.getFullYear().toString().slice(-2)
          allMonths.push({ index: i, text })
        }
      }
      // Skip first month if it's partial (less than 10 data points before next month)
      let monthsToUse = allMonths
      if (allMonths.length > 1 && allMonths[0].index < 10) {
        monthsToUse = allMonths.slice(1)
      }
      const maxLabels = 12
      if (monthsToUse.length <= maxLabels) {
        return monthsToUse
      }
      const result = []
      for (let i = 0; i < maxLabels; i++) {
        const idx = Math.floor((i / (maxLabels - 1)) * (monthsToUse.length - 1))
        result.push(monthsToUse[idx])
      }
      return result
    }

    // For other views, use evenly spaced labels
    const count = 6
    for (let i = 0; i < count; i++) {
      const idx = Math.floor((i / (count - 1)) * (filteredData.length - 1))
      const d = filteredData[idx]
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
    if (filteredData.length === 0) return []
    const bands = []
    let currentBandStart = 0
    let currentKey = null

    for (let i = 0; i < filteredData.length; i++) {
      const d = filteredData[i]
      let key
      if (viewMode === 'all') {
        // Band by YEAR for all time view
        key = d.timestamp.getFullYear()
      } else if (viewMode === 'year') {
        // Band by MONTH for year view
        key = `${d.timestamp.getFullYear()}-${d.timestamp.getMonth()}`
      } else if (viewMode === 'week' || viewMode === 'month') {
        key = d.timestamp.toISOString().split('T')[0] // day
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
    // Push final band
    bands.push({ start: currentBandStart, end: filteredData.length - 1, key: currentKey })
    return bands
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
              <a href="/rs-population" style={{ background: '#222', border: 'none', color: '#fff', padding: isMobile ? '8px 12px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '13px' : '16px', textDecoration: 'none', fontWeight: '600' }}>Population</a>
              <a href="/osrs-worlds" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '8px 12px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '13px' : '16px', textDecoration: 'none', fontWeight: '400' }}>OSRS Worlds</a>
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
          {!isMobile && <div style={{ fontSize: '11px', color: '#666', marginTop: '24px' }}>Data scraped from official RuneScape pages every 3 minutes.</div>}
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: isMobile ? '16px' : '24px 20px' }}>
          <h1 style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '600', letterSpacing: '-1px', color: '#fff', margin: '0 0 8px 0' }}>RuneScape Population Tracker</h1>
          <p style={{ fontSize: isMobile ? '14px' : '16px', color: '#666', margin: isMobile ? '0 0 16px 0' : '0 0 32px 0' }}>Live player counts for OSRS and RS3</p>

          {loading ? (
            <div style={{ color: '#fff', padding: '40px', textAlign: 'center' }}>Loading...</div>
          ) : error ? (
            <div style={{ color: '#ff4444', padding: '40px', textAlign: 'center' }}>Error: {error?.message || 'Failed to load data'}</div>
          ) : (
            <>
              {/* KPI Cards - BIGGER */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? '12px' : '24px', marginBottom: isMobile ? '16px' : '40px' }}>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '16px' : '28px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '14px' : '18px', fontWeight: '700', color: '#fff', marginBottom: isMobile ? '8px' : '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>OSRS Players</div>
                  <div style={{ fontSize: isMobile ? '32px' : '48px', fontWeight: '700', color: '#4ade80' }}>{latest?.osrs?.toLocaleString() || '-'}</div>
                  <div style={{ fontSize: isMobile ? '12px' : '14px', color: '#fff', marginTop: '8px' }}>Old School RuneScape</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '16px' : '28px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '14px' : '18px', fontWeight: '700', color: '#fff', marginBottom: isMobile ? '8px' : '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>RS3 Players</div>
                  <div style={{ fontSize: isMobile ? '32px' : '48px', fontWeight: '700', color: '#60a5fa' }}>{latest?.rs3?.toLocaleString() || '-'}</div>
                  <div style={{ fontSize: isMobile ? '12px' : '14px', color: '#fff', marginTop: '8px' }}>RuneScape&nbsp;3</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '16px' : '28px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '14px' : '18px', fontWeight: '700', color: '#fff', marginBottom: isMobile ? '8px' : '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Online</div>
                  <div style={{ fontSize: isMobile ? '36px' : '56px', fontWeight: '700', color: '#fff' }}>{latest?.total?.toLocaleString() || '-'}</div>
                  <div style={{ fontSize: isMobile ? '12px' : '14px', color: '#4ade80', marginTop: '8px' }}>
                    {latest?.timestamp ? `Updated ${Math.floor((Date.now() - latest.timestamp.getTime()) / 60000)}m ago` : ''}
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '28px', marginBottom: isMobile ? '16px' : '40px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '12px' : '20px', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: 0 }}>
                      Player Count - {viewModes.find(m => m.id === viewMode)?.label}
                    </h2>
                    {/* Year dropdown for month and year views */}
                    {(viewMode === 'month' || viewMode === 'year') && (
                      <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        style={{
                          background: '#1a1a1a',
                          border: '1px solid #333',
                          color: '#fff',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          fontSize: '14px',
                          cursor: 'pointer'
                        }}
                      >
                        {getAvailableYears().map(year => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                    )}
                    {/* Month dropdown for month view */}
                    {viewMode === 'month' && (
                      <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                        style={{
                          background: '#1a1a1a',
                          border: '1px solid #333',
                          color: '#fff',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          fontSize: '14px',
                          cursor: 'pointer'
                        }}
                      >
                        {getAvailableMonths().map(month => (
                          <option key={month} value={month}>{monthNames[month]}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: isMobile ? '12px' : '16px', fontSize: isMobile ? '12px' : '14px' }}>
                    <span style={{ color: '#4ade80' }}>OSRS</span>
                    <span style={{ color: '#60a5fa' }}>RS3</span>
                  </div>
                </div>

                <div
                  ref={chartRef}
                  style={{ height: isMobile ? '280px' : '420px', position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => { setHoveredPoint(null); setHoveredIndex(-1); }}
                  onTouchMove={handleTouchMove}
                  onTouchStart={(e) => { if (e.touches && e.touches[0]) handleInteraction(e.touches[0].clientX, e.touches[0].clientY); }}
                  onTouchEnd={() => { setHoveredPoint(null); setHoveredIndex(-1); }}
                >
                  {filteredData.length > 0 && (
                    <svg width="100%" height="100%" viewBox="0 0 900 350" preserveAspectRatio="none">
                      {/* Time period bands */}
                      {getTimeBands().map((band, i) => {
                        const x1 = 60 + (band.start / (filteredData.length - 1 || 1)) * 820
                        const x2 = 60 + (band.end / (filteredData.length - 1 || 1)) * 820
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

                      {/* Y-axis grid and labels - WHITE */}
                      {[0, 0.25, 0.5, 0.75, 1].map(pct => (
                        <g key={pct}>
                          <line x1="60" y1={310 - pct * 270} x2="880" y2={310 - pct * 270} stroke="#333" strokeWidth="1" />
                          <text x="55" y={315 - pct * 270} fill="#ffffff" fontSize="12" textAnchor="end">{Math.round(maxOsrs * pct / 1000)}k</text>
                        </g>
                      ))}

                      {/* X-axis labels - WHITE */}
                      {getXAxisLabels().map((label, i) => (
                        <text
                          key={i}
                          x={60 + (label.index / (filteredData.length - 1 || 1)) * 820}
                          y={335}
                          fill="#ffffff"
                          fontSize="12"
                          textAnchor="middle"
                        >
                          {label.text}
                        </text>
                      ))}

                      {/* OSRS area */}
                      <path
                        d={`M 60,310 ${filteredData.map((d, i) => `L ${60 + (i / (filteredData.length - 1 || 1)) * 820},${310 - (d.osrs / maxOsrs) * 270}`).join(' ')} L ${60 + 820},310 Z`}
                        fill="rgba(74, 222, 128, 0.2)"
                      />
                      {/* OSRS line */}
                      <path
                        d={`M ${filteredData.map((d, i) => `${60 + (i / (filteredData.length - 1 || 1)) * 820},${310 - (d.osrs / maxOsrs) * 270}`).join(' L ')}`}
                        fill="none"
                        stroke="#4ade80"
                        strokeWidth="2"
                      />

                      {/* RS3 area */}
                      <path
                        d={`M 60,310 ${filteredData.map((d, i) => `L ${60 + (i / (filteredData.length - 1 || 1)) * 820},${310 - (d.rs3 / maxOsrs) * 270}`).join(' ')} L ${60 + 820},310 Z`}
                        fill="rgba(96, 165, 250, 0.2)"
                      />
                      {/* RS3 line */}
                      <path
                        d={`M ${filteredData.map((d, i) => `${60 + (i / (filteredData.length - 1 || 1)) * 820},${310 - (d.rs3 / maxOsrs) * 270}`).join(' L ')}`}
                        fill="none"
                        stroke="#60a5fa"
                        strokeWidth="2"
                      />

                      {/* Hover indicator */}
                      {hoveredPoint && hoveredIndex >= 0 && (() => {
                        const x = 60 + (hoveredIndex / (filteredData.length - 1 || 1)) * 820
                        return (
                          <>
                            <line x1={x} y1={40} x2={x} y2={310} stroke="#fff" strokeWidth="1" strokeDasharray="4" />
                            <circle cx={x} cy={310 - (hoveredPoint.osrs / maxOsrs) * 270} r="6" fill="#4ade80" />
                            <circle cx={x} cy={310 - (hoveredPoint.rs3 / maxOsrs) * 270} r="6" fill="#60a5fa" />
                          </>
                        )
                      })()}
                    </svg>
                  )}

                  {/* Tooltip - fixed position with edge detection */}
                  {hoveredPoint && (() => {
                    const tooltipWidth = 180
                    const tooltipHeight = 120
                    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 800
                    const spaceOnRight = screenWidth - mousePos.x
                    const spaceOnBottom = screenHeight - mousePos.y
                    const left = spaceOnRight < tooltipWidth + 30 ? mousePos.x - tooltipWidth - 15 : mousePos.x + 15
                    const top = spaceOnBottom < tooltipHeight + 20 ? mousePos.y - tooltipHeight : mousePos.y - 80
                    return (
                    <div style={{
                      position: 'fixed',
                      left: left,
                      top: top,
                      background: '#1a1a1a',
                      border: '1px solid #444',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      zIndex: 1000,
                      pointerEvents: 'none',
                      minWidth: '160px'
                    }}>
                      <div style={{ fontSize: '13px', color: '#fff', marginBottom: '8px', fontWeight: '600', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
                        {hoveredPoint.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {viewMode === 'live' && ` ${hoveredPoint.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                      </div>
                      <div style={{ fontSize: '14px', color: '#fff', marginBottom: '4px' }}>
                        <span style={{ color: '#4ade80', fontWeight: '700' }}>OSRS:</span> {hoveredPoint.osrs.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '14px', color: '#fff', marginBottom: '4px' }}>
                        <span style={{ color: '#60a5fa', fontWeight: '700' }}>RS3:</span> {hoveredPoint.rs3.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '14px', color: '#fff', fontWeight: '700', marginTop: '8px', borderTop: '1px solid #333', paddingTop: '8px' }}>
                        Total: {hoveredPoint.total.toLocaleString()}
                      </div>
                    </div>
                    )
                  })()}
                </div>
              </div>

              {/* Summary stats - Peaks row */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(2, 1fr)', gap: isMobile ? '8px' : '24px', marginBottom: isMobile ? '8px' : '20px' }}>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '11px' : '14px', color: '#fff', marginBottom: isMobile ? '4px' : '8px', fontWeight: '600' }}>Peak OSRS</div>
                  <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: '700', color: '#4ade80' }}>{peakOsrs.toLocaleString()}</div>
                  <div style={{ fontSize: isMobile ? '10px' : '12px', color: '#888', marginTop: '4px' }}>
                    {peakOsrsDate ? peakOsrsDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                  </div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '11px' : '14px', color: '#fff', marginBottom: isMobile ? '4px' : '8px', fontWeight: '600' }}>Peak RS3</div>
                  <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: '700', color: '#60a5fa' }}>{peakRs3.toLocaleString()}</div>
                  <div style={{ fontSize: isMobile ? '10px' : '12px', color: '#888', marginTop: '4px' }}>
                    {peakRs3Date ? peakRs3Date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                  </div>
                </div>
              </div>

              {/* Rolling 30-Day Averages */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(2, 1fr)', gap: isMobile ? '8px' : '24px', marginBottom: isMobile ? '8px' : '20px' }}>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '11px' : '14px', color: '#fff', marginBottom: isMobile ? '4px' : '8px', fontWeight: '600' }}>30-Day Avg OSRS</div>
                  <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: '700', color: '#4ade80' }}>{avg30DayOsrs.toLocaleString()}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '11px' : '14px', color: '#fff', marginBottom: isMobile ? '4px' : '8px', fontWeight: '600' }}>30-Day Avg RS3</div>
                  <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: '700', color: '#60a5fa' }}>{avg30DayRs3.toLocaleString()}</div>
                </div>
              </div>

              {/* Rolling 1-Year Averages */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(2, 1fr)', gap: isMobile ? '8px' : '24px' }}>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '11px' : '14px', color: '#fff', marginBottom: isMobile ? '4px' : '8px', fontWeight: '600' }}>1-Year Avg OSRS</div>
                  <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: '700', color: '#4ade80' }}>{avgYearOsrs.toLocaleString()}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '11px' : '14px', color: '#fff', marginBottom: isMobile ? '4px' : '8px', fontWeight: '600' }}>1-Year Avg RS3</div>
                  <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: '700', color: '#60a5fa' }}>{avgYearRs3.toLocaleString()}</div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <footer style={{ borderTop: '1px solid #222', padding: '24px 32px', fontSize: '12px', color: '#666', textAlign: 'right' }}>
        aggrgtr 2025
      </footer>
    </div>
  )
}
