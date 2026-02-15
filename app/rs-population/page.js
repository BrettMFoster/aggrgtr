'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import useSWR from 'swr'

// Chart layout constants
const CL = 55    // chart left edge
const CR = 900   // chart right edge
const CW = CR - CL // chart width
const CT = 15    // chart top
const CB = 530   // chart bottom
const CH = CB - CT // chart height
const VW = 980   // viewBox width
const VH = 625   // viewBox height

// Time-of-Day chart vertical constants
const TOD_CT = 15
const TOD_CB = 330
const TOD_CH = TOD_CB - TOD_CT
const TOD_VH = 375

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
  const [allFilterOn, setAllFilterOn] = useState(false)
  const [showPre2013, setShowPre2013] = useState(true)
  const [allFilterStart, setAllFilterStart] = useState('2002-12-01')
  const [allFilterEnd, setAllFilterEnd] = useState(new Date().toISOString().split('T')[0])
  const chartRef = useRef(null)
  const todChartRef = useRef(null)
  const [todHoveredHour, setTodHoveredHour] = useState(-1)
  const [todMousePos, setTodMousePos] = useState({ x: 0, y: 0 })
  const [todHoverMode, setTodHoverMode] = useState('avg')
  const [todNearestToday, setTodNearestToday] = useState(null)
  const [todFilter, setTodFilter] = useState('dow3m')

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

  // Wayback Machine data (2002-2013 pre-EOC era)
  const { data: waybackData } = useSWR('/csv/RS_Wayback_Population.csv', async (url) => {
    const res = await fetch(url)
    const text = await res.text()
    return text.trim().split('\n').slice(1).map(line => {
      const cols = line.split(',')
      return {
        timestamp: new Date(`${cols[0]}T${cols[1]}Z`),
        preEOC: parseInt(cols[4]) || 0
      }
    }).filter(d => d.preEOC > 0)
  }, { revalidateOnFocus: false, revalidateOnReconnect: false })

  const loading = !historicalJson || !liveJson
  const error = historicalError || liveError

  // Process and combine data when it arrives
  const data = useMemo(() => {
    if (!historicalJson || !liveJson) return []

    // Wayback data: pre-EOC before Nov 20 2012, RS3 after EOC launch
    const EOC_DATE = new Date('2012-11-20T00:00:00Z')
    const wayback = (waybackData || []).map(r => {
      const ts = new Date(r.timestamp)
      const isPreEOC = ts < EOC_DATE
      return {
        timestamp: ts,
        osrs: 0,
        rs3: isPreEOC ? 0 : r.preEOC,
        preEOC: isPreEOC ? r.preEOC : 0,
        total: r.preEOC
      }
    })

    const historicalData = (historicalJson.rows || []).map(r => ({
      ...r,
      preEOC: 0,
      timestamp: new Date(r.timestamp)
    }))
    const liveData = (liveJson.rows || []).map(r => ({
      ...r,
      preEOC: 0,
      timestamp: new Date(r.timestamp)
    }))

    const combined = [...(showPre2013 ? wayback : []), ...historicalData]
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
  }, [historicalJson, liveJson, waybackData, showPre2013])

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
    if (!steamChartData.length) return null
    const t = timestamp.getTime()
    const steamMin = steamChartData[0].timestamp.getTime()
    const steamMax = steamChartData[steamChartData.length - 1].timestamp.getTime()
    // Only show steam data if hovered point is within the steam data time range (with 1 day buffer)
    const buffer = 24 * 60 * 60 * 1000
    if (t < steamMin - buffer || t > steamMax + buffer) return null
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
      filtered = aggregateByDay(filtered)
    } else {
      if (viewMode === 'all' && allFilterOn) {
        const startDate = new Date(allFilterStart + 'T00:00:00')
        const endDate = new Date(allFilterEnd + 'T23:59:59')
        filtered = data.filter(d => d.timestamp >= startDate && d.timestamp <= endDate)
      } else {
        const cutoffs = {
          'live': 24 * 60 * 60 * 1000,
          'week': 7 * 24 * 60 * 60 * 1000,
          'all': Infinity
        }
        const cutoff = now.getTime() - cutoffs[viewMode]
        filtered = data.filter(d => d.timestamp.getTime() > cutoff)
      }
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
        byDay[dayKey] = { osrs: [], rs3: [], preEOC: [], total: [] }
      }
      byDay[dayKey].osrs.push(point.osrs || 0)
      byDay[dayKey].rs3.push(point.rs3 || 0)
      byDay[dayKey].preEOC.push(point.preEOC || 0)
      byDay[dayKey].total.push(point.total || 0)
    }
    return Object.entries(byDay).map(([day, values]) => {
      const [y, m, d] = day.split('-').map(Number)
      return {
        timestamp: new Date(y, m - 1, d),
        osrs: Math.round(values.osrs.reduce((a, b) => a + b, 0) / values.osrs.length),
        rs3: Math.round(values.rs3.reduce((a, b) => a + b, 0) / values.rs3.length),
        preEOC: Math.round(values.preEOC.reduce((a, b) => a + b, 0) / values.preEOC.length),
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

  // Left Y-axis: RS population data + Pre-EOC when in 'all' view
  const rawMax = filteredData.length > 0 ? Math.max(
    ...filteredData.map(d => d.osrs),
    ...(viewMode === 'all' ? filteredData.map(d => d.preEOC || 0) : []),
    1
  ) : 1
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
  const threeMonthsAgo = now.getTime() - 90 * 24 * 60 * 60 * 1000
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

  // Time of Day chart data - filtered by todFilter
  const todFilteredData = useMemo(() => {
    const todayDow = now.getDay()
    if (todFilter === '3mo') {
      return data.filter(d => d.timestamp.getTime() > threeMonthsAgo)
    } else if (todFilter === 'dow1m') {
      return data.filter(d => d.timestamp.getTime() > thirtyDaysAgo && d.timestamp.getDay() === todayDow)
    } else if (todFilter === 'dow3m') {
      return data.filter(d => d.timestamp.getTime() > threeMonthsAgo && d.timestamp.getDay() === todayDow)
    }
    return last30Days // default '30d'
  }, [data, last30Days, todFilter, threeMonthsAgo])

  const hourlyAverage = useMemo(() => {
    if (todFilteredData.length === 0) return Array.from({ length: 24 }, (_, h) => ({ hour: h, avgRs3: 0, count: 0 }))
    const byHour = Array.from({ length: 24 }, () => [])
    for (const point of todFilteredData) {
      byHour[point.timestamp.getHours()].push(point.rs3)
    }
    return byHour.map((values, hour) => ({
      hour,
      avgRs3: values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0,
      count: values.length
    }))
  }, [todFilteredData])

  const todayRs3Data = useMemo(() => {
    if (data.length === 0) return []
    const now = new Date()
    const ty = now.getFullYear(), tm = now.getMonth(), td = now.getDate()
    return data.filter(pt => {
      const t = pt.timestamp
      return t.getFullYear() === ty && t.getMonth() === tm && t.getDate() === td
    })
  }, [data])

  const todayByHourLookup = useMemo(() => {
    const lookup = {}
    for (const pt of todayRs3Data) {
      const h = pt.timestamp.getHours()
      if (!lookup[h]) lookup[h] = []
      lookup[h].push(pt.rs3)
    }
    const result = {}
    for (const [h, values] of Object.entries(lookup)) {
      result[parseInt(h)] = Math.round(values.reduce((a, b) => a + b, 0) / values.length)
    }
    return result
  }, [todayRs3Data])

  const todPeakHour = hourlyAverage.reduce((best, h) => h.avgRs3 > best.avgRs3 ? h : best, hourlyAverage[0])
  const todOffPeakHour = hourlyAverage.filter(h => h.count > 0).reduce((best, h) => h.avgRs3 < best.avgRs3 ? h : best, hourlyAverage[0])
  const todCurrentHour = new Date().getHours()
  const todCurrentAvg = hourlyAverage[todCurrentHour]?.avgRs3 || 0
  const todVsAvg = (latest?.rs3 || 0) - todCurrentAvg

  const formatHour = (h) => {
    if (h === 0 || h === 24) return '12 AM'
    if (h === 12) return '12 PM'
    return h < 12 ? `${h} AM` : `${h - 12} PM`
  }

  const todChartMax = Math.max(...hourlyAverage.map(h => h.avgRs3), ...todayRs3Data.map(d => d.rs3), 1)
  const todYTicks = computeYTicks(todChartMax)
  const todYMax = todYTicks[todYTicks.length - 1] || 1
  const todX = (h) => CL + (h / 24) * CW
  const todY = (v) => TOD_CB - (v / todYMax) * TOD_CH

  const handleTodInteraction = (clientX, clientY) => {
    if (!todChartRef.current) return
    const rect = todChartRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const chartStartPct = CL / VW
    const chartEndPct = CR / VW
    const chartAreaWidth = rect.width * (chartEndPct - chartStartPct)
    const chartAreaStart = rect.width * chartStartPct
    const relativeX = x - chartAreaStart
    const pct = Math.max(0, Math.min(1, relativeX / chartAreaWidth))
    const fracHour = pct * 24
    const roundedHour = Math.max(0, Math.min(23, Math.round(fracHour)))

    // Find nearest today data point by time
    let nearestPt = null
    let minTimeDist = Infinity
    for (const pt of todayRs3Data) {
      const fh = pt.timestamp.getHours() + pt.timestamp.getMinutes() / 60
      const dist = Math.abs(fh - fracHour)
      if (dist < minTimeDist) {
        minTimeDist = dist
        nearestPt = pt
      }
    }

    // Convert mouse Y to data value to determine which line is closer
    const svgY = (y / rect.height) * TOD_VH
    const mouseValue = ((TOD_CB - svgY) / TOD_CH) * todYMax

    const avgValue = hourlyAverage[roundedHour]?.avgRs3 || 0
    const todayValue = nearestPt?.rs3 || 0
    const avgDist = Math.abs(mouseValue - avgValue)
    const todayDist = nearestPt ? Math.abs(mouseValue - todayValue) : Infinity

    if (todayDist < avgDist && nearestPt) {
      setTodHoverMode('today')
      setTodNearestToday(nearestPt)
    } else {
      setTodHoverMode('avg')
      setTodNearestToday(null)
    }

    setTodHoveredHour(roundedHour)
    setTodMousePos({ x: clientX, y: clientY })
  }

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
      const maxLabels = 28
      if (allMonths.length <= maxLabels) return allMonths
      const result = []
      for (let i = 0; i < maxLabels; i++) {
        const idx = Math.floor((i / (maxLabels - 1)) * (allMonths.length - 1))
        result.push(allMonths[idx])
      }
      return result
    }

    if (viewMode === 'year') {
      // Label every ~2 weeks for more granularity
      const seen = new Set()
      const result = []
      for (let i = 0; i < filteredData.length; i++) {
        const d = filteredData[i]
        const day = d.timestamp.getDate()
        // Show 1st and 15th of each month
        const slot = day < 8 ? 1 : day < 22 ? 15 : null
        if (slot === null) continue
        const key = `${d.timestamp.getFullYear()}-${d.timestamp.getMonth()}-${slot}`
        if (!seen.has(key)) {
          seen.add(key)
          const text = d.timestamp.toLocaleDateString('en-US', { month: 'short' }) + " '" + d.timestamp.getFullYear().toString().slice(-2)
          result.push({ index: i, text })
        }
      }
      return result
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
                    {viewMode === 'all' && !isMobile && (
                      <button
                        onClick={() => setShowPre2013(!showPre2013)}
                        style={{
                          background: showPre2013 ? '#1a1a1a' : 'transparent',
                          border: showPre2013 ? '1px solid #4ade80' : '1px solid #333',
                          color: showPre2013 ? '#4ade80' : '#666',
                          padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
                        }}
                      >
                        Pre-2013
                      </button>
                    )}
                    {viewMode === 'all' && !isMobile && (
                      <button
                        onClick={() => setAllFilterOn(!allFilterOn)}
                        style={{
                          background: allFilterOn ? '#1a1a1a' : 'transparent',
                          border: allFilterOn ? '1px solid #4ade80' : '1px solid #333',
                          color: allFilterOn ? '#4ade80' : '#666',
                          padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
                        }}
                      >
                        Filter
                      </button>
                    )}
                    {viewMode === 'all' && allFilterOn && !isMobile && (
                      <>
                        <input
                          type="date"
                          value={allFilterStart}
                          onChange={(e) => setAllFilterStart(e.target.value)}
                          style={{ background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', colorScheme: 'dark' }}
                        />
                        <span style={{ color: '#666', fontSize: '12px' }}>to</span>
                        <input
                          type="date"
                          value={allFilterEnd}
                          onChange={(e) => setAllFilterEnd(e.target.value)}
                          style={{ background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', colorScheme: 'dark' }}
                        />
                      </>
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
                {viewMode === 'all' && isMobile && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                    <button
                      onClick={() => setShowPre2013(!showPre2013)}
                      style={{
                        background: showPre2013 ? '#1a1a1a' : 'transparent',
                        border: showPre2013 ? '1px solid #4ade80' : '1px solid #333',
                        color: showPre2013 ? '#4ade80' : '#666',
                        padding: '6px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer'
                      }}
                    >
                      Pre-2013
                    </button>
                    <button
                      onClick={() => setAllFilterOn(!allFilterOn)}
                      style={{
                        background: allFilterOn ? '#1a1a1a' : 'transparent',
                        border: allFilterOn ? '1px solid #4ade80' : '1px solid #333',
                        color: allFilterOn ? '#4ade80' : '#666',
                        padding: '6px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer'
                      }}
                    >
                      Filter
                    </button>
                    {allFilterOn && (
                      <>
                        <input
                          type="date"
                          value={allFilterStart}
                          onChange={(e) => setAllFilterStart(e.target.value)}
                          style={{ background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '6px 8px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', colorScheme: 'dark' }}
                        />
                        <span style={{ color: '#666', fontSize: '13px' }}>to</span>
                        <input
                          type="date"
                          value={allFilterEnd}
                          onChange={(e) => setAllFilterEnd(e.target.value)}
                          style={{ background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '6px 8px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', colorScheme: 'dark' }}
                        />
                      </>
                    )}
                  </div>
                )}
                {viewMode === 'all' && showPre2013 && (
                  <div style={{ fontSize: '11px', color: '#a3a3a3', marginBottom: '8px', fontStyle: 'italic' }}>
                    Warning: Pre-2013 data from Wayback were mostly captured at peak hours. Averages were likely lower. Post-2013 data are daily averages.
                  </div>
                )}

                <div
                  ref={chartRef}
                  style={{ height: isMobile ? '350px' : '690px', position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => { setHoveredPoint(null); setHoveredIndex(-1); }}
                  onTouchMove={handleTouchMove}
                  onTouchStart={(e) => { if (e.touches && e.touches[0]) handleInteraction(e.touches[0].clientX, e.touches[0].clientY); }}
                  onTouchEnd={() => { setHoveredPoint(null); setHoveredIndex(-1); }}
                >
                  {filteredData.length > 0 && (
                    <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${(viewMode === 'year' || viewMode === 'all') ? VH : VH - 25}`} preserveAspectRatio="none">
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
                        const isAngled = viewMode === 'all' || viewMode === 'year'
                        const minGap = isAngled ? 20 : 40
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
                      })().map((label, i) => {
                        const isAngled = viewMode === 'all' || viewMode === 'year'
                        return (
                          <text
                            key={i}
                            x={label.x}
                            y={CB + 22}
                            fill="#fff"
                            fontSize={isAngled ? '10' : '12'}
                            fontWeight="bold"
                            textAnchor={isAngled ? 'end' : 'middle'}
                            transform={isAngled ? `rotate(-45, ${label.x}, ${CB + 22})` : undefined}
                          >
                            {label.text}
                          </text>
                        )
                      })}

                      {/* OSRS area fill */}
                      {(() => {
                        const pts = filteredData.map((d, i) => ({ ...d, idx: i })).filter(d => d.osrs > 0)
                        if (pts.length < 2) return null
                        return <path d={`M ${xPos(pts[0].idx)},${CB} ${pts.map(d => `L ${xPos(d.idx)},${yPos(d.osrs)}`).join(' ')} L ${xPos(pts[pts.length - 1].idx)},${CB} Z`} fill="rgba(74, 222, 128, 0.15)" />
                      })()}
                      {/* OSRS line */}
                      {(() => {
                        const pts = filteredData.map((d, i) => ({ ...d, idx: i })).filter(d => d.osrs > 0)
                        if (pts.length < 2) return null
                        return <path d={`M ${pts.map(d => `${xPos(d.idx)},${yPos(d.osrs)}`).join(' L ')}`} fill="none" stroke="#4ade80" strokeWidth="2.5" />
                      })()}
                      {/* OSRS dots */}
                      {showDots && filteredData.map((d, i) => (
                        i % dotInterval === 0 && d.osrs > 0 && (
                          <circle key={`o${i}`} cx={xPos(i)} cy={yPos(d.osrs)} r="2.5" fill="#4ade80" stroke="#111" strokeWidth="1" />
                        )
                      ))}

                      {/* RS3 area fill */}
                      {(() => {
                        const pts = filteredData.map((d, i) => ({ ...d, idx: i })).filter(d => d.rs3 > 0)
                        if (pts.length < 2) return null
                        return <path d={`M ${xPos(pts[0].idx)},${CB} ${pts.map(d => `L ${xPos(d.idx)},${yPos(d.rs3)}`).join(' ')} L ${xPos(pts[pts.length - 1].idx)},${CB} Z`} fill="rgba(96, 165, 250, 0.15)" />
                      })()}
                      {/* RS3 line */}
                      {(() => {
                        const pts = filteredData.map((d, i) => ({ ...d, idx: i })).filter(d => d.rs3 > 0)
                        if (pts.length < 2) return null
                        return <path d={`M ${pts.map(d => `${xPos(d.idx)},${yPos(d.rs3)}`).join(' L ')}`} fill="none" stroke="#60a5fa" strokeWidth="2.5" />
                      })()}
                      {/* RS3 dots */}
                      {showDots && filteredData.map((d, i) => (
                        i % dotInterval === 0 && d.rs3 > 0 && (
                          <circle key={`r${i}`} cx={xPos(i)} cy={yPos(d.rs3)} r="2.5" fill="#60a5fa" stroke="#111" strokeWidth="1" />
                        )
                      ))}

                      {/* Pre-EOC area fill (wayback data, All Time view only) */}
                      {viewMode === 'all' && (() => {
                        const preEocPoints = filteredData.map((d, i) => ({ ...d, idx: i })).filter(d => d.preEOC > 0)
                        if (preEocPoints.length < 2) return null
                        const first = preEocPoints[0]
                        const last = preEocPoints[preEocPoints.length - 1]
                        return (
                          <>
                            <path
                              d={`M ${xPos(first.idx)},${CB} ${preEocPoints.map(d => `L ${xPos(d.idx)},${yPos(d.preEOC)}`).join(' ')} L ${xPos(last.idx)},${CB} Z`}
                              fill="rgba(212, 212, 212, 0.1)"
                            />
                            <path
                              d={`M ${preEocPoints.map(d => `${xPos(d.idx)},${yPos(d.preEOC)}`).join(' L ')}`}
                              fill="none"
                              stroke="#d4d4d4"
                              strokeWidth="2.5"
                            />
                            {showDots && preEocPoints.map((d) => (
                              d.idx % dotInterval === 0 && (
                                <circle key={`p${d.idx}`} cx={xPos(d.idx)} cy={yPos(d.preEOC)} r="2.5" fill="#d4d4d4" stroke="#111" strokeWidth="1" />
                              )
                            ))}
                          </>
                        )
                      })()}

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
                            {hoveredPoint.osrs > 0 && <circle cx={x} cy={yPos(hoveredPoint.osrs)} r="5" fill="#4ade80" stroke="#111" strokeWidth="1.5" />}
                            {hoveredPoint.rs3 > 0 && <circle cx={x} cy={yPos(hoveredPoint.rs3)} r="5" fill="#60a5fa" stroke="#111" strokeWidth="1.5" />}
                            {hoveredPoint.preEOC > 0 && <circle cx={x} cy={yPos(hoveredPoint.preEOC)} r="5" fill="#d4d4d4" stroke="#111" strokeWidth="1.5" />}
                            {sp?.osrs > 0 && <circle cx={x} cy={steamYPos(sp.osrs)} r="5" fill="#f59e0b" stroke="#111" strokeWidth="1.5" />}
                            {sp?.rs3 > 0 && <circle cx={x} cy={steamYPos(sp.rs3)} r="5" fill="#22d3ee" stroke="#111" strokeWidth="1.5" />}
                            {sp?.dragonwilds > 0 && <circle cx={x} cy={steamYPos(sp.dragonwilds)} r="5" fill="#a855f7" stroke="#111" strokeWidth="1.5" />}
                          </>
                        )
                      })()}

                      {/* Legend at bottom of chart */}
                      {(() => {
                        const items = [
                          { type: 'rect', color: '#4ade80', label: 'OSRS', w: 45 },
                          { type: 'rect', color: '#60a5fa', label: 'RS3', w: 35 },
                          ...(viewMode === 'all' ? [{ type: 'rect', color: '#d4d4d4', label: 'Pre-2013', w: 60 }] : []),
                          { type: 'line', color: '#f59e0b', label: 'OSRS Steam', w: 80 },
                          { type: 'line', color: '#22d3ee', label: 'RS3 Steam', w: 72 },
                          { type: 'line', color: '#a855f7', label: 'Dragonwilds', w: 82 },
                        ]
                        const itemPad = 16 // icon width + gap to text
                        const gapBetween = 20
                        const totalWidth = items.reduce((s, it) => s + itemPad + it.w, 0) + gapBetween * (items.length - 1)
                        const startX = (CL + CR) / 2 - totalWidth / 2
                        const legendY = (viewMode === 'year' || viewMode === 'all') ? CB + 85 : CB + 55
                        let cx = startX
                        return (
                          <g transform={`translate(0, ${legendY})`}>
                            {items.map((item) => {
                              const x = cx
                              cx += itemPad + item.w + gapBetween
                              return (
                                <g key={item.label}>
                                  {item.type === 'rect' ? (
                                    <rect x={x} y={-7} width={14} height={14} rx={2} fill={item.color} />
                                  ) : (
                                    <line x1={x} y1={0} x2={x + 14} y2={0} stroke={item.color} strokeWidth="3" strokeDasharray="6,3" />
                                  )}
                                  <text x={x + 18} y={5} fill="#fff" fontSize="13" fontWeight="500">{item.label}</text>
                                </g>
                              )
                            })}
                          </g>
                        )
                      })()}
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
                      {hoveredPoint.preEOC > 0 && (
                        <div style={{ fontSize: '14px', color: '#fff', marginBottom: '4px' }}>
                          <span style={{ color: '#d4d4d4', fontWeight: '700' }}>Pre-2013:</span> {hoveredPoint.preEOC.toLocaleString()}
                        </div>
                      )}
                      {hoveredPoint.osrs > 0 && (
                        <div style={{ fontSize: '14px', color: '#fff', marginBottom: '4px' }}>
                          <span style={{ color: '#4ade80', fontWeight: '700' }}>OSRS:</span> {hoveredPoint.osrs.toLocaleString()}
                        </div>
                      )}
                      {hoveredPoint.rs3 > 0 && (
                        <div style={{ fontSize: '14px', color: '#fff', marginBottom: '4px' }}>
                          <span style={{ color: '#60a5fa', fontWeight: '700' }}>RS3:</span> {hoveredPoint.rs3.toLocaleString()}
                        </div>
                      )}
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

              {/* RS3 Time of Day */}
              <div style={{ marginTop: '8px' }}>
                <div style={{ marginBottom: '4px' }}>
                  <h2 style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: '600', color: '#fff', margin: '0 0 1px 0', letterSpacing: '-0.5px' }}>RS3 Time of Day</h2>
                  <div style={{ fontSize: '13px', color: '#999' }}>
                    {todFilter === '30d' && '30-day average RS3 players by hour with today overlaid'}
                    {todFilter === '3mo' && '3-month average RS3 players by hour with today overlaid'}
                    {todFilter === 'dow1m' && `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()]} average (last 30 days) with today overlaid`}
                    {todFilter === 'dow3m' && `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()]} average (last 3 months) with today overlaid`}
                  </div>
                </div>

                {/* TOD KPI Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '8px 12px' : '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: '500', color: '#fff', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>Peak Hour</div>
                    <div style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#60a5fa', lineHeight: '1.2' }}>{formatHour(todPeakHour?.hour ?? 0)}</div>
                    <div style={{ fontSize: '12px', color: '#fff', marginTop: '2px', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums' }}>{(todPeakHour?.avgRs3 ?? 0).toLocaleString()} avg</div>
                  </div>
                  <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '8px 12px' : '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: '500', color: '#fff', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>Off-Peak Hour</div>
                    <div style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#60a5fa', lineHeight: '1.2' }}>{formatHour(todOffPeakHour?.hour ?? 0)}</div>
                    <div style={{ fontSize: '12px', color: '#fff', marginTop: '2px', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums' }}>{(todOffPeakHour?.avgRs3 ?? 0).toLocaleString()} avg</div>
                  </div>
                  <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '8px 12px' : '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: '500', color: '#fff', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>Now vs Average</div>
                    <div style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: todVsAvg >= 0 ? '#4ade80' : '#f87171', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums' }}>
                      {todVsAvg >= 0 ? '+' : ''}{todVsAvg.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '12px', color: '#fff', marginTop: '2px', lineHeight: '1.2' }}>for {formatHour(todCurrentHour)}</div>
                  </div>
                </div>

                {/* TOD Chart */}
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '10px' : '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '8px' : '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <h3 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: 0 }}>
                      {todFilter === '30d' && '30-Day Average'}
                      {todFilter === '3mo' && '3-Month Average'}
                      {todFilter === 'dow1m' && `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()]} Average (1M)`}
                      {todFilter === 'dow3m' && `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()]} Average (3M)`}
                    </h3>
                    <div style={{ display: 'flex', gap: '4px', background: '#1a1a1a', borderRadius: '8px', padding: '3px' }}>
                      {[
                        { id: '30d', label: '30 Day' },
                        { id: '3mo', label: '3 Month' },
                        { id: 'dow1m', label: 'Day of Week (1M)' },
                        { id: 'dow3m', label: 'Day of Week (3M)' },
                      ].map(f => (
                        <button key={f.id} onClick={() => setTodFilter(f.id)} style={{
                          background: todFilter === f.id ? '#333' : 'transparent',
                          border: 'none',
                          color: todFilter === f.id ? '#fff' : '#ddd',
                          padding: isMobile ? '8px 14px' : '8px 18px',
                          borderRadius: '6px',
                          fontSize: isMobile ? '13px' : '15px',
                          cursor: 'pointer',
                          fontWeight: todFilter === f.id ? '600' : '400',
                          transition: 'all 0.15s ease'
                        }}>{f.label}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ position: 'relative', width: '100%', height: isMobile ? '350px' : '550px', overflow: 'hidden' }}>
                  <svg
                    ref={todChartRef}
                    viewBox={`0 0 ${VW} ${TOD_VH}`}
                    preserveAspectRatio="none"
                    style={{ width: '100%', height: '100%', display: 'block' }}
                    onMouseMove={(e) => handleTodInteraction(e.clientX, e.clientY)}
                    onMouseLeave={() => { setTodHoveredHour(-1); setTodHoverMode('avg'); setTodNearestToday(null) }}
                    onTouchMove={(e) => { if (e.touches[0]) { e.preventDefault(); handleTodInteraction(e.touches[0].clientX, e.touches[0].clientY) } }}
                    onTouchEnd={() => setTodHoveredHour(-1)}
                  >
                    {/* Y-axis grid lines and labels */}
                    {todYTicks.map(v => (
                      <g key={v}>
                        <line x1={CL} y1={todY(v)} x2={CR} y2={todY(v)} stroke="#222" strokeWidth="1" />
                        <text x={CL - 8} y={todY(v) + 4} textAnchor="end" fill="#fff" fontSize="11" style={{ fontFamily: 'sans-serif' }}>
                          {v.toLocaleString()}
                        </text>
                      </g>
                    ))}

                    {/* X-axis labels every 3 hours */}
                    {[0, 3, 6, 9, 12, 15, 18, 21].map(h => (
                      <text key={h} x={todX(h)} y={TOD_CB + 20} textAnchor="middle" fill="#fff" fontSize="11" style={{ fontFamily: 'sans-serif' }}>
                        {formatHour(h)}
                      </text>
                    ))}

                    {/* Historical average filled area */}
                    <path
                      d={`M ${todX(0)} ${todY(hourlyAverage[0]?.avgRs3 || 0)} ${hourlyAverage.map(h => `L ${todX(h.hour)} ${todY(h.avgRs3)}`).join(' ')} L ${todX(23)} ${TOD_CB} L ${todX(0)} ${TOD_CB} Z`}
                      fill="rgba(96, 165, 250, 0.1)"
                    />

                    {/* Historical average line */}
                    <path
                      d={hourlyAverage.map((h, i) => `${i === 0 ? 'M' : 'L'} ${todX(h.hour)} ${todY(h.avgRs3)}`).join(' ')}
                      fill="none"
                      stroke="rgba(96, 165, 250, 0.4)"
                      strokeWidth="2"
                    />

                    {/* Today's RS3 line */}
                    {todayRs3Data.length > 1 && (
                      <path
                        d={todayRs3Data.map((d, i) => {
                          const fh = d.timestamp.getHours() + d.timestamp.getMinutes() / 60
                          return `${i === 0 ? 'M' : 'L'} ${todX(fh)} ${todY(d.rs3)}`
                        }).join(' ')}
                        fill="none"
                        stroke="#60a5fa"
                        strokeWidth="3"
                      />
                    )}

                    {/* Peak hour marker */}
                    <line
                      x1={todX(todPeakHour?.hour ?? 12)} y1={TOD_CT}
                      x2={todX(todPeakHour?.hour ?? 12)} y2={TOD_CB}
                      stroke="#60a5fa" strokeWidth="1" strokeDasharray="4,4" opacity="0.5"
                    />
                    <text x={todX(todPeakHour?.hour ?? 12)} y={TOD_CT - 2} textAnchor="middle" fill="#60a5fa" fontSize="9" opacity="0.8" style={{ fontFamily: 'sans-serif' }}>PEAK</text>

                    {/* "Now" indicator */}
                    {(() => {
                      const n = new Date()
                      const fh = n.getHours() + n.getMinutes() / 60
                      return (
                        <>
                          <line x1={todX(fh)} y1={TOD_CT} x2={todX(fh)} y2={TOD_CB} stroke="#fff" strokeWidth="1.5" strokeDasharray="4,4" />
                          <text x={todX(fh)} y={TOD_CT - 2} textAnchor="middle" fill="#fff" fontSize="9" style={{ fontFamily: 'sans-serif' }}>NOW</text>
                        </>
                      )
                    })()}

                    {/* Hover indicator */}
                    {todHoveredHour >= 0 && (() => {
                      if (todHoverMode === 'today' && todNearestToday) {
                        const fh = todNearestToday.timestamp.getHours() + todNearestToday.timestamp.getMinutes() / 60
                        return (
                          <>
                            <line x1={todX(fh)} y1={TOD_CT} x2={todX(fh)} y2={TOD_CB} stroke="#fff" strokeWidth="1" opacity="0.3" />
                            <circle cx={todX(fh)} cy={todY(todNearestToday.rs3)} r="5" fill="#60a5fa" stroke="#fff" strokeWidth="2" />
                            <circle cx={todX(todHoveredHour)} cy={todY(hourlyAverage[todHoveredHour]?.avgRs3 || 0)} r="4" fill="rgba(96, 165, 250, 0.15)" stroke="rgba(96, 165, 250, 0.3)" strokeWidth="1" />
                          </>
                        )
                      }
                      return (
                        <>
                          <line x1={todX(todHoveredHour)} y1={TOD_CT} x2={todX(todHoveredHour)} y2={TOD_CB} stroke="#fff" strokeWidth="1" opacity="0.3" />
                          <circle cx={todX(todHoveredHour)} cy={todY(hourlyAverage[todHoveredHour]?.avgRs3 || 0)} r="5" fill="rgba(96, 165, 250, 0.3)" stroke="rgba(96, 165, 250, 0.6)" strokeWidth="2" />
                          {todayByHourLookup[todHoveredHour] !== undefined && (
                            <circle cx={todX(todHoveredHour)} cy={todY(todayByHourLookup[todHoveredHour])} r="4" fill="#60a5fa" stroke="#fff" strokeWidth="1" />
                          )}
                        </>
                      )
                    })()}

                    {/* Legend */}
                    <rect x={CR - 200} y={TOD_CT + 5} width="10" height="10" fill="rgba(96, 165, 250, 0.15)" stroke="rgba(96, 165, 250, 0.4)" strokeWidth="1" />
                    <text x={CR - 186} y={TOD_CT + 14} fill="#fff" fontSize="11" style={{ fontFamily: 'sans-serif' }}>Average</text>
                    <line x1={CR - 105} y1={TOD_CT + 10} x2={CR - 80} y2={TOD_CT + 10} stroke="#60a5fa" strokeWidth="3" />
                    <text x={CR - 76} y={TOD_CT + 14} fill="#fff" fontSize="11" style={{ fontFamily: 'sans-serif' }}>Today</text>
                  </svg>

                  {/* Tooltip */}
                  {todHoveredHour >= 0 && (() => {
                    const tipW = 160, tipH = 80
                    const spaceRight = window.innerWidth - todMousePos.x
                    const spaceBottom = window.innerHeight - todMousePos.y
                    const left = spaceRight < tipW + 30 ? todMousePos.x - tipW - 15 : todMousePos.x + 15
                    const top = spaceBottom < tipH + 20 ? todMousePos.y - tipH - 10 : todMousePos.y - 10

                    if (todHoverMode === 'today' && todNearestToday) {
                      const time = todNearestToday.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                      return (
                        <div style={{
                          position: 'fixed', left, top,
                          background: '#1a1a2e', border: '1px solid #333', borderRadius: '6px',
                          padding: '8px 12px', pointerEvents: 'none', zIndex: 1000, fontSize: '13px', minWidth: `${tipW}px`
                        }}>
                          <div style={{ fontWeight: '600', color: '#fff', marginBottom: '4px' }}>{time}</div>
                          <div style={{ color: '#60a5fa', fontWeight: '600' }}>Today: {todNearestToday.rs3.toLocaleString()}</div>
                          <div style={{ color: 'rgba(96, 165, 250, 0.5)' }}>Avg: {(hourlyAverage[todHoveredHour]?.avgRs3 || 0).toLocaleString()}</div>
                        </div>
                      )
                    }

                    return (
                      <div style={{
                        position: 'fixed', left, top,
                        background: '#1a1a2e', border: '1px solid #333', borderRadius: '6px',
                        padding: '8px 12px', pointerEvents: 'none', zIndex: 1000, fontSize: '13px', minWidth: `${tipW}px`
                      }}>
                        <div style={{ fontWeight: '600', color: '#fff', marginBottom: '4px' }}>{formatHour(todHoveredHour)}</div>
                        <div style={{ color: 'rgba(96, 165, 250, 0.7)' }}>Avg: {(hourlyAverage[todHoveredHour]?.avgRs3 || 0).toLocaleString()}</div>
                        {todayByHourLookup[todHoveredHour] !== undefined && (
                          <div style={{ color: '#60a5fa' }}>Today: {todayByHourLookup[todHoveredHour].toLocaleString()}</div>
                        )}
                      </div>
                    )
                  })()}
                </div>
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
