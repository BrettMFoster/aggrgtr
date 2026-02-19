'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import useSWR from 'swr'

// RS interface colors
const RS = {
  bg: '#1b1710',
  panelBg: '#2b2417',
  panelBorder: '#5c4d2a',
  borderLight: '#8b7a3d',
  borderGold: '#c8aa6e',
  gold: '#ffdd44',
  goldDim: '#c8aa6e',
  text: '#ff981f',
  textLight: '#fff4d1',
  textYellow: '#ffff00',
  textGreen: '#00ff00',
  textCyan: '#00ffff',
  textRed: '#ff3333',
  textBlue: '#3399ff',
  textOrange: '#ff9900',
  textPurple: '#cc66ff',
  chatBg: '#0a0a08',
  chatBorder: '#4a3d20',
  tabActive: '#3d3322',
  tabInactive: '#1e1a12',
}

// Chart layout
const CL = 55, CR = 680, CT = 15, CB = 400
const CW = CR - CL, CH = CB - CT, VW = 730, VH = 460

export default function RSThemeDashboard() {
  const [viewMode, setViewMode] = useState('live')
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const [hoveredIndex, setHoveredIndex] = useState(-1)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [chatLog, setChatLog] = useState([])
  const [isMobile, setIsMobile] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [monthFilterOn, setMonthFilterOn] = useState(false)
  const [yearFilterOn, setYearFilterOn] = useState(false)
  const chartRef = useRef(null)
  const chatEndRef = useRef(null)
  const prevLatest = useRef(null)

  // Data fetching - same as production
  const { data: historicalJson, error: historicalError } = useSWR('/api/rs-data?sheet=Historical', { refreshInterval: 5 * 60 * 1000 })
  const { data: liveJson, error: liveError } = useSWR('/api/rs-data?sheet=Data', { refreshInterval: 5 * 60 * 1000 })
  const { data: steamData } = useSWR('/api/steam-players', { refreshInterval: 3 * 60 * 1000 })
  const { data: steamHistorical } = useSWR(
    `/api/steam-data?view=${viewMode}`,
    { refreshInterval: viewMode === 'live' ? 3 * 60 * 1000 : 15 * 60 * 1000, keepPreviousData: true }
  )

  // Prefetch all steam views
  useSWR(viewMode !== 'live' ? '/api/steam-data?view=live' : null, { refreshInterval: 15 * 60 * 1000 })
  useSWR(viewMode !== 'week' ? '/api/steam-data?view=week' : null, { refreshInterval: 15 * 60 * 1000 })
  useSWR(viewMode !== 'month' ? '/api/steam-data?view=month' : null, { refreshInterval: 15 * 60 * 1000 })
  useSWR(viewMode !== 'year' ? '/api/steam-data?view=year' : null, { refreshInterval: 15 * 60 * 1000 })
  useSWR(viewMode !== 'all' ? '/api/steam-data?view=all' : null, { refreshInterval: 15 * 60 * 1000 })

  const loading = !historicalJson || !liveJson
  const error = historicalError || liveError

  // Process and combine data
  const data = useMemo(() => {
    if (!historicalJson || !liveJson) return []
    const hist = (historicalJson.rows || []).map(r => ({ ...r, timestamp: new Date(r.timestamp) }))
    const live = (liveJson.rows || []).map(r => ({ ...r, timestamp: new Date(r.timestamp) }))
    const combined = [...hist]
    const latestHist = hist.length > 0 ? Math.max(...hist.map(d => d.timestamp.getTime())) : 0
    for (const p of live) {
      if (p.timestamp.getTime() > latestHist) combined.push(p)
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
          if (diff < minDiff) { minDiff = diff; result[key] = d[key] }
        }
      }
    }
    return result
  }

  const latest = data[data.length - 1]

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Chat log
  useEffect(() => {
    if (!latest) return
    const prev = prevLatest.current
    if (prev && prev.total !== latest.total) {
      const diff = latest.total - prev.total
      const sign = diff > 0 ? '+' : ''
      const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      setChatLog(log => [...log,
        { time, text: `Population changed: ${latest.total.toLocaleString()} (${sign}${diff.toLocaleString()})`, color: diff > 0 ? RS.textGreen : RS.textRed },
        { time, text: `OSRS: ${latest.osrs.toLocaleString()} | RS3: ${latest.rs3.toLocaleString()}`, color: RS.textYellow }
      ].slice(-50))
    } else if (!prev && latest) {
      const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      setChatLog([
        { time, text: 'Welcome to aggrgtr Population Tracker.', color: RS.textCyan },
        { time, text: `Current population: ${latest.total.toLocaleString()} players online.`, color: RS.textYellow },
        { time, text: `OSRS: ${latest.osrs.toLocaleString()} | RS3: ${latest.rs3.toLocaleString()}`, color: RS.textGreen },
      ])
    }
    prevLatest.current = latest
  }, [latest])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatLog])

  // Available years/months
  const getAvailableYears = () => {
    if (data.length === 0) return []
    const years = new Set()
    for (const d of data) years.add(d.timestamp.getFullYear())
    return Array.from(years).sort((a, b) => b - a)
  }

  const getAvailableMonths = () => {
    if (data.length === 0) return []
    const months = new Set()
    for (const d of data) {
      if (d.timestamp.getFullYear() === selectedYear) months.add(d.timestamp.getMonth())
    }
    return Array.from(months).sort((a, b) => a - b)
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  // Aggregation helpers
  const aggregateByDay = (data) => {
    const byDay = {}
    for (const p of data) {
      const key = p.timestamp.toISOString().split('T')[0]
      if (!byDay[key]) byDay[key] = { osrs: [], rs3: [], total: [] }
      byDay[key].osrs.push(p.osrs); byDay[key].rs3.push(p.rs3); byDay[key].total.push(p.total)
    }
    return Object.entries(byDay).map(([k, v]) => ({
      timestamp: new Date(k),
      osrs: Math.round(v.osrs.reduce((a, b) => a + b, 0) / v.osrs.length),
      rs3: Math.round(v.rs3.reduce((a, b) => a + b, 0) / v.rs3.length),
      total: Math.round(v.total.reduce((a, b) => a + b, 0) / v.total.length),
    })).sort((a, b) => a.timestamp - b.timestamp)
  }

  const aggregateByWeek = (data) => {
    const byWeek = {}
    for (const p of data) {
      const d = new Date(p.timestamp)
      const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const key = mon.toISOString().split('T')[0]
      if (!byWeek[key]) byWeek[key] = { osrs: [], rs3: [], total: [] }
      byWeek[key].osrs.push(p.osrs); byWeek[key].rs3.push(p.rs3); byWeek[key].total.push(p.total)
    }
    return Object.entries(byWeek).map(([k, v]) => ({
      timestamp: new Date(k),
      osrs: Math.round(v.osrs.reduce((a, b) => a + b, 0) / v.osrs.length),
      rs3: Math.round(v.rs3.reduce((a, b) => a + b, 0) / v.rs3.length),
      total: Math.round(v.total.reduce((a, b) => a + b, 0) / v.total.length),
    })).sort((a, b) => a.timestamp - b.timestamp)
  }

  const aggregateByHour = (data) => {
    const byHour = {}
    for (const p of data) {
      const key = p.timestamp.toISOString().slice(0, 13)
      if (!byHour[key]) byHour[key] = { osrs: [], rs3: [], total: [] }
      byHour[key].osrs.push(p.osrs); byHour[key].rs3.push(p.rs3); byHour[key].total.push(p.total)
    }
    return Object.entries(byHour).map(([k, v]) => ({
      timestamp: new Date(k + ':00:00Z'),
      osrs: Math.round(v.osrs.reduce((a, b) => a + b, 0) / v.osrs.length),
      rs3: Math.round(v.rs3.reduce((a, b) => a + b, 0) / v.rs3.length),
      total: Math.round(v.total.reduce((a, b) => a + b, 0) / v.total.length),
    })).sort((a, b) => a.timestamp - b.timestamp)
  }

  const getFilteredData = () => {
    if (data.length === 0) return []
    const now = new Date()
    let filtered

    if (viewMode === 'month') {
      if (monthFilterOn) {
        filtered = data.filter(d => d.timestamp.getFullYear() === selectedYear && d.timestamp.getMonth() === selectedMonth)
      } else {
        filtered = data.filter(d => d.timestamp.getTime() > now.getTime() - 30 * 24 * 60 * 60 * 1000)
      }
      filtered = aggregateByHour(filtered)
    } else if (viewMode === 'year') {
      if (yearFilterOn) {
        filtered = data.filter(d => d.timestamp.getFullYear() === selectedYear)
      } else {
        filtered = data.filter(d => d.timestamp.getTime() > now.getTime() - 365 * 24 * 60 * 60 * 1000)
      }
      filtered = aggregateByWeek(filtered)
    } else {
      const cutoffs = { 'live': 24 * 60 * 60 * 1000, 'week': 7 * 24 * 60 * 60 * 1000, 'all': Infinity }
      filtered = data.filter(d => d.timestamp.getTime() > now.getTime() - cutoffs[viewMode])
      if (viewMode === 'all') filtered = aggregateByDay(filtered)
      else if (viewMode === 'week') filtered = aggregateByHour(filtered)
    }
    return filtered
  }

  const filteredData = getFilteredData()

  // Y-axis computations
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
    for (let v = 0; v <= maxVal * 1.05; v += niceStep) ticks.push(Math.round(v))
    if (ticks[ticks.length - 1] < maxVal) ticks.push(ticks[ticks.length - 1] + Math.round(niceStep))
    if (ticks.length < 2) ticks.push(Math.round(niceStep))
    return ticks
  }

  // Left Y-axis: RS population
  const rawMax = filteredData.length > 0 ? Math.max(...filteredData.map(d => d.osrs), 1) : 1
  const yTicks = computeYTicks(rawMax)
  const maxVal = yTicks[yTicks.length - 1] || 1

  // Right Y-axis: Steam (30k floor)
  const steamVisibleMax = (() => {
    if (!steamChartData.length || !filteredData.length) return 30000
    const minTime = filteredData[0].timestamp.getTime()
    const maxTime = filteredData[filteredData.length - 1].timestamp.getTime()
    const visible = steamChartData.filter(d => { const t = d.timestamp.getTime(); return t >= minTime && t <= maxTime })
    if (!visible.length) return 30000
    const dataMax = Math.max(...visible.map(d => Math.max(d.osrs, d.rs3, d.dragonwilds)))
    return Math.max(dataMax, 30000)
  })()
  const steamYTicks = steamVisibleMax <= 30000 ? [0, 5000, 10000, 15000, 20000, 25000, 30000] : computeYTicks(steamVisibleMax)
  const steamMaxVal = steamYTicks[steamYTicks.length - 1] || 30000

  // Stats
  const now = new Date()
  const last30 = data.filter(d => d.timestamp.getTime() > now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const lastYear = data.filter(d => d.timestamp.getTime() > now.getTime() - 365 * 24 * 60 * 60 * 1000)
  const peakOsrs = filteredData.length > 0 ? Math.max(...filteredData.map(d => d.osrs)) : 0
  const peakRs3 = filteredData.length > 0 ? Math.max(...filteredData.map(d => d.rs3)) : 0
  const peakOsrsPoint = filteredData.find(d => d.osrs === peakOsrs)
  const peakRs3Point = filteredData.find(d => d.rs3 === peakRs3)
  const avg30Osrs = last30.length > 0 ? Math.round(last30.reduce((s, d) => s + d.osrs, 0) / last30.length) : 0
  const avg30Rs3 = last30.length > 0 ? Math.round(last30.reduce((s, d) => s + d.rs3, 0) / last30.length) : 0
  const avgYrOsrs = lastYear.length > 0 ? Math.round(lastYear.reduce((s, d) => s + d.osrs, 0) / lastYear.length) : 0
  const avgYrRs3 = lastYear.length > 0 ? Math.round(lastYear.reduce((s, d) => s + d.rs3, 0) / lastYear.length) : 0

  const osrsRatio = latest ? latest.osrs / (latest.total || 1) : 0.5

  // Dot interval
  const showDots = filteredData.length > 0
  const dotInterval = filteredData.length > 200 ? Math.ceil(filteredData.length / 80) : filteredData.length > 100 ? Math.ceil(filteredData.length / 80) : 1

  // Helpers
  const xPos = (i) => CL + (i / (filteredData.length - 1 || 1)) * CW
  const yPos = (val) => CB - (val / maxVal) * CH
  const steamYPos = (val) => CB - (val / steamMaxVal) * CH

  const handleInteraction = (clientX, clientY) => {
    if (!chartRef.current || filteredData.length === 0) return
    const rect = chartRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const chartWidth = rect.width
    const pctStart = CL / VW, pctEnd = CR / VW
    const relX = x - chartWidth * pctStart
    const pct = Math.max(0, Math.min(1, relX / (chartWidth * (pctEnd - pctStart))))
    const idx = Math.round(pct * (filteredData.length - 1))
    const clamped = Math.max(0, Math.min(filteredData.length - 1, idx))
    setHoveredPoint(filteredData[clamped])
    setHoveredIndex(clamped)
    setMousePos({ x: clientX, y: clientY })
  }

  // X-axis labels with collision detection
  const getXAxisLabels = () => {
    if (filteredData.length === 0) return []

    if (viewMode === 'all') {
      const allMonths = []
      const seen = new Set()
      for (let i = 0; i < filteredData.length; i++) {
        const d = filteredData[i]
        const key = `${d.timestamp.getFullYear()}-${d.timestamp.getMonth()}`
        if (!seen.has(key)) {
          seen.add(key)
          allMonths.push({ index: i, text: d.timestamp.toLocaleDateString('en-US', { month: 'short' }) + " '" + d.timestamp.getFullYear().toString().slice(-2) })
        }
      }
      const max = 16
      if (allMonths.length <= max) return allMonths
      const result = []
      for (let i = 0; i < max; i++) result.push(allMonths[Math.floor((i / (max - 1)) * (allMonths.length - 1))])
      return result
    }

    if (viewMode === 'year') {
      const monthRanges = {}
      const monthOrder = []
      for (let i = 0; i < filteredData.length; i++) {
        const d = filteredData[i]
        const key = `${d.timestamp.getFullYear()}-${d.timestamp.getMonth()}`
        if (!monthRanges[key]) {
          monthRanges[key] = { first: i, last: i, timestamp: d.timestamp }
          monthOrder.push(key)
        } else {
          monthRanges[key].last = i
        }
      }
      return monthOrder.map(key => {
        const r = monthRanges[key]
        return {
          index: Math.round((r.first + r.last) / 2),
          text: r.timestamp.toLocaleDateString('en-US', { month: 'short' }) + " '" + r.timestamp.getFullYear().toString().slice(-2)
        }
      })
    }

    const count = 6
    const labels = []
    for (let i = 0; i < count; i++) {
      const idx = Math.floor((i / (count - 1)) * (filteredData.length - 1))
      const d = filteredData[idx]
      let text
      if (viewMode === 'live') {
        const time = d.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        if (i === 0 || i === count - 1) text = d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + time
        else text = time
      } else if (viewMode === 'week') {
        text = d.timestamp.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
      } else {
        text = d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      }
      labels.push({ index: idx, text })
    }
    return labels
  }

  // Time bands
  const getTimeBands = () => {
    if (filteredData.length === 0) return []
    const bands = []
    let start = 0, currentKey = null
    for (let i = 0; i < filteredData.length; i++) {
      const d = filteredData[i]
      let key
      if (viewMode === 'all') key = d.timestamp.getFullYear()
      else if (viewMode === 'year') key = `${d.timestamp.getFullYear()}-${d.timestamp.getMonth()}`
      else if (viewMode === 'week' || viewMode === 'month') key = d.timestamp.toISOString().split('T')[0]
      else key = d.timestamp.getHours()
      if (currentKey === null) currentKey = key
      else if (key !== currentKey) { bands.push({ start, end: i - 1 }); start = i; currentKey = key }
    }
    bands.push({ start, end: filteredData.length - 1 })
    return bands
  }

  // RS-styled panel helpers
  const rsPanel = (extra = {}) => ({
    background: RS.panelBg,
    border: `2px solid ${RS.panelBorder}`,
    boxShadow: `inset 0 0 0 1px ${RS.borderLight}, 0 2px 8px rgba(0,0,0,0.5)`,
    ...extra,
  })

  const rsPanelOuter = (extra = {}) => ({
    background: RS.panelBg,
    border: `3px solid ${RS.borderGold}`,
    boxShadow: `inset 0 0 0 2px ${RS.panelBorder}, 0 4px 16px rgba(0,0,0,0.6)`,
    ...extra,
  })

  // RS-styled select
  const rsSelect = {
    background: RS.tabInactive,
    border: `1px solid ${RS.panelBorder}`,
    color: RS.gold,
    padding: '4px 10px',
    borderRadius: '2px',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: '"Times New Roman", Georgia, serif',
  }

  const tabs = [
    { id: 'live', label: 'Hour' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' },
    { id: 'all', label: 'All' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: RS.bg, color: RS.textLight, fontFamily: '"Times New Roman", Georgia, serif' }}>
      {/* Top banner */}
      <div style={{
        background: `linear-gradient(180deg, #3d3322 0%, #2b2417 50%, #1e1a12 100%)`,
        borderBottom: `3px solid ${RS.borderGold}`,
        padding: isMobile ? '10px 16px' : '12px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: `inset 0 -1px 0 ${RS.panelBorder}, 0 2px 12px rgba(0,0,0,0.5)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{
            fontSize: isMobile ? '22px' : '28px', fontWeight: '700', color: RS.gold,
            textShadow: '2px 2px 4px #000, 0 0 8px rgba(200,170,110,0.3)',
            letterSpacing: '2px',
          }}>aggrgtr</span>
          {!isMobile && <span style={{ fontSize: '14px', color: RS.goldDim, fontStyle: 'italic' }}>Population Tracker</span>}
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <a href="https://paypal.me/aggrgtr" target="_blank" rel="noopener" style={{ color: RS.textGreen, textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}>Donate</a>
          <a href="https://discord.gg/E6z2CEUknK" target="_blank" rel="noopener" style={{ color: '#5865F2', textDecoration: 'none', fontSize: '14px' }}>Discord</a>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px 20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: RS.textYellow, fontSize: '20px' }}>Loading...</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '60px', color: RS.textRed, fontSize: '18px' }}>Error: {error?.message || 'Failed to load data'}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 280px', gap: '12px' }}>
            {/* Left column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

              {/* KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {[
                  { label: 'OSRS Online', value: latest?.osrs, color: RS.textGreen },
                  { label: 'RS3 Online', value: latest?.rs3, color: RS.textCyan },
                  { label: 'Total Online', value: latest?.total, color: RS.textYellow },
                ].map((kpi, i) => (
                  <div key={i} style={{ ...rsPanel({ padding: '10px 14px', textAlign: 'center' }) }}>
                    <div style={{ fontSize: '12px', color: RS.goldDim, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>{kpi.label}</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: kpi.color, textShadow: '1px 1px 2px #000', fontVariantNumeric: 'tabular-nums' }}>
                      {kpi.value?.toLocaleString() || '-'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Steam KPIs */}
              {steamData && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[
                    { label: 'OSRS (Steam)', value: steamData.osrs, color: RS.textOrange },
                    { label: 'RS3 (Steam)', value: steamData.rs3, color: RS.textCyan },
                    { label: 'Dragonwilds', value: steamData.dragonwilds, color: RS.textPurple },
                  ].map((kpi, i) => (
                    <div key={i} style={{ ...rsPanel({ padding: '8px 12px', textAlign: 'center' }) }}>
                      <div style={{ fontSize: '10px', color: RS.goldDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{kpi.label}</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: kpi.color, textShadow: '1px 1px 2px #000', fontVariantNumeric: 'tabular-nums' }}>
                        {kpi.value?.toLocaleString() || '-'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* OSRS vs RS3 ratio bar */}
              <div style={{ ...rsPanel({ padding: '8px 14px' }) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: RS.textGreen }}>OSRS {(osrsRatio * 100).toFixed(1)}%</span>
                  <span style={{ fontSize: '11px', color: RS.goldDim }}>Population Split</span>
                  <span style={{ fontSize: '11px', color: RS.textCyan }}>RS3 {((1 - osrsRatio) * 100).toFixed(1)}%</span>
                </div>
                <div style={{ height: '14px', background: '#0a0a08', borderRadius: '2px', overflow: 'hidden', border: `1px solid ${RS.panelBorder}`, display: 'flex' }}>
                  <div style={{ width: `${osrsRatio * 100}%`, background: 'linear-gradient(180deg, #00ff00, #008800)', transition: 'width 0.5s ease' }} />
                  <div style={{ flex: 1, background: 'linear-gradient(180deg, #00cccc, #006666)' }} />
                </div>
              </div>

              {/* Chart panel */}
              <div style={{ ...rsPanelOuter({ padding: '12px' }) }}>
                {/* Chart header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '16px', fontWeight: '700', color: RS.gold, textShadow: '0 0 6px rgba(255,221,68,0.3)' }}>Player Count</span>
                    {latest?.timestamp && (
                      <span style={{ fontSize: '12px', color: RS.textGreen }}>
                        Updated {Math.floor((Date.now() - latest.timestamp.getTime()) / 60000)}m ago
                      </span>
                    )}
                    {/* Filter controls */}
                    {viewMode === 'month' && (
                      <button onClick={() => setMonthFilterOn(!monthFilterOn)} style={{
                        background: monthFilterOn ? RS.tabActive : 'transparent',
                        border: `1px solid ${monthFilterOn ? RS.borderGold : RS.panelBorder}`,
                        color: monthFilterOn ? RS.gold : RS.goldDim,
                        padding: '3px 10px', borderRadius: '2px', fontSize: '11px', cursor: 'pointer', fontFamily: '"Times New Roman", Georgia, serif',
                      }}>Filter</button>
                    )}
                    {viewMode === 'year' && (
                      <button onClick={() => setYearFilterOn(!yearFilterOn)} style={{
                        background: yearFilterOn ? RS.tabActive : 'transparent',
                        border: `1px solid ${yearFilterOn ? RS.borderGold : RS.panelBorder}`,
                        color: yearFilterOn ? RS.gold : RS.goldDim,
                        padding: '3px 10px', borderRadius: '2px', fontSize: '11px', cursor: 'pointer', fontFamily: '"Times New Roman", Georgia, serif',
                      }}>Filter</button>
                    )}
                    {((viewMode === 'month' && monthFilterOn) || (viewMode === 'year' && yearFilterOn)) && (
                      <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} style={rsSelect}>
                        {getAvailableYears().map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    )}
                    {viewMode === 'month' && monthFilterOn && (
                      <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} style={rsSelect}>
                        {getAvailableMonths().map(m => <option key={m} value={m}>{monthNames[m]}</option>)}
                      </select>
                    )}
                  </div>

                  {/* Tabs */}
                  <div style={{ display: 'flex', gap: '2px' }}>
                    {tabs.map(tab => (
                      <button key={tab.id} onClick={() => setViewMode(tab.id)} style={{
                        background: viewMode === tab.id
                          ? `linear-gradient(180deg, ${RS.borderLight} 0%, ${RS.tabActive} 100%)`
                          : `linear-gradient(180deg, ${RS.panelBorder} 0%, ${RS.tabInactive} 100%)`,
                        border: `1px solid ${viewMode === tab.id ? RS.borderGold : RS.panelBorder}`,
                        borderBottom: viewMode === tab.id ? `1px solid ${RS.tabActive}` : `1px solid ${RS.panelBorder}`,
                        color: viewMode === tab.id ? RS.gold : RS.goldDim,
                        padding: '6px 16px', fontSize: '13px', fontWeight: viewMode === tab.id ? '700' : '400',
                        cursor: 'pointer', fontFamily: '"Times New Roman", Georgia, serif',
                        textShadow: viewMode === tab.id ? '0 0 6px rgba(255,221,68,0.4)' : 'none',
                      }}>{tab.label}</button>
                    ))}
                  </div>
                </div>

                {/* Chart */}
                <div
                  ref={chartRef}
                  style={{ height: isMobile ? '350px' : '520px', position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={(e) => handleInteraction(e.clientX, e.clientY)}
                  onMouseLeave={() => { setHoveredPoint(null); setHoveredIndex(-1) }}
                  onTouchMove={(e) => { if (e.touches?.[0]) { e.preventDefault(); handleInteraction(e.touches[0].clientX, e.touches[0].clientY) } }}
                  onTouchStart={(e) => { if (e.touches?.[0]) handleInteraction(e.touches[0].clientX, e.touches[0].clientY) }}
                  onTouchEnd={() => { setHoveredPoint(null); setHoveredIndex(-1) }}
                >
                  {filteredData.length > 0 && (
                    <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none">
                      {/* Time period bands */}
                      {getTimeBands().map((band, i) => (
                        <rect key={i} x={xPos(band.start)} y={CT} width={xPos(band.end) - xPos(band.start)} height={CH}
                          fill={i % 2 === 0 ? 'rgba(139,122,61,0.03)' : 'rgba(139,122,61,0.07)'} />
                      ))}

                      {/* Dark chart background */}
                      <rect x={CL} y={CT} width={CW} height={CH} fill="none" stroke={RS.panelBorder} strokeWidth="1.5" />

                      {/* Y-axis grid + labels */}
                      {yTicks.map((val, i) => {
                        const y = yPos(val)
                        return (
                          <g key={i}>
                            <line x1={CL} y1={y} x2={CR} y2={y} stroke="rgba(139,122,61,0.15)" strokeWidth="1" />
                            <text x={CL - 6} y={y + 4} fill={RS.goldDim} fontSize="10" textAnchor="end" fontFamily="monospace" fontWeight="bold">
                              {val.toLocaleString()}
                            </text>
                          </g>
                        )
                      })}

                      {/* Right Y-axis labels (Steam) */}
                      {steamChartData.length > 0 && steamYTicks.map((val, i) => (
                        <text key={`sy${i}`} x={CR + 6} y={steamYPos(val) + 4} fill={RS.textPurple} fontSize="10" textAnchor="start" fontFamily="monospace" fontWeight="bold">
                          {val.toLocaleString()}
                        </text>
                      ))}

                      {/* X-axis labels with collision detection */}
                      {(() => {
                        const allLabels = getXAxisLabels()
                        const minGap = 40
                        const visible = []
                        let lastX = -Infinity
                        for (const label of allLabels) {
                          const x = xPos(label.index)
                          if (x - lastX >= minGap) { visible.push({ ...label, x }); lastX = x }
                        }
                        return visible
                      })().map((label, i) => (
                        <text key={i} x={label.x} y={CB + 18} fill={RS.goldDim} fontSize="10" textAnchor="middle" fontFamily="monospace" fontWeight="bold">
                          {label.text}
                        </text>
                      ))}

                      {/* OSRS area + line */}
                      <path d={`M ${CL},${CB} ${filteredData.map((d, i) => `L ${xPos(i)},${yPos(d.osrs)}`).join(' ')} L ${CR},${CB} Z`} fill="rgba(0, 255, 0, 0.08)" />
                      <path d={`M ${filteredData.map((d, i) => `${xPos(i)},${yPos(d.osrs)}`).join(' L ')}`} fill="none" stroke="#00ff00" strokeWidth="2.5" />
                      {/* OSRS dots */}
                      {showDots && filteredData.map((d, i) => (
                        i % dotInterval === 0 && <circle key={`o${i}`} cx={xPos(i)} cy={yPos(d.osrs)} r="2.5" fill="#00ff00" stroke={RS.panelBg} strokeWidth="1" />
                      ))}

                      {/* RS3 area + line */}
                      <path d={`M ${CL},${CB} ${filteredData.map((d, i) => `L ${xPos(i)},${yPos(d.rs3)}`).join(' ')} L ${CR},${CB} Z`} fill="rgba(0, 204, 255, 0.08)" />
                      <path d={`M ${filteredData.map((d, i) => `${xPos(i)},${yPos(d.rs3)}`).join(' L ')}`} fill="none" stroke="#00ccff" strokeWidth="2.5" />
                      {/* RS3 dots */}
                      {showDots && filteredData.map((d, i) => (
                        i % dotInterval === 0 && <circle key={`r${i}`} cx={xPos(i)} cy={yPos(d.rs3)} r="2.5" fill="#00ccff" stroke={RS.panelBg} strokeWidth="1" />
                      ))}

                      {/* Steam time-series lines */}
                      {steamChartData.length > 1 && filteredData.length > 1 && (() => {
                        const minTime = filteredData[0].timestamp.getTime()
                        const maxTime = filteredData[filteredData.length - 1].timestamp.getTime()
                        const steamToX = (t) => {
                          const ts = t.getTime()
                          if (ts <= minTime) return xPos(0)
                          if (ts >= maxTime) return xPos(filteredData.length - 1)
                          let lo = 0, hi = filteredData.length - 1
                          while (lo < hi - 1) {
                            const mid = (lo + hi) >> 1
                            if (filteredData[mid].timestamp.getTime() <= ts) lo = mid; else hi = mid
                          }
                          const t0 = filteredData[lo].timestamp.getTime()
                          const t1 = filteredData[hi].timestamp.getTime()
                          const frac = (ts - t0) / (t1 - t0 || 1)
                          return xPos(lo + frac)
                        }
                        const osrsP = steamChartData.filter(d => d.osrs > 0)
                        const rs3P = steamChartData.filter(d => d.rs3 > 0)
                        const dwP = steamChartData.filter(d => d.dragonwilds > 0)
                        return (
                          <>
                            {osrsP.length > 1 && <path d={`M ${osrsP.map((d, i) => `${i > 0 ? 'L ' : ''}${steamToX(d.timestamp)},${steamYPos(d.osrs)}`).join(' ')}`} fill="none" stroke={RS.textOrange} strokeWidth="2" strokeDasharray="6,3" />}
                            {rs3P.length > 1 && <path d={`M ${rs3P.map((d, i) => `${i > 0 ? 'L ' : ''}${steamToX(d.timestamp)},${steamYPos(d.rs3)}`).join(' ')}`} fill="none" stroke="#22d3ee" strokeWidth="2" strokeDasharray="6,3" />}
                            {dwP.length > 1 && <path d={`M ${dwP.map((d, i) => `${i > 0 ? 'L ' : ''}${steamToX(d.timestamp)},${steamYPos(d.dragonwilds)}`).join(' ')}`} fill="none" stroke={RS.textPurple} strokeWidth="2" strokeDasharray="6,3" />}
                          </>
                        )
                      })()}

                      {/* Hover indicator */}
                      {hoveredPoint && hoveredIndex >= 0 && (() => {
                        const x = xPos(hoveredIndex)
                        const sp = getNearestSteamValues(hoveredPoint.timestamp)
                        return (
                          <>
                            <line x1={x} y1={CT} x2={x} y2={CB} stroke="rgba(200,170,110,0.4)" strokeWidth="1" />
                            <circle cx={x} cy={yPos(hoveredPoint.osrs)} r="5" fill="#00ff00" stroke="#000" strokeWidth="1.5" />
                            <circle cx={x} cy={yPos(hoveredPoint.rs3)} r="5" fill="#00ccff" stroke="#000" strokeWidth="1.5" />
                            {sp?.osrs > 0 && <circle cx={x} cy={steamYPos(sp.osrs)} r="5" fill={RS.textOrange} stroke="#000" strokeWidth="1.5" />}
                            {sp?.rs3 > 0 && <circle cx={x} cy={steamYPos(sp.rs3)} r="5" fill="#22d3ee" stroke="#000" strokeWidth="1.5" />}
                            {sp?.dragonwilds > 0 && <circle cx={x} cy={steamYPos(sp.dragonwilds)} r="5" fill={RS.textPurple} stroke="#000" strokeWidth="1.5" />}
                          </>
                        )
                      })()}

                      {/* Legend */}
                      <g transform={`translate(${VW / 2}, ${CB + 42})`}>
                        <rect x={-260} y={-8} width={12} height={12} rx={2} fill="#00ff00" />
                        <text x={-244} y={3} fill={RS.textGreen} fontSize="10">OSRS</text>
                        <rect x={-194} y={-8} width={12} height={12} rx={2} fill="#00ccff" />
                        <text x={-178} y={3} fill={RS.textCyan} fontSize="10">RS3</text>
                        <line x1={-128} y1={-2} x2={-100} y2={-2} stroke={RS.textOrange} strokeWidth="2" strokeDasharray="6,3" />
                        <text x={-94} y={3} fill={RS.textOrange} fontSize="10">OSRS Steam</text>
                        <line x1={-12} y1={-2} x2={16} y2={-2} stroke="#22d3ee" strokeWidth="2" strokeDasharray="6,3" />
                        <text x={22} y={3} fill="#22d3ee" fontSize="10">RS3 Steam</text>
                        <line x1={102} y1={-2} x2={130} y2={-2} stroke={RS.textPurple} strokeWidth="2" strokeDasharray="6,3" />
                        <text x={136} y={3} fill={RS.textPurple} fontSize="10">Dragonwilds</text>
                      </g>
                    </svg>
                  )}

                  {/* Tooltip */}
                  {hoveredPoint && (() => {
                    const tooltipWidth = 180, tooltipHeight = 160
                    const sw = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const sh = typeof window !== 'undefined' ? window.innerHeight : 800
                    const left = sw - mousePos.x < tooltipWidth + 30 ? mousePos.x - tooltipWidth - 15 : mousePos.x + 15
                    const top = sh - mousePos.y < tooltipHeight + 20 ? mousePos.y - tooltipHeight : mousePos.y - 80
                    return (
                      <div style={{
                        position: 'fixed', left, top, zIndex: 1000, pointerEvents: 'none',
                        ...rsPanel({ padding: '10px 14px', minWidth: '160px' }),
                      }}>
                        <div style={{ fontSize: '12px', color: RS.gold, marginBottom: '6px', borderBottom: `1px solid ${RS.panelBorder}`, paddingBottom: '6px', fontWeight: '700' }}>
                          {hoveredPoint.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {viewMode === 'live' && ` ${hoveredPoint.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                        </div>
                        <div style={{ fontSize: '13px', color: RS.textGreen, marginBottom: '3px' }}>OSRS: {hoveredPoint.osrs.toLocaleString()}</div>
                        <div style={{ fontSize: '13px', color: RS.textCyan, marginBottom: '3px' }}>RS3: {hoveredPoint.rs3.toLocaleString()}</div>
                        {(() => {
                          const sp = getNearestSteamValues(hoveredPoint.timestamp)
                          if (!sp) return null
                          return (
                            <div style={{ marginTop: '6px', borderTop: `1px solid ${RS.panelBorder}`, paddingTop: '5px', fontSize: '11px' }}>
                              <div style={{ color: RS.goldDim, marginBottom: '3px', fontWeight: '600' }}>Steam</div>
                              {sp.osrs > 0 && <div style={{ color: RS.textOrange }}>OSRS: {sp.osrs.toLocaleString()}</div>}
                              {sp.rs3 > 0 && <div style={{ color: '#22d3ee' }}>RS3: {sp.rs3.toLocaleString()}</div>}
                              {sp.dragonwilds > 0 && <div style={{ color: RS.textPurple }}>DW: {sp.dragonwilds.toLocaleString()}</div>}
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '6px' }}>
                {[
                  { label: 'Peak OSRS', value: peakOsrs, color: RS.textGreen, date: peakOsrsPoint?.timestamp },
                  { label: 'Peak RS3', value: peakRs3, color: RS.textCyan, date: peakRs3Point?.timestamp },

                  { label: '30d Avg OSRS', value: avg30Osrs, color: RS.textGreen },
                  { label: '30d Avg RS3', value: avg30Rs3, color: RS.textCyan },
                  { label: '1yr Avg OSRS', value: avgYrOsrs, color: RS.textGreen },
                  { label: '1yr Avg RS3', value: avgYrRs3, color: RS.textCyan },
                ].map((stat, i) => (
                  <div key={i} style={{ ...rsPanel({ padding: '8px 10px', textAlign: 'center' }) }}>
                    <div style={{ fontSize: '10px', color: RS.goldDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{stat.label}</div>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: stat.color, textShadow: '1px 1px 2px #000', fontVariantNumeric: 'tabular-nums' }}>
                      {stat.value.toLocaleString()}
                    </div>
                    {stat.date && (
                      <div style={{ fontSize: '10px', color: RS.goldDim, marginTop: '2px' }}>
                        {stat.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Right column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Gauge */}
              <div style={{ ...rsPanelOuter({ padding: '12px', textAlign: 'center' }) }}>
                <div style={{ fontSize: '11px', color: RS.goldDim, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Live Population</div>
                <svg width="100%" height="130" viewBox="0 0 200 130">
                  <path d="M 20 110 A 80 80 0 0 1 180 110" fill="none" stroke={RS.panelBorder} strokeWidth="12" strokeLinecap="round" />
                  {latest && (() => {
                    const pct = Math.min(1, latest.total / 200000)
                    const angle = Math.PI * pct
                    const endX = 100 - 80 * Math.cos(angle)
                    const endY = 110 - 80 * Math.sin(angle)
                    return (
                      <path d={`M 20 110 A 80 80 0 ${pct > 0.5 ? 1 : 0} 1 ${endX} ${endY}`}
                        fill="none" stroke="url(#gaugeGrad)" strokeWidth="12" strokeLinecap="round" />
                    )
                  })()}
                  <defs>
                    <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#ff3333" />
                      <stop offset="40%" stopColor="#ffdd44" />
                      <stop offset="100%" stopColor="#00ff00" />
                    </linearGradient>
                  </defs>
                  <text x="100" y="95" textAnchor="middle" fill={RS.gold} fontSize="26" fontWeight="700" fontFamily="Georgia, serif">
                    {latest?.total?.toLocaleString() || '-'}
                  </text>
                  <text x="100" y="115" textAnchor="middle" fill={RS.goldDim} fontSize="10">players online</text>
                  <text x="16" y="125" fill={RS.goldDim} fontSize="8" textAnchor="middle">0</text>
                  <text x="100" y="22" fill={RS.goldDim} fontSize="8" textAnchor="middle">100k</text>
                  <text x="184" y="125" fill={RS.goldDim} fontSize="8" textAnchor="middle">200k</text>
                </svg>
              </div>

              {/* Steam sidebar */}
              {steamData && (
                <div style={{ ...rsPanel({ padding: '10px 12px' }) }}>
                  <div style={{ fontSize: '11px', color: RS.goldDim, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', textAlign: 'center' }}>Steam Players</div>
                  {[
                    { label: 'OSRS', value: steamData.osrs, color: RS.textOrange },
                    { label: 'RS3', value: steamData.rs3, color: '#22d3ee' },
                    { label: 'Dragonwilds', value: steamData.dragonwilds, color: RS.textPurple },
                  ].map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: '2px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: s.color }}>{s.label}</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value?.toLocaleString() || '-'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Chat box */}
              <div style={{ ...rsPanelOuter({ padding: '0', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '280px' }) }}>
                <div style={{
                  padding: '6px 12px',
                  borderBottom: `1px solid ${RS.panelBorder}`,
                  background: `linear-gradient(180deg, ${RS.borderLight}22, ${RS.panelBg})`,
                }}>
                  <span style={{ fontSize: '11px', color: RS.gold, textTransform: 'uppercase', letterSpacing: '1px' }}>Activity Log</span>
                </div>
                <div style={{
                  flex: 1, overflowY: 'auto', padding: '8px 10px', background: RS.chatBg,
                  fontFamily: '"Courier New", monospace', fontSize: '11px', lineHeight: '1.6',
                }}>
                  {chatLog.map((msg, i) => (
                    <div key={i}>
                      <span style={{ color: '#666' }}>[{msg.time}]</span>{' '}
                      <span style={{ color: msg.color }}>{msg.text}</span>
                    </div>
                  ))}
                  {chatLog.length === 0 && <div style={{ color: '#444', fontStyle: 'italic' }}>Waiting for data updates...</div>}
                  <div ref={chatEndRef} />
                </div>
              </div>

              {/* Data age */}
              {latest?.timestamp && (
                <div style={{ ...rsPanel({ padding: '8px 12px', textAlign: 'center' }) }}>
                  <span style={{ fontSize: '11px', color: RS.goldDim }}>Last update: </span>
                  <span style={{ fontSize: '11px', color: RS.textYellow }}>
                    {Math.floor((Date.now() - latest.timestamp.getTime()) / 60000)}m ago
                  </span>
                </div>
              )}

            </div>
          </div>
        )}
      </div>

      <footer style={{
        borderTop: `2px solid ${RS.panelBorder}`, padding: '12px 32px', fontSize: '12px', color: RS.goldDim,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: `linear-gradient(180deg, ${RS.panelBg}, ${RS.bg})`, marginTop: '20px',
      }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <a href="/about" style={{ color: RS.goldDim, textDecoration: 'none' }}>About</a>
          <a href="/privacy" style={{ color: RS.goldDim, textDecoration: 'none' }}>Privacy Policy</a>
        </div>
        <span>aggrgtr 2026 -- Not affiliated with Jagex Ltd.</span>
      </footer>
    </div>
  )
}
