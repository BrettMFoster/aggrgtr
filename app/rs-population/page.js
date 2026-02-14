'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import useSWR from 'swr'

// Chart layout constants
const CL = 55    // chart left edge
const CR = 870   // chart right edge
const CW = CR - CL // chart width
const CT = 15    // chart top
const CB = 530   // chart bottom
const CH = CB - CT // chart height
const VW = 920   // viewBox width
const VH = 585   // viewBox height

export default function RSPopulation() {
  const [viewMode, setViewMode] = useState('live')
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const [hoveredIndex, setHoveredIndex] = useState(-1)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [isMobile, setIsMobile] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [monthFilterOn, setMonthFilterOn] = useState(false)
  const [yearFilterOn, setYearFilterOn] = useState(false)
  const chartRef = useRef(null)

  // SWR for data fetching with caching
  const { data: historicalJson, error: historicalError } = useSWR(
    '/api/rs-data?sheet=Historical',
    { refreshInterval: 5 * 60 * 1000 }
  )
  const { data: liveJson, error: liveError } = useSWR(
    '/api/rs-data?sheet=Data',
    { refreshInterval: 5 * 60 * 1000 }
  )
  const { data: steamData } = useSWR(
    '/api/steam-players',
    { refreshInterval: 3 * 60 * 1000 }
  )
  const { data: steamHistorical } = useSWR(
    `/api/steam-data?view=${viewMode}`,
    { refreshInterval: viewMode === 'live' ? 3 * 60 * 1000 : 15 * 60 * 1000, keepPreviousData: true }
  )

  // Prefetch all steam views so tab switching is instant
  useSWR(viewMode !== 'live' ? '/api/steam-data?view=live' : null, { refreshInterval: 15 * 60 * 1000 })
  useSWR(viewMode !== 'week' ? '/api/steam-data?view=week' : null, { refreshInterval: 15 * 60 * 1000 })
  useSWR(viewMode !== 'month' ? '/api/steam-data?view=month' : null, { refreshInterval: 15 * 60 * 1000 })
  useSWR(viewMode !== 'year' ? '/api/steam-data?view=year' : null, { refreshInterval: 15 * 60 * 1000 })
  useSWR(viewMode !== 'all' ? '/api/steam-data?view=all' : null, { refreshInterval: 15 * 60 * 1000 })

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

  const steamChartData = useMemo(() => {
    if (!steamHistorical?.rows) return []
    return steamHistorical.rows.map(r => ({
      timestamp: new Date(r.timestamp * 1000),
      osrs: r.osrs || 0,
      rs3: r.rs3 || 0,
      dragonwilds: r.dragonwilds || 0,
    }))
  }, [steamHistorical])

  const getNearestSteamValues = (timestamp) => {
    if (!steamChartData.length) return { osrs: 0, rs3: 0, dragonwilds: 0 }
    const t = timestamp.getTime()
    const result = { osrs: 0, rs3: 0, dragonwilds: 0 }
    for (const key of ['osrs', 'rs3', 'dragonwilds']) {
      let minDiff = Infinity
      for (const d of steamChartData) {
        if (d[key] > 0) {
          const diff = Math.abs(t - d.timestamp.getTime())
          if (diff < minDiff) {
            minDiff = diff
            result[key] = d[key]
          }
        }
      }
    }
    return result
  }

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
    return Array.from(years).sort((a, b) => b - a)
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
      if (monthFilterOn) {
        filtered = data.filter(d =>
          d.timestamp.getFullYear() === selectedYear &&
          d.timestamp.getMonth() === selectedMonth
        )
      } else {
        const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000
        filtered = data.filter(d => d.timestamp.getTime() > cutoff)
      }
      filtered = aggregateByHour(filtered)
    } else if (viewMode === 'year') {
      if (yearFilterOn) {
        filtered = data.filter(d => d.timestamp.getFullYear() === selectedYear)
      } else {
        const cutoff = now.getTime() - 365 * 24 * 60 * 60 * 1000
        filtered = data.filter(d => d.timestamp.getTime() > cutoff)
      }
      filtered = aggregateByWeek(filtered)
    } else {
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
      const t = point.timestamp
      const dayKey = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`
      if (!byDay[dayKey]) {
        byDay[dayKey] = { osrs: [], rs3: [], total: [] }
      }
      byDay[dayKey].osrs.push(point.osrs)
      byDay[dayKey].rs3.push(point.rs3)
      byDay[dayKey].total.push(point.total)
    }
    return Object.entries(byDay).map(([day, values]) => {
      const [y, m, d] = day.split('-').map(Number)
      return {
        timestamp: new Date(y, m - 1, d),
        osrs: Math.round(values.osrs.reduce((a, b) => a + b, 0) / values.osrs.length),
        rs3: Math.round(values.rs3.reduce((a, b) => a + b, 0) / values.rs3.length),
        total: Math.round(values.total.reduce((a, b) => a + b, 0) / values.total.length)
      }
    }).sort((a, b) => a.timestamp - b.timestamp)
  }

  const aggregateByWeek = (data) => {
    const byWeek = {}
    for (const point of data) {
      const d = new Date(point.timestamp)
      const day = d.getDay()
      const monday = new Date(d)
      monday.setDate(d.getDate() - ((day + 6) % 7))
      const weekKey = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`
      if (!byWeek[weekKey]) {
        byWeek[weekKey] = { osrs: [], rs3: [], total: [] }
      }
      byWeek[weekKey].osrs.push(point.osrs)
      byWeek[weekKey].rs3.push(point.rs3)
      byWeek[weekKey].total.push(point.total)
    }
    return Object.entries(byWeek).map(([week, values]) => {
      const [y, m, d] = week.split('-').map(Number)
      return {
        timestamp: new Date(y, m - 1, d),
        osrs: Math.round(values.osrs.reduce((a, b) => a + b, 0) / values.osrs.length),
        rs3: Math.round(values.rs3.reduce((a, b) => a + b, 0) / values.rs3.length),
        total: Math.round(values.total.reduce((a, b) => a + b, 0) / values.total.length)
      }
    }).sort((a, b) => a.timestamp - b.timestamp)
  }

  const aggregateByHour = (data) => {
    const byHour = {}
    for (const point of data) {
      const t = point.timestamp
      const hourKey = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}T${String(t.getHours()).padStart(2,'0')}`
      if (!byHour[hourKey]) {
        byHour[hourKey] = { osrs: [], rs3: [], total: [] }
      }
      byHour[hourKey].osrs.push(point.osrs)
      byHour[hourKey].rs3.push(point.rs3)
      byHour[hourKey].total.push(point.total)
    }
    return Object.entries(byHour).map(([hour, values]) => {
      const [datePart, h] = hour.split('T')
      const [y, m, d] = datePart.split('-').map(Number)
      return {
        timestamp: new Date(y, m - 1, d, parseInt(h)),
        osrs: Math.round(values.osrs.reduce((a, b) => a + b, 0) / values.osrs.length),
        rs3: Math.round(values.rs3.reduce((a, b) => a + b, 0) / values.rs3.length),
        total: Math.round(values.total.reduce((a, b) => a + b, 0) / values.total.length)
      }
    }).sort((a, b) => a.timestamp - b.timestamp)
  }

  // Compute nice y-axis ticks
  const computeYTicks = (maxVal) => {
    if (maxVal <= 0) return [0]
    const roughStep = maxVal / 5
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)))
    const normalized = roughStep / magnitude
    let niceStep
    if (normalized <= 1.5) niceStep = magnitude
    else if (normalized <= 3.5) niceStep = 2 * magnitude
    else if (normalized <= 7.5) niceStep = 5 * magnitude
    else niceStep = 10 * magnitude

    const ticks = []
    for (let v = 0; v <= maxVal * 1.05; v += niceStep) {
      ticks.push(Math.round(v))
    }
    if (ticks[ticks.length - 1] < maxVal) {
      ticks.push(ticks[ticks.length - 1] + Math.round(niceStep))
    }
    if (ticks.length < 2) ticks.push(Math.round(niceStep))
    return ticks
  }

  const filteredData = getFilteredData()
  const latest = data[data.length - 1]

  // Left Y-axis: RS population data only
  const rawMax = filteredData.length > 0 ? Math.max(...filteredData.map(d => d.osrs), 1) : 1
  const yTicks = computeYTicks(rawMax)
  const maxVal = yTicks[yTicks.length - 1] || 1

  // Right Y-axis: Steam data (30K floor, scales up only if exceeded)
  const steamVisibleMax = (() => {
    if (!steamChartData.length || !filteredData.length) return 30000
    const minTime = filteredData[0].timestamp.getTime()
    const maxTime = filteredData[filteredData.length - 1].timestamp.getTime()
    const visible = steamChartData.filter(d => {
      const t = d.timestamp.getTime()
      return t >= minTime && t <= maxTime
    })
    if (!visible.length) return 30000
    const dataMax = Math.max(...visible.map(d => Math.max(d.osrs, d.rs3, d.dragonwilds)))
    return Math.max(dataMax, 30000)
  })()
  const steamYTicks = steamVisibleMax <= 30000
    ? [0, 5000, 10000, 15000, 20000, 25000, 30000]
    : computeYTicks(steamVisibleMax)
  const steamMaxVal = steamYTicks[steamYTicks.length - 1] || 30000

  const avgTotal = filteredData.length > 0
    ? Math.round(filteredData.reduce((sum, d) => sum + d.total, 0) / filteredData.length)
    : 0
  const peakOsrs = Math.max(...filteredData.map(d => d.osrs), 0)
  const peakRs3 = Math.max(...filteredData.map(d => d.rs3), 0)

  const peakOsrsPoint = filteredData.find(d => d.osrs === peakOsrs)
  const peakRs3Point = filteredData.find(d => d.rs3 === peakRs3)
  const peakOsrsDate = peakOsrsPoint?.timestamp
  const peakRs3Date = peakRs3Point?.timestamp

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
    { id: 'live', label: 'Hour' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' },
    { id: 'all', label: 'All Time' }
  ]

  // Whether to show dots (too many = clutter)
  const showDots = filteredData.length > 0
  const dotInterval = filteredData.length > 200 ? Math.ceil(filteredData.length / 80) : filteredData.length > 100 ? Math.ceil(filteredData.length / 80) : 1

  const handleInteraction = (clientX, clientY) => {
    if (!chartRef.current || filteredData.length === 0) return
    const rect = chartRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const chartWidth = rect.width
    const chartStartPct = CL / VW
    const chartEndPct = CR / VW
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
      if (allMonths.length <= maxLabels) return allMonths
      const result = []
      for (let i = 0; i < maxLabels; i++) {
        const idx = Math.floor((i / (maxLabels - 1)) * (allMonths.length - 1))
        result.push(allMonths[idx])
      }
      return result
    }

    if (viewMode === 'year') {
      // Collect first and last index for each month
      const monthRanges = {}
      const monthOrder = []
      for (let i = 0; i < filteredData.length; i++) {
        const d = filteredData[i]
        const monthKey = `${d.timestamp.getFullYear()}-${d.timestamp.getMonth()}`
        if (!monthRanges[monthKey]) {
          monthRanges[monthKey] = { first: i, last: i, timestamp: d.timestamp }
          monthOrder.push(monthKey)
        } else {
          monthRanges[monthKey].last = i
        }
      }
      // Place label at midpoint of each month's data range for even spacing
      return monthOrder.map(key => {
        const r = monthRanges[key]
        return {
          index: Math.round((r.first + r.last) / 2),
          text: r.timestamp.toLocaleDateString('en-US', { month: 'short' }) + " '" + r.timestamp.getFullYear().toString().slice(-2)
        }
      })
    }

    const count = 6
    for (let i = 0; i < count; i++) {
      const idx = Math.floor((i / (count - 1)) * (filteredData.length - 1))
      const d = filteredData[idx]
      let text
      if (viewMode === 'live') {
        const time = d.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        // Add date to first and last labels to distinguish across midnight
        if (i === 0 || i === count - 1) {
          text = d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + time
        } else {
          text = time
        }
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
        key = d.timestamp.getFullYear()
      } else if (viewMode === 'year') {
        key = `${d.timestamp.getFullYear()}-${d.timestamp.getMonth()}`
      } else if (viewMode === 'week' || viewMode === 'month') {
        key = `${d.timestamp.getFullYear()}-${d.timestamp.getMonth()}-${d.timestamp.getDate()}`
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
    bands.push({ start: currentBandStart, end: filteredData.length - 1, key: currentKey })
    return bands
  }

  // Helper: compute x position for data index
  const xPos = (i) => CL + (i / (filteredData.length - 1 || 1)) * CW
  // Helper: compute y position for value (left axis)
  const yPos = (val) => CB - (val / maxVal) * CH
  // Helper: compute y position for Steam value (right axis)
  const steamYPos = (val) => CB - (val / steamMaxVal) * CH

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
        {/* Sidebar - navigation only now (time range moved to chart) */}
        <aside style={{
          width: isMobile ? '100%' : '220px',
          padding: isMobile ? '12px 16px' : '12px 24px 12px 32px',
          borderRight: isMobile ? 'none' : '1px solid #222',
          borderBottom: isMobile ? '1px solid #222' : 'none'
        }}>
          <div style={{ marginBottom: isMobile ? '12px' : '24px' }}>
            {!isMobile && <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>Dashboards</div>}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: isMobile ? '4px' : '6px', flexWrap: 'wrap' }}>
              <a href="/rs-population" style={{ background: '#222', border: 'none', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '600' }}>Population</a>
              <a href="/osrs-worlds" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>OSRS Worlds</a>
              <a href="/hiscores" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Hiscores</a>
              <a href="/rs-trends" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Trends</a>
              <a href="/data" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Data</a>
              <a href="/blog" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Blog</a>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: isMobile ? '16px' : '24px 20px' }}>
          <h1 style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '600', letterSpacing: '-1px', color: '#fff', margin: '0 0 8px 0' }}>RuneScape Population Tracker</h1>
          <p style={{ fontSize: isMobile ? '14px' : '16px', color: '#fff', margin: '0 0 6px 0' }}>Live player counts for OSRS and RS3</p>

          {loading ? (
            <div style={{ color: '#fff', padding: '40px', textAlign: 'center' }}>Loading...</div>
          ) : error ? (
            <div style={{ color: '#ff4444', padding: '40px', textAlign: 'center' }}>Error: {error?.message || 'Failed to load data'}</div>
          ) : (
            <>
              {/* KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '10px', marginBottom: '10px' }}>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px 12px' : '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '500', color: '#fff', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>OSRS Players</div>
                  <div style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: '700', color: '#4ade80', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums' }}>{latest?.osrs?.toLocaleString() || '-'}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px 12px' : '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '500', color: '#fff', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>RS3 Players</div>
                  <div style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: '700', color: '#60a5fa', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums' }}>{latest?.rs3?.toLocaleString() || '-'}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px 12px' : '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '500', color: '#fff', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>Total Online</div>
                  <div style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: '700', color: '#fff', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums' }}>{latest?.total?.toLocaleString() || '-'}</div>
                </div>
              </div>

              {/* Steam Player Counts */}
              {steamData && (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '8px 12px' : '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '500', color: '#fff', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>OSRS (Steam)</div>
                    <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: '700', color: '#4ade80', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums' }}>{steamData.osrs?.toLocaleString() || '-'}</div>
                  </div>
                  <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '8px 12px' : '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '500', color: '#fff', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>RS3 (Steam)</div>
                    <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: '700', color: '#60a5fa', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums' }}>{steamData.rs3?.toLocaleString() || '-'}</div>
                  </div>
                  <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '8px 12px' : '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '500', color: '#fff', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>Dragonwilds</div>
                    <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: '700', color: '#a855f7', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums' }}>{steamData.dragonwilds?.toLocaleString() || '-'}</div>
                  </div>
                </div>
              )}

              {/* Chart */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px' : '12px 16px', marginBottom: isMobile ? '8px' : '12px' }}>
                {/* Chart header with title + time range pills */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '8px' : '12px', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: 0 }}>
                      Player Count
                    </h2>
                    {latest?.timestamp && (
                      <span style={{ fontSize: '13px', color: '#4ade80', fontWeight: '500' }}>
                        Updated {Math.floor((Date.now() - latest.timestamp.getTime()) / 60000)}m ago
                      </span>
                    )}
                    {/* Month/year filter controls */}
                    {viewMode === 'month' && (
                      <button
                        onClick={() => setMonthFilterOn(!monthFilterOn)}
                        style={{
                          background: monthFilterOn ? '#1a1a1a' : 'transparent',
                          border: monthFilterOn ? '1px solid #4ade80' : '1px solid #333',
                          color: monthFilterOn ? '#4ade80' : '#666',
                          padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
                        }}
                      >
                        Filter
                      </button>
                    )}
                    {viewMode === 'year' && (
                      <button
                        onClick={() => setYearFilterOn(!yearFilterOn)}
                        style={{
                          background: yearFilterOn ? '#1a1a1a' : 'transparent',
                          border: yearFilterOn ? '1px solid #4ade80' : '1px solid #333',
                          color: yearFilterOn ? '#4ade80' : '#666',
                          padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
                        }}
                      >
                        Filter
                      </button>
                    )}
                    {((viewMode === 'month' && monthFilterOn) || (viewMode === 'year' && yearFilterOn)) && (
                      <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        style={{ background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                      >
                        {getAvailableYears().map(year => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                    )}
                    {viewMode === 'month' && monthFilterOn && (
                      <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                        style={{ background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                      >
                        {getAvailableMonths().map(month => (
                          <option key={month} value={month}>{monthNames[month]}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Time range pill buttons */}
                  <div style={{ display: 'flex', gap: '4px', background: '#1a1a1a', borderRadius: '8px', padding: '3px' }}>
                    {viewModes.map(mode => (
                      <button
                        key={mode.id}
                        onClick={() => setViewMode(mode.id)}
                        style={{
                          background: viewMode === mode.id ? '#333' : 'transparent',
                          border: 'none',
                          color: viewMode === mode.id ? '#fff' : '#ddd',
                          padding: isMobile ? '8px 14px' : '8px 18px',
                          borderRadius: '6px',
                          fontSize: isMobile ? '13px' : '15px',
                          cursor: 'pointer',
                          fontWeight: viewMode === mode.id ? '600' : '400',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>


                <div
                  ref={chartRef}
                  style={{ height: isMobile ? '350px' : '650px', position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => { setHoveredPoint(null); setHoveredIndex(-1); }}
                  onTouchMove={handleTouchMove}
                  onTouchStart={(e) => { if (e.touches && e.touches[0]) handleInteraction(e.touches[0].clientX, e.touches[0].clientY); }}
                  onTouchEnd={() => { setHoveredPoint(null); setHoveredIndex(-1); }}
                >
                  {filteredData.length > 0 && (
                    <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none">
                      {/* Time period bands */}
                      {getTimeBands().map((band, i) => {
                        const x1 = xPos(band.start)
                        const x2 = xPos(band.end)
                        return (
                          <rect
                            key={i}
                            x={x1}
                            y={CT}
                            width={x2 - x1}
                            height={CH}
                            fill={i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)'}
                          />
                        )
                      })}

                      {/* Y-axis grid lines and full number labels */}
                      {yTicks.map((val, i) => {
                        const y = yPos(val)
                        return (
                          <g key={i}>
                            <line x1={CL} y1={y} x2={CR} y2={y} stroke="#2a2a2a" strokeWidth="1" />
                            <text x={CL - 8} y={y + 4} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="end" style={{ fontFamily: 'monospace' }}>
                              {val.toLocaleString()}
                            </text>
                          </g>
                        )
                      })}

                      {/* Right Y-axis labels (Steam) */}
                      {steamChartData.length > 0 && steamYTicks.map((val, i) => {
                        const y = steamYPos(val)
                        return (
                          <g key={`sy${i}`}>
                            <text x={CR + 8} y={y + 4} fill="#a855f7" fontSize="12" fontWeight="bold" textAnchor="start" style={{ fontFamily: 'monospace' }}>
                              {val.toLocaleString()}
                            </text>
                          </g>
                        )
                      })}

                      {/* X-axis labels */}
                      {(() => {
                        const allLabels = getXAxisLabels()
                        const minGap = 40
                        const visible = []
                        let lastX = -Infinity
                        for (const label of allLabels) {
                          const x = xPos(label.index)
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
                          y={CB + 22}
                          fill="#fff"
                          fontSize="12"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {label.text}
                        </text>
                      ))}

                      {/* OSRS area fill */}
                      <path
                        d={`M ${CL},${CB} ${filteredData.map((d, i) => `L ${xPos(i)},${yPos(d.osrs)}`).join(' ')} L ${CR},${CB} Z`}
                        fill="rgba(74, 222, 128, 0.15)"
                      />
                      {/* OSRS line */}
                      <path
                        d={`M ${filteredData.map((d, i) => `${xPos(i)},${yPos(d.osrs)}`).join(' L ')}`}
                        fill="none"
                        stroke="#4ade80"
                        strokeWidth="2.5"
                      />
                      {/* OSRS dots */}
                      {showDots && filteredData.map((d, i) => (
                        i % dotInterval === 0 && (
                          <circle key={`o${i}`} cx={xPos(i)} cy={yPos(d.osrs)} r="2.5" fill="#4ade80" stroke="#111" strokeWidth="1" />
                        )
                      ))}

                      {/* RS3 area fill */}
                      <path
                        d={`M ${CL},${CB} ${filteredData.map((d, i) => `L ${xPos(i)},${yPos(d.rs3)}`).join(' ')} L ${CR},${CB} Z`}
                        fill="rgba(96, 165, 250, 0.15)"
                      />
                      {/* RS3 line */}
                      <path
                        d={`M ${filteredData.map((d, i) => `${xPos(i)},${yPos(d.rs3)}`).join(' L ')}`}
                        fill="none"
                        stroke="#60a5fa"
                        strokeWidth="2.5"
                      />
                      {/* RS3 dots */}
                      {showDots && filteredData.map((d, i) => (
                        i % dotInterval === 0 && (
                          <circle key={`r${i}`} cx={xPos(i)} cy={yPos(d.rs3)} r="2.5" fill="#60a5fa" stroke="#111" strokeWidth="1" />
                        )
                      ))}

                      {/* Steam time-series lines */}
                      {steamChartData.length > 1 && filteredData.length > 1 && (() => {
                        const minTime = filteredData[0].timestamp.getTime()
                        const maxTime = filteredData[filteredData.length - 1].timestamp.getTime()
                        // Map steam timestamp to RS data index for aligned X positioning
                        const steamToX = (t) => {
                          const ts = t.getTime()
                          if (ts <= minTime) return xPos(0)
                          if (ts >= maxTime) return xPos(filteredData.length - 1)
                          // Binary search for nearest RS data point
                          let lo = 0, hi = filteredData.length - 1
                          while (lo < hi - 1) {
                            const mid = (lo + hi) >> 1
                            if (filteredData[mid].timestamp.getTime() <= ts) lo = mid
                            else hi = mid
                          }
                          const t0 = filteredData[lo].timestamp.getTime()
                          const t1 = filteredData[hi].timestamp.getTime()
                          const frac = (ts - t0) / (t1 - t0 || 1)
                          return xPos(lo + frac)
                        }
                        const visible = steamChartData
                        if (visible.length < 2) return null

                        const osrsPoints = visible.filter(d => d.osrs > 0)
                        const rs3Points = visible.filter(d => d.rs3 > 0)
                        const dwPoints = visible.filter(d => d.dragonwilds > 0)

                        return (
                          <>
                            {osrsPoints.length > 1 && (
                              <path
                                d={`M ${osrsPoints.map((d, i) => `${i > 0 ? 'L ' : ''}${steamToX(d.timestamp)},${steamYPos(d.osrs)}`).join(' ')}`}
                                fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="6,3"
                              />
                            )}
                            {rs3Points.length > 1 && (
                              <path
                                d={`M ${rs3Points.map((d, i) => `${i > 0 ? 'L ' : ''}${steamToX(d.timestamp)},${steamYPos(d.rs3)}`).join(' ')}`}
                                fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeDasharray="6,3"
                              />
                            )}
                            {dwPoints.length > 1 && (
                              <path
                                d={`M ${dwPoints.map((d, i) => `${i > 0 ? 'L ' : ''}${steamToX(d.timestamp)},${steamYPos(d.dragonwilds)}`).join(' ')}`}
                                fill="none" stroke="#a855f7" strokeWidth="2.5" strokeDasharray="6,3"
                              />
                            )}
                          </>
                        )
                      })()}

                      {/* Hover indicator */}
                      {hoveredPoint && hoveredIndex >= 0 && (() => {
                        const x = xPos(hoveredIndex)
                        const sp = getNearestSteamValues(hoveredPoint.timestamp)
                        return (
                          <>
                            <line x1={x} y1={CT} x2={x} y2={CB} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                            <circle cx={x} cy={yPos(hoveredPoint.osrs)} r="5" fill="#4ade80" stroke="#111" strokeWidth="1.5" />
                            <circle cx={x} cy={yPos(hoveredPoint.rs3)} r="5" fill="#60a5fa" stroke="#111" strokeWidth="1.5" />
                            {sp?.osrs > 0 && <circle cx={x} cy={steamYPos(sp.osrs)} r="5" fill="#f59e0b" stroke="#111" strokeWidth="1.5" />}
                            {sp?.rs3 > 0 && <circle cx={x} cy={steamYPos(sp.rs3)} r="5" fill="#22d3ee" stroke="#111" strokeWidth="1.5" />}
                            {sp?.dragonwilds > 0 && <circle cx={x} cy={steamYPos(sp.dragonwilds)} r="5" fill="#a855f7" stroke="#111" strokeWidth="1.5" />}
                          </>
                        )
                      })()}

                      {/* Legend at bottom of chart */}
                      <g transform={`translate(${VW / 2}, ${CB + 50})`}>
                        <rect x={-248} y={-6} width={12} height={12} rx={2} fill="#4ade80" />
                        <text x={-232} y={5} fill="#ccc" fontSize="11">OSRS</text>
                        <rect x={-178} y={-6} width={12} height={12} rx={2} fill="#60a5fa" />
                        <text x={-162} y={5} fill="#ccc" fontSize="11">RS3</text>
                        <line x1={-108} y1={0} x2={-78} y2={0} stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="6,3" />
                        <text x={-72} y={5} fill="#ccc" fontSize="11">OSRS Steam</text>
                        <line x1={12} y1={0} x2={42} y2={0} stroke="#22d3ee" strokeWidth="2.5" strokeDasharray="6,3" />
                        <text x={48} y={5} fill="#ccc" fontSize="11">RS3 Steam</text>
                        <line x1={132} y1={0} x2={162} y2={0} stroke="#a855f7" strokeWidth="2.5" strokeDasharray="6,3" />
                        <text x={168} y={5} fill="#ccc" fontSize="11">Dragonwilds</text>
                      </g>
                    </svg>
                  )}

                  {/* Tooltip */}
                  {hoveredPoint && (() => {
                    const tooltipWidth = 180
                    const tooltipHeight = 140
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
                      {(() => {
                        const sp = getNearestSteamValues(hoveredPoint.timestamp)
                        if (!sp) return null
                        return (
                          <div style={{ marginTop: '8px', borderTop: '1px solid #333', paddingTop: '6px', fontSize: '12px' }}>
                            <div style={{ color: '#fff', marginBottom: '4px', fontWeight: '600' }}>Steam</div>
                            {sp.osrs > 0 && <div style={{ color: '#f59e0b' }}>OSRS: {sp.osrs.toLocaleString()}</div>}
                            {sp.rs3 > 0 && <div style={{ color: '#22d3ee' }}>RS3: {sp.rs3.toLocaleString()}</div>}
                            {sp.dragonwilds > 0 && <div style={{ color: '#a855f7' }}>DW: {sp.dragonwilds.toLocaleString()}</div>}
                          </div>
                        )
                      })()}
                    </div>
                    )
                  })()}
                </div>
              </div>

              {/* Summary Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '10px' }}>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '8px 12px' : '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '500', color: '#fff', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>Peak OSRS</div>
                  <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: '700', color: '#4ade80', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums' }}>{peakOsrs.toLocaleString()}</div>
                  <div style={{ fontSize: '12px', color: '#fff', marginTop: '2px', lineHeight: '1.2' }}>
                    {peakOsrsDate ? peakOsrsDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                  </div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '8px 12px' : '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '500', color: '#fff', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>Peak RS3</div>
                  <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: '700', color: '#60a5fa', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums' }}>{peakRs3.toLocaleString()}</div>
                  <div style={{ fontSize: '12px', color: '#fff', marginTop: '2px', lineHeight: '1.2' }}>
                    {peakRs3Date ? peakRs3Date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                  </div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '8px 12px' : '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '500', color: '#fff', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>30-Day Avg OSRS</div>
                  <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: '700', color: '#4ade80', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums' }}>{avg30DayOsrs.toLocaleString()}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '8px 12px' : '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '500', color: '#fff', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>30-Day Avg RS3</div>
                  <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: '700', color: '#60a5fa', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums' }}>{avg30DayRs3.toLocaleString()}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '8px 12px' : '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '500', color: '#fff', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>1-Year Avg OSRS</div>
                  <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: '700', color: '#4ade80', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums' }}>{avgYearOsrs.toLocaleString()}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '8px 12px' : '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '500', color: '#fff', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>1-Year Avg RS3</div>
                  <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: '700', color: '#60a5fa', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums' }}>{avgYearRs3.toLocaleString()}</div>
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
