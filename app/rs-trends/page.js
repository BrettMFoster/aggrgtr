'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import useSWR from 'swr'

// Chart layout constants
const CL = 55
const CR = 870
const CW = CR - CL
const CT = 15
const CB = 530
const CH = CB - CT
const VW = 920
const VH = 620

// Trendline chart (shorter)
const TL_CB = 380
const TL_CH = TL_CB - CT
const TL_VH = 435

const yearColors = {
  2013: '#6366f1',
  2014: '#8b5cf6',
  2015: '#a855f7',
  2016: '#d946ef',
  2017: '#ec4899',
  2018: '#f43f5e',
  2019: '#ef4444',
  2020: '#f97316',
  2021: '#eab308',
  2022: '#84cc16',
  2023: '#22c55e',
  2024: '#14b8a6',
  2025: '#06b6d4',
  2026: '#ffffff',
}

const monthStarts = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthMidpoints = [16, 45, 75, 105, 136, 166, 197, 228, 258, 289, 319, 350]
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
const getDayOfYear = (ts) => {
  const y = ts.getFullYear(), start = new Date(y, 0, 1)
  let doy = Math.round((ts - start) / 86400000)
  if (isLeapYear(y) && doy >= 60) doy -= 1
  return doy
}

// Median helper
const medianOf = (arr) => {
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Theil-Sen median regression (robust to outliers) - used for hiscores (weekly data)
const theilSenRegression = (ys) => {
  const n = ys.length
  if (n < 2) return null
  let slopes
  if (n <= 1000) {
    slopes = []
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        slopes.push((ys[j] - ys[i]) / (j - i))
      }
    }
  } else {
    slopes = []
    const samples = 20000
    for (let s = 0; s < samples; s++) {
      const i = Math.floor(Math.random() * n)
      let j = Math.floor(Math.random() * (n - 1))
      if (j >= i) j++
      slopes.push((ys[j] - ys[i]) / (j - i))
    }
  }
  const slope = medianOf(slopes)
  const intercepts = ys.map((y, i) => y - slope * i)
  const intercept = medianOf(intercepts)
  const startY = intercept
  const endY = slope * (n - 1) + intercept
  const pctChange = startY !== 0 ? ((endY - startY) / startY) * 100 : 0
  return { slope, intercept, startY, endY, pctChange }
}

// Solve linear system Ax = b via Gaussian elimination with partial pivoting
const gaussianSolve = (A, b) => {
  const n = A.length
  const aug = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let maxRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row
    }
    ;[aug[col], aug[maxRow]] = [aug[maxRow], aug[col]]
    if (Math.abs(aug[col][col]) < 1e-12) continue
    for (let row = col + 1; row < n; row++) {
      const f = aug[row][col] / aug[col][col]
      for (let j = col; j <= n; j++) aug[row][j] -= f * aug[col][j]
    }
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n]
    for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j]
    x[i] /= aug[i][i]
  }
  return x
}

// Fourier regression: simultaneous trend + weekly + annual seasonality via OLS
// timestamps: array of Date objects, values: array of numbers
// options: { weeklyHarmonics: 0-3, annualHarmonics: 0-3 }
// Returns { slope (per day), intercept, startY, endY, pctChange }
const fourierRegression = (timestamps, values, { weeklyHarmonics = 3, annualHarmonics = 0 } = {}) => {
  const n = timestamps.length
  if (n < 2) return null
  const t0 = timestamps[0].getTime()
  const msPerDay = 86400000
  const tDays = timestamps.map(ts => (ts.getTime() - t0) / msPerDay)
  const TWO_PI = 2 * Math.PI

  // Build feature columns: [intercept, trend, weekly sin/cos, annual sin/cos]
  const cols = [
    new Array(n).fill(1),   // intercept
    tDays,                   // linear trend
  ]
  for (let k = 1; k <= weeklyHarmonics; k++) {
    cols.push(tDays.map(t => Math.sin(TWO_PI * k * t / 7)))
    cols.push(tDays.map(t => Math.cos(TWO_PI * k * t / 7)))
  }
  for (let k = 1; k <= annualHarmonics; k++) {
    cols.push(tDays.map(t => Math.sin(TWO_PI * k * t / 365.25)))
    cols.push(tDays.map(t => Math.cos(TWO_PI * k * t / 365.25)))
  }

  // Need more observations than features
  const m = cols.length
  if (n <= m) return null

  // Compute X'X (m x m) and X'y (m x 1)
  const XtX = Array.from({ length: m }, () => new Array(m).fill(0))
  const Xty = new Array(m).fill(0)
  for (let i = 0; i < m; i++) {
    for (let j = i; j < m; j++) {
      let s = 0
      for (let k = 0; k < n; k++) s += cols[i][k] * cols[j][k]
      XtX[i][j] = s
      XtX[j][i] = s
    }
    for (let k = 0; k < n; k++) Xty[i] += cols[i][k] * values[k]
  }

  const coeffs = gaussianSolve(XtX, Xty)
  const slope = coeffs[1] // daily trend (players per day)
  const intercept = coeffs[0]
  const startY = intercept
  const endY = intercept + slope * tDays[n - 1]
  const pctChange = startY !== 0 ? ((endY - startY) / startY) * 100 : 0
  return { slope, intercept, startY, endY, pctChange }
}

export default function RSTrends() {
  const [isMobile, setIsMobile] = useState(false)
  const [trendsHoveredDay, setTrendsHoveredDay] = useState(-1)
  const [trendsMousePos, setTrendsMousePos] = useState({ x: 0, y: 0 })
  const [trendlineHoveredIndex, setTrendlineHoveredIndex] = useState(-1)
  const [trendlineMousePos, setTrendlineMousePos] = useState({ x: 0, y: 0 })
  const [fiveYrHoveredIndex, setFiveYrHoveredIndex] = useState(-1)
  const [fiveYrMousePos, setFiveYrMousePos] = useState({ x: 0, y: 0 })
  const [oneYrHoveredIndex, setOneYrHoveredIndex] = useState(-1)
  const [oneYrMousePos, setOneYrMousePos] = useState({ x: 0, y: 0 })
  const [sixMoHoveredIndex, setSixMoHoveredIndex] = useState(-1)
  const [sixMoMousePos, setSixMoMousePos] = useState({ x: 0, y: 0 })
  const [threeMoHoveredIndex, setThreeMoHoveredIndex] = useState(-1)
  const [threeMoMousePos, setThreeMoMousePos] = useState({ x: 0, y: 0 })
  const [oneMoHoveredIndex, setOneMoHoveredIndex] = useState(-1)
  const [oneMoMousePos, setOneMoMousePos] = useState({ x: 0, y: 0 })
  const [peaksHoveredIndex, setPeaksHoveredIndex] = useState(-1)
  const [peaksMousePos, setPeaksMousePos] = useState({ x: 0, y: 0 })
  const [troughsHoveredIndex, setTroughsHoveredIndex] = useState(-1)
  const [troughsMousePos, setTroughsMousePos] = useState({ x: 0, y: 0 })
  const [yoyFilter, setYoyFilter] = useState('dow')
  const [hiscoresHoveredIndex, setHiscoresHoveredIndex] = useState(-1)
  const [hiscoresMousePos, setHiscoresMousePos] = useState({ x: 0, y: 0 })
  const [hs1yrHoveredIndex, setHs1yrHoveredIndex] = useState(-1)
  const [hs1yrMousePos, setHs1yrMousePos] = useState({ x: 0, y: 0 })
  const [hs6moHoveredIndex, setHs6moHoveredIndex] = useState(-1)
  const [hs6moMousePos, setHs6moMousePos] = useState({ x: 0, y: 0 })
  const [hs3moHoveredIndex, setHs3moHoveredIndex] = useState(-1)
  const [hs3moMousePos, setHs3moMousePos] = useState({ x: 0, y: 0 })
  const [hs1moHoveredIndex, setHs1moHoveredIndex] = useState(-1)
  const [hs1moMousePos, setHs1moMousePos] = useState({ x: 0, y: 0 })
  const [hsYoyHoveredWeek, setHsYoyHoveredWeek] = useState(-1)
  const [hsYoyMousePos, setHsYoyMousePos] = useState({ x: 0, y: 0 })
  const yoyChartRef = useRef(null)
  const trendlineChartRef = useRef(null)
  const fiveYrChartRef = useRef(null)
  const oneYrChartRef = useRef(null)
  const sixMoChartRef = useRef(null)
  const threeMoChartRef = useRef(null)
  const oneMoChartRef = useRef(null)
  const peaksChartRef = useRef(null)
  const troughsChartRef = useRef(null)
  const hiscoresChartRef = useRef(null)
  const hs1yrChartRef = useRef(null)
  const hs6moChartRef = useRef(null)
  const hs3moChartRef = useRef(null)
  const hs1moChartRef = useRef(null)
  const hsYoyChartRef = useRef(null)

  const { data: historicalJson, error: historicalError } = useSWR(
    '/api/rs-data?sheet=Historical',
    { refreshInterval: 3 * 60 * 1000 }
  )
  const { data: liveJson, error: liveError } = useSWR(
    '/api/rs-data?sheet=Data',
    { refreshInterval: 3 * 60 * 1000 }
  )
  const { data: hiscoresJson, error: hiscoresError } = useSWR(
    '/api/rs-hiscores?view=all_weekly',
    { refreshInterval: 3 * 60 * 1000 }
  )
  const { data: hiscoresMonthlyJson } = useSWR(
    '/api/rs-hiscores?view=all_monthly',
    { refreshInterval: 3 * 60 * 1000 }
  )
  const loading = !historicalJson || !liveJson
  const error = historicalError || liveError

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Combined data
  const data = useMemo(() => {
    if (!historicalJson || !liveJson) return []
    const historicalData = (historicalJson.rows || []).map(r => ({
      ...r, timestamp: new Date(r.timestamp)
    }))
    const liveData = (liveJson.rows || []).map(r => ({
      ...r, timestamp: new Date(r.timestamp)
    }))
    const combined = [...historicalData]
    const latestHistorical = historicalData.length > 0
      ? Math.max(...historicalData.map(d => d.timestamp.getTime()))
      : 0
    for (const point of liveData) {
      if (point.timestamp.getTime() > latestHistorical) combined.push(point)
    }
    combined.sort((a, b) => a.timestamp - b.timestamp)
    return combined
  }, [historicalJson, liveJson])

  // Aggregate to daily for clean analysis
  const dailyData = useMemo(() => {
    if (!data.length) return []
    const byDay = {}
    for (const d of data) {
      const t = d.timestamp
      const dayKey = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`
      if (!byDay[dayKey]) byDay[dayKey] = { rs3: [], timestamp: d.timestamp }
      byDay[dayKey].rs3.push(d.rs3)
    }
    return Object.entries(byDay).map(([day, v]) => {
      const [y, m, d] = day.split('-').map(Number)
      return {
        timestamp: new Date(y, m - 1, d),
        rs3: Math.round(v.rs3.reduce((a, b) => a + b, 0) / v.rs3.length),
        rs3_peak: Math.max(...v.rs3),
        rs3_min: Math.min(...v.rs3.filter(x => x > 0)) || 0,
      }
    }).sort((a, b) => a.timestamp - b.timestamp)
  }, [data])

  // ============ YoY DATA ============
  const todayDow = new Date().getDay()
  const todayDayName = dayNames[todayDow]

  const yoyData = useMemo(() => {
    if (!dailyData.length) return {}

    if (yoyFilter === 'monthly') {
      const byYearMonth = {}
      for (const d of dailyData) {
        const year = d.timestamp.getFullYear()
        const month = d.timestamp.getMonth()
        const key = `${year}-${month}`
        if (!byYearMonth[key]) byYearMonth[key] = { year, month, values: [] }
        byYearMonth[key].values.push(d.rs3)
      }
      const byYear = {}
      for (const { year, month, values } of Object.values(byYearMonth)) {
        if (!byYear[year]) byYear[year] = {}
        const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length)
        byYear[year][monthMidpoints[month]] = avg
      }
      return byYear
    }

    if (yoyFilter === 'dow') {
      // All days, positioned by ISO week + day-of-week instead of calendar date
      // Aligns 2nd Sunday vs 2nd Sunday, 2nd Saturday vs 2nd Saturday, etc.
      const isoWeekInfo = (date) => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
        const dow = (d.getUTCDay() + 6) % 7
        d.setUTCDate(d.getUTCDate() + 3 - dow) // shift to Thursday of same ISO week
        const isoYear = d.getUTCFullYear() // ISO week-numbering year (from Thursday)
        const jan4 = new Date(Date.UTC(isoYear, 0, 4))
        const daysSinceMon = (jan4.getUTCDay() + 6) % 7
        const wk1Thu = new Date(jan4.getTime() + (3 - daysSinceMon) * 86400000)
        const week = 1 + Math.round((d - wk1Thu) / (7 * 86400000))
        return { week, year: isoYear }
      }
      const byYear = {}
      for (const d of dailyData) {
        const dow = (d.timestamp.getDay() + 6) % 7 // Mon=0, Sun=6
        const { week, year } = isoWeekInfo(d.timestamp) // use ISO year, not calendar year
        const pos = Math.min(363, (Math.min(week, 52) - 1) * 7 + dow)
        if (!byYear[year]) byYear[year] = {}
        byYear[year][pos] = d.rs3
      }
      return byYear
    }

    const byYear = {}
    for (const d of dailyData) {
      const year = d.timestamp.getFullYear()
      const startOfYear = new Date(year, 0, 1)
      let dayOfYear = Math.round((d.timestamp - startOfYear) / (24 * 60 * 60 * 1000))
      if (isLeapYear(year) && dayOfYear >= 60) dayOfYear -= 1
      if (!byYear[year]) byYear[year] = {}
      byYear[year][dayOfYear] = d.rs3
    }
    return byYear
  }, [dailyData, yoyFilter])

  const yoyYears = useMemo(() => {
    return Object.keys(yoyData).map(Number).sort((a, b) => a - b)
  }, [yoyData])

  const yoyMaxVal = useMemo(() => {
    let max = 0
    for (const year of Object.values(yoyData)) {
      for (const val of Object.values(year)) {
        if (val > max) max = val
      }
    }
    return max || 1
  }, [yoyData])

  // ============ YEARLY SUMMARY ============
  const yearlySummary = useMemo(() => {
    if (!dailyData.length) return []

    // Group by year with day-of-year tracking for same-period comparisons
    const byYear = {}
    for (const d of dailyData) {
      const year = d.timestamp.getFullYear()
      const startOfYear = new Date(year, 0, 1)
      let dayOfYear = Math.round((d.timestamp - startOfYear) / (24 * 60 * 60 * 1000))
      if (isLeapYear(year) && dayOfYear >= 60) dayOfYear -= 1 // skip Feb 29, cap at 0-364
      if (!byYear[year]) byYear[year] = { year, entries: [], peak: 0, peakDate: null }
      byYear[year].entries.push({ rs3: d.rs3, dayOfYear })
      if (d.rs3 > byYear[year].peak) {
        byYear[year].peak = d.rs3
        byYear[year].peakDate = d.timestamp
      }
    }

    const years = Object.keys(byYear).map(Number).sort((a, b) => a - b)
    const result = years.map(year => {
      const y = byYear[year]
      const values = y.entries.map(e => e.rs3)
      const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      const firstDay = Math.min(...y.entries.map(e => e.dayOfYear))
      const lastDay = Math.max(...y.entries.map(e => e.dayOfYear))

      return {
        year,
        avg,
        peak: y.peak,
        peakDate: y.peakDate,
        dataPoints: values.length,
        firstDay,
        lastDay,
        yoyChange: null,
        samePeriodChange: null,
        samePeriodLabel: null,
      }
    })

    // Full YoY change (avg vs prior year avg)
    for (let i = 1; i < result.length; i++) {
      result[i].yoyChange = ((result[i].avg - result[i - 1].avg) / result[i - 1].avg * 100)
    }

    // Same-period comparison: use the latest (current) year's day range for ALL comparisons
    const latest = result[result.length - 1]
    if (latest) {
      const periodStart = latest.firstDay
      const periodEnd = latest.lastDay
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const startDate = new Date(latest.year, 0, periodStart + 1)
      const endDate = new Date(latest.year, 0, periodEnd + 1)
      const periodLabel = `${monthNames[startDate.getMonth()]} ${startDate.getDate()} - ${monthNames[endDate.getMonth()]} ${endDate.getDate()}`

      for (const r of result) {
        const entries = byYear[r.year].entries.filter(e => e.dayOfYear >= periodStart && e.dayOfYear <= periodEnd)
        if (entries.length > 0) {
          r.samePeriodAvg = Math.round(entries.reduce((s, e) => s + e.rs3, 0) / entries.length)
        }
      }

      for (let i = 1; i < result.length; i++) {
        const currYear = result[i].year
        const prevYear = result[i].year - 1
        if (!byYear[prevYear] || !byYear[currYear]) continue
        const currEntries = byYear[currYear].entries.filter(e => e.dayOfYear >= periodStart && e.dayOfYear <= periodEnd)
        const prevEntries = byYear[prevYear].entries.filter(e => e.dayOfYear >= periodStart && e.dayOfYear <= periodEnd)
        if (currEntries.length > 0 && prevEntries.length > 0) {
          const currAvg = currEntries.reduce((s, e) => s + e.rs3, 0) / currEntries.length
          const prevAvg = prevEntries.reduce((s, e) => s + e.rs3, 0) / prevEntries.length
          result[i].samePeriodChange = prevAvg > 0 ? ((currAvg - prevAvg) / prevAvg * 100) : null
          result[i].samePeriodLabel = periodLabel
        }
      }
    }

    return result
  }, [dailyData])

  // ============ QUARTERLY PEAKS ============
  const quarterlyPeaks = useMemo(() => {
    if (!dailyData.length) return []
    const qLabels = ['Q1 (Jan–Mar)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Q4 (Oct–Dec)']
    const byYearQ = {}
    for (const d of dailyData) {
      const year = d.timestamp.getFullYear()
      const q = Math.floor(d.timestamp.getMonth() / 3)
      const key = `${year}-${q}`
      if (!byYearQ[key]) byYearQ[key] = { year, q, label: qLabels[q], peak: 0, peakDate: null, count: 0 }
      byYearQ[key].count++
      if (d.rs3 > byYearQ[key].peak) {
        byYearQ[key].peak = d.rs3
        byYearQ[key].peakDate = d.timestamp
      }
    }
    const rows = Object.values(byYearQ).sort((a, b) => a.year === b.year ? a.q - b.q : a.year - b.year)
    // YoY change for same quarter
    for (const row of rows) {
      const prev = rows.find(r => r.year === row.year - 1 && r.q === row.q)
      row.yoyChange = prev ? ((row.peak - prev.peak) / prev.peak * 100) : null
    }
    return rows
  }, [dailyData])

  // (Seasonal adjustment now handled by Fourier regression within each trendline)

  // ============ TRENDLINE ============
  const trendlineData = useMemo(() => {
    if (dailyData.length < 2) return { regression: null, movingAvg: [] }

    const n = dailyData.length
    const regression = fourierRegression(
      dailyData.map(d => d.timestamp),
      dailyData.map(d => d.rs3),
      { weeklyHarmonics: 3, annualHarmonics: 3 }
    )

    // 90-day moving average
    const window = 90
    const movingAvg = []
    let windowSum = 0
    for (let i = 0; i < n; i++) {
      windowSum += dailyData[i].rs3
      if (i >= window) windowSum -= dailyData[i - window].rs3
      if (i >= window - 1) {
        movingAvg.push({
          timestamp: dailyData[i].timestamp,
          value: Math.round(windowSum / window),
          index: i,
        })
      }
    }

    return { regression, movingAvg }
  }, [dailyData])

  // ============ 5-YEAR TRENDLINE ============
  const fiveYrData = useMemo(() => {
    if (!dailyData.length) return []
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 5)
    return dailyData.filter(d => d.timestamp >= cutoff)
  }, [dailyData])

  const fiveYrTrendline = useMemo(() => {
    if (fiveYrData.length < 2) return { regression: null, movingAvg: [] }
    const n = fiveYrData.length
    const regression = fourierRegression(
      fiveYrData.map(d => d.timestamp),
      fiveYrData.map(d => d.rs3),
      { weeklyHarmonics: 3, annualHarmonics: 3 }
    )
    const window = 90, movingAvg = []
    let windowSum = 0
    for (let i = 0; i < n; i++) {
      windowSum += fiveYrData[i].rs3
      if (i >= window) windowSum -= fiveYrData[i - window].rs3
      if (i >= window - 1) movingAvg.push({ timestamp: fiveYrData[i].timestamp, value: Math.round(windowSum / window), index: i })
    }
    return { regression, movingAvg }
  }, [fiveYrData])

  // ============ 1-YEAR TRENDLINE ============
  const oneYrData = useMemo(() => {
    if (!dailyData.length) return []
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 1)
    return dailyData.filter(d => d.timestamp >= cutoff)
  }, [dailyData])

  const oneYrTrendline = useMemo(() => {
    if (oneYrData.length < 2) return { regression: null, movingAvg: [] }
    const n = oneYrData.length
    const regression = fourierRegression(
      oneYrData.map(d => d.timestamp),
      oneYrData.map(d => d.rs3),
      { weeklyHarmonics: 3, annualHarmonics: 0 }
    )
    const window = 90, movingAvg = []
    let windowSum = 0
    for (let i = 0; i < n; i++) {
      windowSum += oneYrData[i].rs3
      if (i >= window) windowSum -= oneYrData[i - window].rs3
      if (i >= window - 1) movingAvg.push({ timestamp: oneYrData[i].timestamp, value: Math.round(windowSum / window), index: i })
    }
    return { regression, movingAvg }
  }, [oneYrData])

  // ============ 6-MONTH TRENDLINE ============
  const sixMoData = useMemo(() => {
    if (!dailyData.length) return []
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 6)
    return dailyData.filter(d => d.timestamp >= cutoff)
  }, [dailyData])

  const sixMoTrendline = useMemo(() => {
    if (sixMoData.length < 2) return { regression: null, movingAvg: [] }
    const n = sixMoData.length
    const ts = fourierRegression(
      sixMoData.map(d => d.timestamp),
      sixMoData.map(d => d.rs3),
      { weeklyHarmonics: 3, annualHarmonics: 0 }
    )
    const monthlyChange = ts ? Math.round(ts.slope * 30.44) : 0
    const regression = ts ? { slope: ts.slope, intercept: ts.intercept, startY: ts.startY, endY: ts.endY, monthlyChange, pctChange: ts.pctChange } : null
    const window = 30, movingAvg = []
    let windowSum = 0
    for (let i = 0; i < n; i++) {
      windowSum += sixMoData[i].rs3
      if (i >= window) windowSum -= sixMoData[i - window].rs3
      if (i >= window - 1) movingAvg.push({ timestamp: sixMoData[i].timestamp, value: Math.round(windowSum / window), index: i })
    }
    return { regression, movingAvg }
  }, [sixMoData])

  // ============ 3-MONTH TRENDLINE ============
  const threeMoData = useMemo(() => {
    if (!dailyData.length) return []
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 3)
    return dailyData.filter(d => d.timestamp >= cutoff)
  }, [dailyData])

  const threeMoTrendline = useMemo(() => {
    if (threeMoData.length < 2) return { regression: null, movingAvg: [] }
    const n = threeMoData.length
    const ts = fourierRegression(
      threeMoData.map(d => d.timestamp),
      threeMoData.map(d => d.rs3),
      { weeklyHarmonics: 3, annualHarmonics: 0 }
    )
    const monthlyChange = ts ? Math.round(ts.slope * 30.44) : 0
    const regression = ts ? { slope: ts.slope, intercept: ts.intercept, startY: ts.startY, endY: ts.endY, monthlyChange, pctChange: ts.pctChange } : null
    const window = 14, movingAvg = []
    let windowSum = 0
    for (let i = 0; i < n; i++) {
      windowSum += threeMoData[i].rs3
      if (i >= window) windowSum -= threeMoData[i - window].rs3
      if (i >= window - 1) movingAvg.push({ timestamp: threeMoData[i].timestamp, value: Math.round(windowSum / window), index: i })
    }
    return { regression, movingAvg }
  }, [threeMoData])

  // ============ 1-MONTH TRENDLINE ============
  const oneMoData = useMemo(() => {
    if (!dailyData.length) return []
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 1)
    return dailyData.filter(d => d.timestamp >= cutoff)
  }, [dailyData])

  const oneMoTrendline = useMemo(() => {
    if (oneMoData.length < 2) return { regression: null, movingAvg: [] }
    const n = oneMoData.length
    const ts = fourierRegression(
      oneMoData.map(d => d.timestamp),
      oneMoData.map(d => d.rs3),
      { weeklyHarmonics: 3, annualHarmonics: 0 }
    )
    const dailyChange = ts ? Math.round(ts.slope) : 0
    const regression = ts ? { slope: ts.slope, intercept: ts.intercept, startY: ts.startY, endY: ts.endY, dailyChange, pctChange: ts.pctChange } : null
    const window = 7, movingAvg = []
    let windowSum = 0
    for (let i = 0; i < n; i++) {
      windowSum += oneMoData[i].rs3
      if (i >= window) windowSum -= oneMoData[i - window].rs3
      if (i >= window - 1) movingAvg.push({ timestamp: oneMoData[i].timestamp, value: Math.round(windowSum / window), index: i })
    }
    return { regression, movingAvg }
  }, [oneMoData])

  // ============ 3-MONTH PEAKS ============
  const peaksData = useMemo(() => {
    if (!dailyData.length) return []
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 3)
    return dailyData.filter(d => d.timestamp >= cutoff)
  }, [dailyData])

  const peaksTrendline = useMemo(() => {
    if (peaksData.length < 2) return { movingAvg: [] }
    const n = peaksData.length
    const window = 14, movingAvg = []
    let windowSum = 0
    for (let i = 0; i < n; i++) {
      windowSum += peaksData[i].rs3_peak
      if (i >= window) windowSum -= peaksData[i - window].rs3_peak
      if (i >= window - 1) movingAvg.push({ timestamp: peaksData[i].timestamp, value: Math.round(windowSum / window), index: i })
    }
    return { movingAvg }
  }, [peaksData])

  const troughsData = useMemo(() => {
    if (!dailyData.length) return []
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 3)
    return dailyData.filter(d => d.timestamp >= cutoff && d.rs3_min > 0)
  }, [dailyData])

  const troughsTrendline = useMemo(() => {
    if (troughsData.length < 2) return { movingAvg: [] }
    const n = troughsData.length
    const window = 14, movingAvg = []
    let windowSum = 0
    for (let i = 0; i < n; i++) {
      windowSum += troughsData[i].rs3_min
      if (i >= window) windowSum -= troughsData[i - window].rs3_min
      if (i >= window - 1) movingAvg.push({ timestamp: troughsData[i].timestamp, value: Math.round(windowSum / window), index: i })
    }
    return { movingAvg }
  }, [troughsData])

  // Hiscores data
  const hiscoresData = useMemo(() => {
    if (!hiscoresJson?.rows?.length) return []
    return hiscoresJson.rows.map(r => ({
      timestamp: new Date(r.timestamp * 1000),
      total: r.total_accounts,
    })).sort((a, b) => a.timestamp - b.timestamp)
  }, [hiscoresJson])

  // Monthly hiscores data (goes back further - Jul 2023)
  const hiscoresMonthlyData = useMemo(() => {
    if (!hiscoresMonthlyJson?.rows?.length) return []
    return hiscoresMonthlyJson.rows.map(r => {
      const d = new Date(r.timestamp * 1000)
      return {
        timestamp: d,
        total: r.total_accounts,
        // Use UTC to avoid timezone shifting months/years
        utcYear: d.getUTCFullYear(),
        utcMonth: d.getUTCMonth(),
      }
    }).sort((a, b) => a.timestamp - b.timestamp)
  }, [hiscoresMonthlyJson])

  // Monthly averages by year (for Full YoY fallback when weekly data is sparse)
  const hiscoresMonthlyByYear = useMemo(() => {
    const byYear = {}
    for (const d of hiscoresMonthlyData) {
      const year = d.utcYear
      if (!byYear[year]) byYear[year] = []
      byYear[year].push(d.total)
    }
    const result = {}
    for (const [year, values] of Object.entries(byYear)) {
      result[year] = Math.round(values.reduce((a, b) => a + b, 0) / values.length)
    }
    return result
  }, [hiscoresMonthlyData])

  const hiscoresTrendline = useMemo(() => {
    if (hiscoresData.length < 2) return { regression: null, movingAvg: [] }
    const values = hiscoresData.map(d => d.total)
    const regression = theilSenRegression(values)
    const window = 13, movingAvg = []
    let windowSum = 0
    for (let i = 0; i < hiscoresData.length; i++) {
      windowSum += hiscoresData[i].total
      if (i >= window) windowSum -= hiscoresData[i - window].total
      if (i >= window - 1) movingAvg.push({ timestamp: hiscoresData[i].timestamp, value: Math.round(windowSum / window), index: i })
    }
    return { regression, movingAvg }
  }, [hiscoresData])

  const hiscoresMax = useMemo(() => hiscoresData.length ? Math.max(...hiscoresData.map(d => d.total), 1) : 1, [hiscoresData])
  const hiscoresXPos = (i) => CL + (i / (hiscoresData.length - 1 || 1)) * CW
  const hiscoresYPos = (v) => TL_CB - (v / hiscoresMax) * TL_CH

  const handleHiscoresHover = (e) => {
    if (!hiscoresChartRef.current || hiscoresData.length === 0) return
    const rect = hiscoresChartRef.current.getBoundingClientRect()
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left
    const chartWidth = rect.width
    const pct = Math.max(0, Math.min(1, (x - (CL / VW) * chartWidth) / ((CW / VW) * chartWidth)))
    const idx = Math.round(pct * (hiscoresData.length - 1))
    setHiscoresHoveredIndex(Math.max(0, Math.min(hiscoresData.length - 1, idx)))
    setHiscoresMousePos({ x: e.clientX || e.touches?.[0]?.clientX, y: e.clientY || e.touches?.[0]?.clientY })
  }

  // Hiscores sub-chart data (1yr, 6mo, 3mo from weekly; 1mo from daily)
  const hs1yrData = useMemo(() => {
    if (!hiscoresData.length) return []
    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1)
    return hiscoresData.filter(d => d.timestamp >= cutoff)
  }, [hiscoresData])

  const hs6moData = useMemo(() => {
    if (!hiscoresData.length) return []
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 6)
    return hiscoresData.filter(d => d.timestamp >= cutoff)
  }, [hiscoresData])

  const hs3moData = useMemo(() => {
    if (!hiscoresData.length) return []
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 3)
    return hiscoresData.filter(d => d.timestamp >= cutoff)
  }, [hiscoresData])

  const hs1moData = useMemo(() => {
    if (!hiscoresData.length) return []
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 1)
    return hiscoresData.filter(d => d.timestamp >= cutoff)
  }, [hiscoresData])

  // Hiscores sub-chart trendlines
  const hs1yrTrendline = useMemo(() => {
    if (hs1yrData.length < 2) return { regression: null, movingAvg: [] }
    const regression = theilSenRegression(hs1yrData.map(d => d.total))
    const window = 13, movingAvg = []
    let windowSum = 0
    for (let i = 0; i < hs1yrData.length; i++) {
      windowSum += hs1yrData[i].total
      if (i >= window) windowSum -= hs1yrData[i - window].total
      if (i >= window - 1) movingAvg.push({ timestamp: hs1yrData[i].timestamp, value: Math.round(windowSum / window), index: i })
    }
    return { regression, movingAvg }
  }, [hs1yrData])

  const hs6moTrendline = useMemo(() => {
    if (hs6moData.length < 2) return { regression: null, movingAvg: [] }
    const regression = theilSenRegression(hs6moData.map(d => d.total))
    const window = Math.min(4, hs6moData.length - 1), movingAvg = []
    let windowSum = 0
    for (let i = 0; i < hs6moData.length; i++) {
      windowSum += hs6moData[i].total
      if (i >= window) windowSum -= hs6moData[i - window].total
      if (i >= window - 1) movingAvg.push({ timestamp: hs6moData[i].timestamp, value: Math.round(windowSum / window), index: i })
    }
    return { regression, movingAvg }
  }, [hs6moData])

  const hs3moTrendline = useMemo(() => {
    if (hs3moData.length < 2) return { regression: null, movingAvg: [] }
    const regression = theilSenRegression(hs3moData.map(d => d.total))
    const window = Math.min(2, hs3moData.length - 1), movingAvg = []
    let windowSum = 0
    for (let i = 0; i < hs3moData.length; i++) {
      windowSum += hs3moData[i].total
      if (i >= window) windowSum -= hs3moData[i - window].total
      if (i >= window - 1) movingAvg.push({ timestamp: hs3moData[i].timestamp, value: Math.round(windowSum / window), index: i })
    }
    return { regression, movingAvg }
  }, [hs3moData])

  const hs1moTrendline = useMemo(() => {
    if (hs1moData.length < 2) return { regression: null, movingAvg: [] }
    const regression = theilSenRegression(hs1moData.map(d => d.total))
    const window = Math.min(1, hs1moData.length - 1), movingAvg = []
    let windowSum = 0
    for (let i = 0; i < hs1moData.length; i++) {
      windowSum += hs1moData[i].total
      if (i >= window) windowSum -= hs1moData[i - window].total
      if (i >= window - 1) movingAvg.push({ timestamp: hs1moData[i].timestamp, value: Math.round(windowSum / window), index: i })
    }
    return { regression, movingAvg }
  }, [hs1moData])

  // ============ HISCORES YoY DATA ============
  const getWeekOfYear = (date) => {
    // ISO week: Week 1 contains Jan 4, weeks start Monday
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    // Find Thursday of this week (ISO weeks are identified by their Thursday)
    const dayOfWeek = (d.getUTCDay() + 6) % 7 // 0=Mon, 6=Sun
    d.setUTCDate(d.getUTCDate() + 3 - dayOfWeek) // Thursday
    const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
    const daysSinceMon = (jan4.getUTCDay() + 6) % 7
    const week1Thursday = new Date(jan4.getTime() + (3 - daysSinceMon) * 86400000)
    return 1 + Math.round((d - week1Thursday) / (7 * 86400000))
  }

  const getISOYear = (date) => {
    // ISO year is the year that contains the Thursday of the week
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    const dayOfWeek = (d.getUTCDay() + 6) % 7 // 0=Mon, 6=Sun
    d.setUTCDate(d.getUTCDate() + 3 - dayOfWeek) // Thursday
    return d.getUTCFullYear()
  }

  const hsYoyData = useMemo(() => {
    if (!hiscoresData.length) return {}
    const byYear = {}
    for (const d of hiscoresData) {
      const year = getISOYear(d.timestamp)
      const week = getWeekOfYear(d.timestamp)
      if (!byYear[year]) byYear[year] = {}
      byYear[year][week] = d.total
    }
    return byYear
  }, [hiscoresData])

  const hsYoyYears = useMemo(() => Object.keys(hsYoyData).map(Number).sort((a, b) => a - b), [hsYoyData])

  const hsYoyMaxVal = useMemo(() => {
    let max = 0
    for (const year of Object.values(hsYoyData)) {
      for (const val of Object.values(year)) {
        if (val > max) max = val
      }
    }
    return max || 1
  }, [hsYoyData])

  // Hiscores yearly summary
  const hsYearlySummary = useMemo(() => {
    if (!hiscoresMonthlyData.length) return []
    const byYear = {}
    for (const d of hiscoresMonthlyData) {
      const year = d.utcYear
      const month = d.utcMonth
      if (!byYear[year]) byYear[year] = { year, entries: [], peak: 0, peakMonth: null }
      byYear[year].entries.push({ total: d.total, month, timestamp: d.timestamp })
      if (d.total > byYear[year].peak) {
        byYear[year].peak = d.total
        byYear[year].peakMonth = month
      }
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const years = Object.keys(byYear).map(Number).sort((a, b) => a - b)
    const result = years.map(year => {
      const y = byYear[year]
      const values = y.entries.map(e => e.total)
      const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      const firstMonth = Math.min(...y.entries.map(e => e.month))
      const lastMonth = Math.max(...y.entries.map(e => e.month))
      return { year, avg, peak: y.peak, peakMonth: monthNames[y.peakMonth], months: values.length, firstMonth, lastMonth, yoyChange: null, samePeriodChange: null }
    })

    // Full YoY change (monthly data)
    for (let i = 1; i < result.length; i++) {
      if (result[i - 1].avg > 0) {
        result[i].yoyChange = ((result[i].avg - result[i - 1].avg) / result[i - 1].avg * 100)
      }
    }

    // Same-period comparison: use WEEKLY data with latest year's week range (matches population table)
    const weekByYear = {}
    for (const d of hiscoresData) {
      const year = d.timestamp.getUTCFullYear()
      const week = getWeekOfYear(new Date(Date.UTC(d.timestamp.getUTCFullYear(), d.timestamp.getUTCMonth(), d.timestamp.getUTCDate())))
      if (!weekByYear[year]) weekByYear[year] = []
      weekByYear[year].push({ total: d.total, week })
    }
    const weekYears = Object.keys(weekByYear).map(Number).sort((a, b) => a - b)
    if (weekYears.length > 0) {
      const latestWeekYear = weekYears[weekYears.length - 1]
      const latestWeeks = weekByYear[latestWeekYear]
      const periodStartW = Math.min(...latestWeeks.map(e => e.week))
      const periodEndW = Math.max(...latestWeeks.map(e => e.week))
      const periodLabel = `W${periodStartW}\u2013W${periodEndW}`

      for (let i = 1; i < result.length; i++) {
        const currYear = result[i].year
        const prevYear = result[i].year - 1
        if (!weekByYear[prevYear] || !weekByYear[currYear]) continue
        const currEntries = weekByYear[currYear].filter(e => e.week >= periodStartW && e.week <= periodEndW)
        const prevEntries = weekByYear[prevYear].filter(e => e.week >= periodStartW && e.week <= periodEndW)
        if (currEntries.length > 0 && prevEntries.length > 0) {
          const currAvg = currEntries.reduce((s, e) => s + e.total, 0) / currEntries.length
          const prevAvg = prevEntries.reduce((s, e) => s + e.total, 0) / prevEntries.length
          result[i].samePeriodChange = prevAvg > 0 ? ((currAvg - prevAvg) / prevAvg * 100) : null
          result[i].samePeriodLabel = periodLabel
        }
      }
    }

    return result
  }, [hiscoresMonthlyData, hiscoresData])

  // Hiscores sub-chart position helpers
  const hs1yrMax = useMemo(() => hs1yrData.length ? Math.max(...hs1yrData.map(d => d.total), 1) : 1, [hs1yrData])
  const hs1yrXPos = (i) => CL + (i / (hs1yrData.length - 1 || 1)) * CW
  const hs1yrYPos = (v) => TL_CB - (v / hs1yrMax) * TL_CH

  const hs6moMax = useMemo(() => hs6moData.length ? Math.max(...hs6moData.map(d => d.total), 1) : 1, [hs6moData])
  const hs6moXPos = (i) => CL + (i / (hs6moData.length - 1 || 1)) * CW
  const hs6moYPos = (v) => TL_CB - (v / hs6moMax) * TL_CH

  const hs3moMax = useMemo(() => hs3moData.length ? Math.max(...hs3moData.map(d => d.total), 1) : 1, [hs3moData])
  const hs3moXPos = (i) => CL + (i / (hs3moData.length - 1 || 1)) * CW
  const hs3moYPos = (v) => TL_CB - (v / hs3moMax) * TL_CH

  const hs1moMax = useMemo(() => hs1moData.length ? Math.max(...hs1moData.map(d => d.total), 1) : 1, [hs1moData])
  const hs1moXPos = (i) => CL + (i / (hs1moData.length - 1 || 1)) * CW
  const hs1moYPos = (v) => TL_CB - (v / hs1moMax) * TL_CH

  // Hiscores sub-chart hover handlers
  const makeHsHoverHandler = (chartRef, chartData, setIndex, setMouse) => (e) => {
    if (!chartRef.current || chartData.length === 0) return
    const rect = chartRef.current.getBoundingClientRect()
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left
    const chartWidth = rect.width
    const pct = Math.max(0, Math.min(1, (x - (CL / VW) * chartWidth) / ((CW / VW) * chartWidth)))
    const idx = Math.round(pct * (chartData.length - 1))
    setIndex(Math.max(0, Math.min(chartData.length - 1, idx)))
    setMouse({ x: e.clientX || e.touches?.[0]?.clientX, y: e.clientY || e.touches?.[0]?.clientY })
  }
  const handleHs1yrHover = makeHsHoverHandler(hs1yrChartRef, hs1yrData, setHs1yrHoveredIndex, setHs1yrMousePos)
  const handleHs6moHover = makeHsHoverHandler(hs6moChartRef, hs6moData, setHs6moHoveredIndex, setHs6moMousePos)
  const handleHs3moHover = makeHsHoverHandler(hs3moChartRef, hs3moData, setHs3moHoveredIndex, setHs3moMousePos)
  const handleHs1moHover = makeHsHoverHandler(hs1moChartRef, hs1moData, setHs1moHoveredIndex, setHs1moMousePos)

  // Hiscores YoY position helpers
  const hsMonthWeeks = [1, 5, 9, 14, 18, 22, 27, 31, 35, 40, 44, 48]
  const hsYoyXPos = (week) => CL + ((week - 1) / 51) * CW

  const handleHsYoyHover = (e) => {
    if (!hsYoyChartRef.current || !hsYoyYears.length) return
    const rect = hsYoyChartRef.current.getBoundingClientRect()
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left
    const chartWidth = rect.width
    const pct = Math.max(0, Math.min(1, (x - (CL / VW) * chartWidth) / ((CW / VW) * chartWidth)))
    const week = Math.round(pct * 51) + 1
    setHsYoyHoveredWeek(week)
    setHsYoyMousePos({ x: e.clientX || e.touches?.[0]?.clientX, y: e.clientY || e.touches?.[0]?.clientY })
  }

  // Nice y-axis ticks
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

  const yoyTicks = computeYTicks(yoyMaxVal)
  const yoyMax = yoyTicks[yoyTicks.length - 1] || 1

  const tlMax = useMemo(() => {
    if (!dailyData.length) return 1
    return Math.max(...dailyData.map(d => d.rs3), 1)
  }, [dailyData])
  const tlTicks = computeYTicks(tlMax)
  const tlMaxVal = tlTicks[tlTicks.length - 1] || 1

  const fiveYrMax = useMemo(() => fiveYrData.length ? Math.max(...fiveYrData.map(d => d.rs3), 1) : 1, [fiveYrData])
  const fiveYrTicks = computeYTicks(fiveYrMax)
  const fiveYrMaxVal = fiveYrTicks[fiveYrTicks.length - 1] || 1

  const oneYrMax = useMemo(() => oneYrData.length ? Math.max(...oneYrData.map(d => d.rs3), 1) : 1, [oneYrData])
  const oneYrTicks = computeYTicks(oneYrMax)
  const oneYrMaxVal = oneYrTicks[oneYrTicks.length - 1] || 1

  // YoY chart helpers
  const yoyXPos = (dayOfYear) => CL + (dayOfYear / 364) * CW
  const yoyYPos = (val) => CB - (val / yoyMax) * CH

  // Trendline chart helpers
  const tlXPos = (i) => CL + (i / (dailyData.length - 1 || 1)) * CW
  const tlYPos = (val) => TL_CB - (val / tlMaxVal) * TL_CH

  const fiveYrXPos = (i) => CL + (i / (fiveYrData.length - 1 || 1)) * CW
  const fiveYrYPos = (val) => TL_CB - (val / fiveYrMaxVal) * TL_CH

  const oneYrXPos = (i) => CL + (i / (oneYrData.length - 1 || 1)) * CW
  const oneYrYPos = (val) => TL_CB - (val / oneYrMaxVal) * TL_CH

  const sixMoMax = useMemo(() => sixMoData.length ? Math.max(...sixMoData.map(d => d.rs3), 1) : 1, [sixMoData])
  const sixMoTicks = computeYTicks(sixMoMax)
  const sixMoMaxVal = sixMoTicks[sixMoTicks.length - 1] || 1
  const sixMoXPos = (i) => CL + (i / (sixMoData.length - 1 || 1)) * CW
  const sixMoYPos = (val) => TL_CB - (val / sixMoMaxVal) * TL_CH

  const threeMoMax = useMemo(() => threeMoData.length ? Math.max(...threeMoData.map(d => d.rs3), 1) : 1, [threeMoData])
  const threeMoTicks = computeYTicks(threeMoMax)
  const threeMoMaxVal = threeMoTicks[threeMoTicks.length - 1] || 1
  const threeMoXPos = (i) => CL + (i / (threeMoData.length - 1 || 1)) * CW
  const threeMoYPos = (val) => TL_CB - (val / threeMoMaxVal) * TL_CH

  const oneMoMax = useMemo(() => oneMoData.length ? Math.max(...oneMoData.map(d => d.rs3), 1) : 1, [oneMoData])
  const oneMoTicks = computeYTicks(oneMoMax)
  const oneMoMaxVal = oneMoTicks[oneMoTicks.length - 1] || 1
  const oneMoXPos = (i) => CL + (i / (oneMoData.length - 1 || 1)) * CW
  const oneMoYPos = (val) => TL_CB - (val / oneMoMaxVal) * TL_CH

  const peaksMax = useMemo(() => peaksData.length ? Math.max(...peaksData.map(d => d.rs3_peak), 1) : 1, [peaksData])
  const peaksTicks = computeYTicks(peaksMax)
  const peaksMaxVal = peaksTicks[peaksTicks.length - 1] || 1
  const peaksXPos = (i) => CL + (i / (peaksData.length - 1 || 1)) * CW
  const peaksYPos = (val) => TL_CB - (val / peaksMaxVal) * TL_CH

  const troughsMax = useMemo(() => troughsData.length ? Math.max(...troughsData.map(d => d.rs3_min), 1) : 1, [troughsData])
  const troughsTicks = computeYTicks(troughsMax)
  const troughsMaxVal = troughsTicks[troughsTicks.length - 1] || 1
  const troughsXPos = (i) => CL + (i / (troughsData.length - 1 || 1)) * CW
  const troughsYPos = (val) => TL_CB - (val / troughsMaxVal) * TL_CH

  // YoY hover
  const handleYoYHover = (e) => {
    if (!yoyChartRef.current) return
    const rect = yoyChartRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const chartWidth = rect.width
    const startPct = CL / VW
    const endPct = CR / VW
    const areaWidth = chartWidth * (endPct - startPct)
    const areaStart = chartWidth * startPct
    const relX = x - areaStart
    const pct = Math.max(0, Math.min(1, relX / areaWidth))
    let dayOfYear = Math.round(pct * 364)
    if (yoyFilter === 'monthly') {
      let nearest = monthMidpoints[0]
      let minDist = Math.abs(dayOfYear - nearest)
      for (const mp of monthMidpoints) {
        const dist = Math.abs(dayOfYear - mp)
        if (dist < minDist) { minDist = dist; nearest = mp }
      }
      dayOfYear = nearest
    }
    setTrendsHoveredDay(dayOfYear)
    setTrendsMousePos({ x: e.clientX, y: e.clientY })
  }

  // Trendline hover
  const handleTrendlineHover = (e) => {
    if (!trendlineChartRef.current || dailyData.length === 0) return
    const rect = trendlineChartRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const chartWidth = rect.width
    const startPct = CL / VW
    const endPct = CR / VW
    const areaWidth = chartWidth * (endPct - startPct)
    const areaStart = chartWidth * startPct
    const relX = x - areaStart
    const pct = Math.max(0, Math.min(1, relX / areaWidth))
    const idx = Math.round(pct * (dailyData.length - 1))
    setTrendlineHoveredIndex(Math.max(0, Math.min(dailyData.length - 1, idx)))
    setTrendlineMousePos({ x: e.clientX, y: e.clientY })
  }

  const handleFiveYrHover = (e) => {
    if (!fiveYrChartRef.current || fiveYrData.length === 0) return
    const rect = fiveYrChartRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const chartWidth = rect.width
    const startPct = CL / VW
    const endPct = CR / VW
    const areaWidth = chartWidth * (endPct - startPct)
    const areaStart = chartWidth * startPct
    const relX = x - areaStart
    const pct = Math.max(0, Math.min(1, relX / areaWidth))
    const idx = Math.round(pct * (fiveYrData.length - 1))
    setFiveYrHoveredIndex(Math.max(0, Math.min(fiveYrData.length - 1, idx)))
    setFiveYrMousePos({ x: e.clientX, y: e.clientY })
  }

  const handleOneYrHover = (e) => {
    if (!oneYrChartRef.current || oneYrData.length === 0) return
    const rect = oneYrChartRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const chartWidth = rect.width
    const startPct = CL / VW
    const endPct = CR / VW
    const areaWidth = chartWidth * (endPct - startPct)
    const areaStart = chartWidth * startPct
    const relX = x - areaStart
    const pct = Math.max(0, Math.min(1, relX / areaWidth))
    const idx = Math.round(pct * (oneYrData.length - 1))
    setOneYrHoveredIndex(Math.max(0, Math.min(oneYrData.length - 1, idx)))
    setOneYrMousePos({ x: e.clientX, y: e.clientY })
  }

  const handleSixMoHover = (e) => {
    if (!sixMoChartRef.current || sixMoData.length === 0) return
    const rect = sixMoChartRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const chartWidth = rect.width
    const startPct = CL / VW
    const endPct = CR / VW
    const areaWidth = chartWidth * (endPct - startPct)
    const areaStart = chartWidth * startPct
    const relX = x - areaStart
    const pct = Math.max(0, Math.min(1, relX / areaWidth))
    const idx = Math.round(pct * (sixMoData.length - 1))
    setSixMoHoveredIndex(Math.max(0, Math.min(sixMoData.length - 1, idx)))
    setSixMoMousePos({ x: e.clientX, y: e.clientY })
  }

  const handleThreeMoHover = (e) => {
    if (!threeMoChartRef.current || threeMoData.length === 0) return
    const rect = threeMoChartRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const chartWidth = rect.width
    const startPct = CL / VW
    const endPct = CR / VW
    const areaWidth = chartWidth * (endPct - startPct)
    const areaStart = chartWidth * startPct
    const relX = x - areaStart
    const pct = Math.max(0, Math.min(1, relX / areaWidth))
    const idx = Math.round(pct * (threeMoData.length - 1))
    setThreeMoHoveredIndex(Math.max(0, Math.min(threeMoData.length - 1, idx)))
    setThreeMoMousePos({ x: e.clientX, y: e.clientY })
  }

  const handleOneMoHover = (e) => {
    if (!oneMoChartRef.current || oneMoData.length === 0) return
    const rect = oneMoChartRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const chartWidth = rect.width
    const startPct = CL / VW
    const endPct = CR / VW
    const areaWidth = chartWidth * (endPct - startPct)
    const areaStart = chartWidth * startPct
    const relX = x - areaStart
    const pct = Math.max(0, Math.min(1, relX / areaWidth))
    const idx = Math.round(pct * (oneMoData.length - 1))
    setOneMoHoveredIndex(Math.max(0, Math.min(oneMoData.length - 1, idx)))
    setOneMoMousePos({ x: e.clientX, y: e.clientY })
  }

  const handlePeaksHover = (e) => {
    if (!peaksChartRef.current || peaksData.length === 0) return
    const rect = peaksChartRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const chartWidth = rect.width
    const startPct = CL / VW
    const endPct = CR / VW
    const areaWidth = chartWidth * (endPct - startPct)
    const areaStart = chartWidth * startPct
    const relX = x - areaStart
    const pct = Math.max(0, Math.min(1, relX / areaWidth))
    const idx = Math.round(pct * (peaksData.length - 1))
    setPeaksHoveredIndex(Math.max(0, Math.min(peaksData.length - 1, idx)))
    setPeaksMousePos({ x: e.clientX, y: e.clientY })
  }

  const handleTroughsHover = (e) => {
    if (!troughsChartRef.current || troughsData.length === 0) return
    const rect = troughsChartRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const chartWidth = rect.width
    const startPct = CL / VW
    const endPct = CR / VW
    const areaWidth = chartWidth * (endPct - startPct)
    const areaStart = chartWidth * startPct
    const relX = x - areaStart
    const pct = Math.max(0, Math.min(1, relX / areaWidth))
    const idx = Math.round(pct * (troughsData.length - 1))
    setTroughsHoveredIndex(Math.max(0, Math.min(troughsData.length - 1, idx)))
    setTroughsMousePos({ x: e.clientX, y: e.clientY })
  }

  const currentYear = new Date().getFullYear()

  return (
    <div style={{ minHeight: isMobile ? '100dvh' : '100vh', background: '#0a0a0a', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
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
              <a href="/osrs-worlds" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>OSRS Worlds</a>
              <a href="/hiscores" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Hiscores</a>
              <a href="/rs-trends" style={{ background: '#222', border: 'none', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '600' }}>Trends</a>
              <a href="/data" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Data</a>
              <a href="/blog" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Blog</a>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: isMobile ? '16px' : '24px 20px' }}>
          <h1 style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '600', letterSpacing: '-1px', color: '#fff', margin: '0 0 4px 0' }}>RS3 Population Trends</h1>
          <p style={{ fontSize: isMobile ? '14px' : '16px', color: '#999', margin: '0 0 20px 0' }}>Year-over-year analysis, peak tracking, and long-term trendlines</p>

          {loading ? (
            <div style={{ color: '#fff', padding: '40px', textAlign: 'center' }}>Loading...</div>
          ) : error ? (
            <div style={{ color: '#ff4444', padding: '40px', textAlign: 'center' }}>Error: {error?.message || 'Failed to load data'}</div>
          ) : (
            <>
              {/* ============ SECTION 1: YoY Comparison ============ */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px' : '12px 16px', marginBottom: '12px' }}>
                <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: '0 0 12px 0' }}>
                  {yoyFilter === 'daily' && 'Year-over-Year RS3 Population'}
                  {yoyFilter === 'dow' && 'Year-over-Year RS3 Population (Day of Week)'}
                  {yoyFilter === 'monthly' && 'Year-over-Year RS3 Population (Monthly Avg)'}
                </h2>

                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  {[
                    { key: 'daily', label: 'Daily' },
                    { key: 'dow', label: 'Day of Week' },
                    { key: 'monthly', label: 'Monthly' },
                  ].map(f => (
                    <button
                      key={f.key}
                      onClick={() => setYoyFilter(f.key)}
                      style={{
                        background: yoyFilter === f.key ? '#fff' : 'transparent',
                        color: yoyFilter === f.key ? '#000' : '#fff',
                        border: yoyFilter === f.key ? '1px solid #fff' : '1px solid #444',
                        borderRadius: '20px',
                        padding: '4px 14px',
                        fontSize: '13px',
                        fontWeight: yoyFilter === f.key ? '600' : '400',
                        cursor: 'pointer',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div
                  ref={yoyChartRef}
                  style={{ height: isMobile ? '350px' : '650px', position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleYoYHover}
                  onMouseLeave={() => setTrendsHoveredDay(-1)}
                >
                  <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none">
                    {/* Month grid lines */}
                    {monthStarts.map((day, i) => (
                      <g key={i}>
                        <line x1={yoyXPos(day)} y1={CT} x2={yoyXPos(day)} y2={CB} stroke="#1a1a1a" strokeWidth="1" />
                        <text x={yoyXPos(day + 15)} y={CB + 22} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">
                          {monthLabels[i]}
                        </text>
                      </g>
                    ))}

                    {/* Y-axis ticks */}
                    {yoyTicks.map((val, i) => {
                      const y = yoyYPos(val)
                      return (
                        <g key={i}>
                          <line x1={CL} y1={y} x2={CR} y2={y} stroke="#2a2a2a" strokeWidth="1" />
                          <text x={CL - 8} y={y + 4} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="end" style={{ fontFamily: 'monospace' }}>
                            {val.toLocaleString()}
                          </text>
                        </g>
                      )
                    })}

                    {/* Year lines */}
                    {yoyYears.map(year => {
                      const days = yoyData[year]
                      const dayEntries = Object.entries(days).map(([d, v]) => [parseInt(d), v]).sort((a, b) => a[0] - b[0])
                      if (dayEntries.length < 2) return null
                      const pathD = dayEntries.map(([doy, val], i) => {
                        const x = yoyXPos(doy)
                        const y = yoyYPos(val)
                        return `${i === 0 ? 'M' : 'L'} ${x},${y}`
                      }).join(' ')
                      const isCurrent = year === currentYear
                      const isDashed = !isCurrent && year % 2 === 1
                      return (
                        <path
                          key={year}
                          d={pathD}
                          fill="none"
                          stroke={yearColors[year] || '#666'}
                          strokeWidth={isCurrent ? 3 : 1.5}
                          strokeDasharray={isDashed ? '6,3' : 'none'}
                          opacity={isCurrent ? 1 : 0.7}
                        />
                      )
                    })}

                    {/* Hover crosshair */}
                    {trendsHoveredDay >= 0 && (
                      <line x1={yoyXPos(trendsHoveredDay)} y1={CT} x2={yoyXPos(trendsHoveredDay)} y2={CB} stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="4" />
                    )}

                    {/* Hover dots */}
                    {trendsHoveredDay >= 0 && yoyYears.map(year => {
                      const val = yoyData[year]?.[trendsHoveredDay]
                      if (val === undefined) return null
                      return (
                        <circle
                          key={year}
                          cx={yoyXPos(trendsHoveredDay)}
                          cy={yoyYPos(val)}
                          r="5"
                          fill={yearColors[year] || '#666'}
                          stroke="#111"
                          strokeWidth="1.5"
                        />
                      )
                    })}

                    {/* Legend */}
                    <g transform={`translate(${VW / 2}, ${CB + 45})`}>
                      {yoyYears.map((year, i) => {
                        const cols = isMobile ? 5 : 7
                        const row = Math.floor(i / cols)
                        const col = i % cols
                        const totalInRow = Math.min(cols, yoyYears.length - row * cols)
                        const colWidth = 65
                        const rowWidth = totalInRow * colWidth
                        const startX = -rowWidth / 2
                        const x = startX + col * colWidth
                        const y = row * 20
                        const isDashed = year !== currentYear && year % 2 === 1
                        return (
                          <g key={year}>
                            {isDashed ? (
                              <line x1={x} y1={y} x2={x + 10} y2={y} stroke={yearColors[year] || '#666'} strokeWidth="2" strokeDasharray="3,2" />
                            ) : (
                              <line x1={x} y1={y} x2={x + 10} y2={y} stroke={yearColors[year] || '#666'} strokeWidth={year === currentYear ? 3 : 2} />
                            )}
                            <text x={x + 14} y={y + 4} fill="#fff" fontSize="11">{year}</text>
                          </g>
                        )
                      })}
                    </g>
                  </svg>

                  {/* YoY Tooltip */}
                  {trendsHoveredDay >= 0 && (() => {
                    const monthIdx = monthStarts.findLastIndex(s => trendsHoveredDay >= s)
                    const month = monthLabels[monthIdx]
                    const dayInMonth = trendsHoveredDay - monthStarts[monthIdx] + 1
                    const fullMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
                    const valuesForDay = yoyYears.map(year => ({
                      year,
                      val: yoyData[year]?.[trendsHoveredDay],
                      color: yearColors[year] || '#666',
                    })).filter(v => v.val !== undefined).sort((a, b) => b.val - a.val)
                    if (valuesForDay.length === 0) return null
                    const tooltipWidth = 170
                    const tooltipHeight = 30 + valuesForDay.length * 20
                    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const left = (screenWidth - trendsMousePos.x) < tooltipWidth + 30
                      ? trendsMousePos.x - tooltipWidth - 15
                      : trendsMousePos.x + 15
                    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800
                    const top = (trendsMousePos.y - 40 + tooltipHeight) > viewportHeight
                      ? trendsMousePos.y - tooltipHeight - 10
                      : trendsMousePos.y - 40
                    return (
                      <div style={{
                        position: 'fixed', left, top,
                        background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px',
                        padding: '10px 14px', zIndex: 1000, pointerEvents: 'none', minWidth: '150px'
                      }}>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
                          {yoyFilter === 'monthly' ? fullMonthNames[monthIdx] : yoyFilter === 'dow' ? (() => {
                            const isoDowNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                            const weekNum = Math.floor(trendsHoveredDay / 7) + 1
                            const dowIdx = trendsHoveredDay % 7
                            return `Week ${weekNum}, ${isoDowNames[dowIdx]}`
                          })() : `${month} ${dayInMonth}`}
                        </div>
                        {valuesForDay.map(v => (
                          <div key={v.year} style={{ fontSize: '13px', color: '#fff', marginBottom: '2px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                            <span style={{ color: v.color, fontWeight: v.year === currentYear ? '700' : '500' }}>{v.year}</span>
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v.val.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Rank years by avg RS3 and same-period avg (highest = 1) */}
              {(() => {
                const sortedAvg = [...yearlySummary].sort((a, b) => b.avg - a.avg)
                sortedAvg.forEach((ys, i) => { ys.avgRank = i + 1 })
                const withPeriod = yearlySummary.filter(ys => ys.samePeriodAvg)
                const sortedPeriod = [...withPeriod].sort((a, b) => b.samePeriodAvg - a.samePeriodAvg)
                sortedPeriod.forEach((ys, i) => { ys.periodRank = i + 1 })
                return null
              })()}

              {/* ============ SECTION 2: Yearly Summary ============ */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px' : '12px 16px', marginBottom: '12px' }}>
                <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: '0 0 12px 0' }}>RS3 Yearly Summary</h2>

                {isMobile ? (
                  // Mobile: card layout
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[...yearlySummary].reverse().map(ys => (
                      <div key={ys.year} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px', padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '16px', fontWeight: '700', color: yearColors[ys.year] || '#fff' }}>{ys.year}</span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {ys.samePeriodChange !== null && (
                              <span style={{ fontSize: '12px', fontWeight: '600', color: ys.samePeriodChange > 0 ? '#4ade80' : ys.samePeriodChange < 0 ? '#ef4444' : '#eab308' }}>
                                Same period: {ys.samePeriodChange > 0 ? '+' : ''}{ys.samePeriodChange.toFixed(1)}%
                              </span>
                            )}
                            {ys.yoyChange !== null && (
                              <span style={{ fontSize: '12px', fontWeight: '600', color: ys.yoyChange > 0 ? '#4ade80' : ys.yoyChange < 0 ? '#ef4444' : '#eab308' }}>
                                Full: {ys.yoyChange > 0 ? '+' : ''}{ys.yoyChange.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '13px' }}>
                          <div><span style={{ color: '#999' }}>Avg: </span><span style={{ color: '#60a5fa', fontWeight: '600' }}>{ys.avg.toLocaleString()}</span></div>
                          <div><span style={{ color: '#999' }}>Peak: </span><span style={{ color: '#fff', fontWeight: '600' }}>{ys.peak.toLocaleString()}</span></div>
                          <div><span style={{ color: '#999' }}>Peak: </span><span style={{ color: '#999' }}>{ys.peakDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></div>
                          <div><span style={{ color: '#999' }}>Days: </span><span style={{ color: '#666' }}>{ys.dataPoints}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Desktop: table
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', whiteSpace: 'nowrap' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #333' }}>
                          {[
                              { label: 'Year', align: 'left', borderRight: true },
                              { label: 'Avg RS3', align: 'right' },
                              { label: 'Rank Avg', align: 'right' },
                              { label: 'Peak RS3', align: 'right' },
                              { label: 'Peak Date', align: 'right' },
                              { label: 'Full YoY', align: 'right' },
                              { label: 'Days', align: 'right' },
                              { label: 'Same Period', align: 'center', borderLeft: true },
                              { label: 'Rank Period', align: 'center' },
                              { label: 'Period', align: 'center' },
                            ].map((col) => (
                              <th key={col.label} style={{ padding: '8px 16px', color: '#fff', fontWeight: '500', textAlign: col.align, borderRight: col.borderRight ? '1px solid #333' : 'none', borderLeft: col.borderLeft ? '1px solid #333' : 'none' }}>{col.label}</th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...yearlySummary].reverse().map(ys => (
                          <tr key={ys.year} style={{ borderBottom: '1px solid #1a1a1a' }}>
                            <td style={{ padding: '8px 16px', fontWeight: '700', color: yearColors[ys.year] || '#fff', borderRight: '1px solid #222' }}>{ys.year}</td>
                            <td style={{ padding: '8px 16px', textAlign: 'right', color: '#60a5fa', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{ys.avg.toLocaleString()}</td>
                            <td style={{ padding: '8px 16px', textAlign: 'right', color: '#ccc', fontVariantNumeric: 'tabular-nums' }}>#{ys.avgRank}</td>
                            <td style={{ padding: '8px 16px', textAlign: 'right', color: '#fff', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{ys.peak.toLocaleString()}</td>
                            <td style={{ padding: '8px 16px', textAlign: 'right', color: '#ccc' }}>{ys.peakDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                            <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: '600', fontVariantNumeric: 'tabular-nums', color: ys.yoyChange === null ? '#666' : ys.yoyChange > 0 ? '#4ade80' : ys.yoyChange < 0 ? '#ef4444' : '#eab308' }}>
                              {ys.yoyChange === null ? '-' : `${ys.yoyChange > 0 ? '+' : ''}${ys.yoyChange.toFixed(1)}%`}
                            </td>
                            <td style={{ padding: '8px 16px', textAlign: 'right', color: '#ccc', fontVariantNumeric: 'tabular-nums' }}>{ys.dataPoints}</td>
                            <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: '600', fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid #222', color: ys.samePeriodChange === null ? '#666' : ys.samePeriodChange > 0 ? '#4ade80' : ys.samePeriodChange < 0 ? '#ef4444' : '#eab308' }}>
                              {ys.samePeriodChange === null ? '-' : `${ys.samePeriodChange > 0 ? '+' : ''}${ys.samePeriodChange.toFixed(1)}%`}
                            </td>
                            <td style={{ padding: '8px 16px', textAlign: 'center', color: '#ccc', fontVariantNumeric: 'tabular-nums' }}>{ys.periodRank ? `#${ys.periodRank}` : '-'}</td>
                            <td style={{ padding: '8px 16px', textAlign: 'center', color: '#ccc' }}>{ys.samePeriodLabel || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ============ TRENDLINES SECTION ============ */}
              <div style={{ background: '#0a0a0a', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '10px' : '16px', marginBottom: '12px' }}>
                <h2 style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '700', color: '#fff', margin: '0 0 12px 0' }}>RS3 Trendlines</h2>

              {/* ============ SECTION 3: Long-term Trendline ============ */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px' : '12px 16px', marginBottom: '12px' }}>
                <div style={{ position: 'relative', marginBottom: '12px', textAlign: 'center', ...(isMobile ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' } : {}) }}>
                  <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: 0 }}>Long-term</h2>
                  {trendlineData.regression && (
                    <div style={{
                      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px',
                      padding: isMobile ? '3px 6px' : '6px 14px', display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '12px',
                      ...(isMobile ? {} : { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' })
                    }}>
                      <span style={{
                        fontSize: isMobile ? '10px' : '14px', fontWeight: '700',
                        color: trendlineData.regression.pctChange > 1 ? '#4ade80'
                          : trendlineData.regression.pctChange < -1 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {Math.round(trendlineData.regression.slope * 365) > 0 ? '+' : ''}{Math.round(trendlineData.regression.slope * 365).toLocaleString()} players/year
                      </span>
                      <span style={{
                        fontSize: isMobile ? '9px' : '12px', fontWeight: '600',
                        padding: isMobile ? '1px 5px' : '2px 8px', borderRadius: '4px',
                        background: trendlineData.regression.pctChange > 1 ? '#052e16'
                          : trendlineData.regression.pctChange < -1 ? '#450a0a'
                          : '#422006',
                        color: trendlineData.regression.pctChange > 1 ? '#4ade80'
                          : trendlineData.regression.pctChange < -1 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {trendlineData.regression.pctChange > 1 ? 'Growing'
                          : trendlineData.regression.pctChange < -1 ? 'Declining'
                          : 'Flat'}
                      </span>
                    </div>
                  )}
                </div>

                <div
                  ref={trendlineChartRef}
                  style={{ height: isMobile ? '300px' : '450px', position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleTrendlineHover}
                  onMouseLeave={() => setTrendlineHoveredIndex(-1)}
                >
                  {dailyData.length > 1 && (
                    <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${TL_VH}`} preserveAspectRatio="none">
                      {/* Y-axis ticks */}
                      {tlTicks.map((val, i) => {
                        const y = tlYPos(val)
                        return (
                          <g key={i}>
                            <line x1={CL} y1={y} x2={CR} y2={y} stroke="#2a2a2a" strokeWidth="1" />
                            <text x={CL - 8} y={y + 4} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="end" style={{ fontFamily: 'monospace' }}>
                              {val.toLocaleString()}
                            </text>
                          </g>
                        )
                      })}

                      {/* X-axis labels */}
                      {(() => {
                        const years = new Set()
                        const labels = []
                        for (let i = 0; i < dailyData.length; i++) {
                          const y = dailyData[i].timestamp.getFullYear()
                          if (!years.has(y)) {
                            years.add(y)
                            labels.push({ index: i, text: String(y) })
                          }
                        }
                        return labels
                      })().map((label, i) => (
                        <text key={i} x={tlXPos(label.index)} y={TL_CB + 22} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">
                          {label.text}
                        </text>
                      ))}

                      {/* Area fill */}
                      <path
                        d={`M ${CL},${TL_CB} ${dailyData.map((d, i) => `L ${tlXPos(i)},${tlYPos(d.rs3)}`).join(' ')} L ${tlXPos(dailyData.length - 1)},${TL_CB} Z`}
                        fill="rgba(96, 165, 250, 0.08)"
                      />

                      {/* Raw data line (faint) */}
                      <path
                        d={`M ${dailyData.map((d, i) => `${tlXPos(i)},${tlYPos(d.rs3)}`).join(' L ')}`}
                        fill="none"
                        stroke="rgba(96, 165, 250, 0.25)"
                        strokeWidth="1"
                      />

                      {/* 90-day moving average */}
                      {trendlineData.movingAvg.length > 1 && (
                        <path
                          d={`M ${trendlineData.movingAvg.map((d) => `${tlXPos(d.index)},${tlYPos(d.value)}`).join(' L ')}`}
                          fill="none"
                          stroke="#60a5fa"
                          strokeWidth="2.5"
                        />
                      )}

                      {/* Linear regression line */}
                      {trendlineData.regression && (
                        <line
                          x1={tlXPos(0)}
                          y1={tlYPos(trendlineData.regression.startY)}
                          x2={tlXPos(dailyData.length - 1)}
                          y2={tlYPos(trendlineData.regression.endY)}
                          stroke="#ef4444"
                          strokeWidth="2"
                          strokeDasharray="8,4"
                        />
                      )}

                      {/* Hover */}
                      {trendlineHoveredIndex >= 0 && (() => {
                        const d = dailyData[trendlineHoveredIndex]
                        const x = tlXPos(trendlineHoveredIndex)
                        const ma = trendlineData.movingAvg.find(m => m.index === trendlineHoveredIndex)
                        return (
                          <>
                            <line x1={x} y1={CT} x2={x} y2={TL_CB} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                            <circle cx={x} cy={tlYPos(d.rs3)} r="5" fill="#60a5fa" stroke="#111" strokeWidth="1.5" />
                            {ma && <circle cx={x} cy={tlYPos(ma.value)} r="5" fill="#fff" stroke="#111" strokeWidth="1.5" />}
                          </>
                        )
                      })()}

                      {/* Legend */}
                      <g transform={`translate(${VW / 2}, ${TL_CB + 50})`}>
                        <line x1={-140} y1={0} x2={-115} y2={0} stroke="rgba(96, 165, 250, 0.25)" strokeWidth="2" />
                        <text x={-110} y={4} fill="#fff" fontSize="11">Daily</text>
                        <line x1={-50} y1={0} x2={-25} y2={0} stroke="#60a5fa" strokeWidth="2.5" />
                        <text x={-20} y={4} fill="#fff" fontSize="11">90d MA</text>
                        <line x1={55} y1={0} x2={80} y2={0} stroke="#ef4444" strokeWidth="2" strokeDasharray="6,3" />
                        <text x={85} y={4} fill="#fff" fontSize="11">Regression</text>
                      </g>
                    </svg>
                  )}

                  {/* Trendline tooltip */}
                  {trendlineHoveredIndex >= 0 && (() => {
                    const d = dailyData[trendlineHoveredIndex]
                    const ma = trendlineData.movingAvg.find(m => m.index === trendlineHoveredIndex)
                    const tooltipWidth = 180
                    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const left = (screenWidth - trendlineMousePos.x) < tooltipWidth + 30
                      ? trendlineMousePos.x - tooltipWidth - 15
                      : trendlineMousePos.x + 15
                    return (
                      <div style={{
                        position: 'fixed', left, top: trendlineMousePos.y - 60,
                        background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px',
                        padding: '10px 14px', zIndex: 1000, pointerEvents: 'none', minWidth: '160px'
                      }}>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
                          {d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '14px', color: '#60a5fa', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '700' }}>RS3:</span> {d.rs3.toLocaleString()}
                        </div>
                        {ma && (
                          <div style={{ fontSize: '13px', color: '#999' }}>
                            90d MA: {ma.value.toLocaleString()}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* ============ SECTION 4: 5-Year Trendline ============ */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px' : '12px 16px', marginBottom: '12px' }}>
                <div style={{ position: 'relative', marginBottom: '12px', textAlign: 'center', ...(isMobile ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' } : {}) }}>
                  <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: 0 }}>5-Year</h2>
                  {fiveYrTrendline.regression && (
                    <div style={{
                      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px',
                      padding: isMobile ? '3px 6px' : '6px 14px', display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '12px',
                      ...(isMobile ? {} : { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' })
                    }}>
                      <span style={{
                        fontSize: isMobile ? '10px' : '14px', fontWeight: '700',
                        color: fiveYrTrendline.regression.pctChange > 1 ? '#4ade80'
                          : fiveYrTrendline.regression.pctChange < -1 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {Math.round(fiveYrTrendline.regression.slope * 365) > 0 ? '+' : ''}{Math.round(fiveYrTrendline.regression.slope * 365).toLocaleString()} players/year
                      </span>
                      <span style={{
                        fontSize: isMobile ? '9px' : '12px', fontWeight: '600',
                        padding: isMobile ? '1px 5px' : '2px 8px', borderRadius: '4px',
                        background: fiveYrTrendline.regression.pctChange > 1 ? '#052e16'
                          : fiveYrTrendline.regression.pctChange < -1 ? '#450a0a'
                          : '#422006',
                        color: fiveYrTrendline.regression.pctChange > 1 ? '#4ade80'
                          : fiveYrTrendline.regression.pctChange < -1 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {fiveYrTrendline.regression.pctChange > 1 ? 'Growing'
                          : fiveYrTrendline.regression.pctChange < -1 ? 'Declining'
                          : 'Flat'}
                      </span>
                    </div>
                  )}
                </div>

                <div
                  ref={fiveYrChartRef}
                  style={{ height: isMobile ? '300px' : '450px', position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleFiveYrHover}
                  onMouseLeave={() => setFiveYrHoveredIndex(-1)}
                >
                  {fiveYrData.length > 1 && (
                    <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${TL_VH}`} preserveAspectRatio="none">
                      {fiveYrTicks.map((val, i) => {
                        const y = fiveYrYPos(val)
                        return (
                          <g key={i}>
                            <line x1={CL} y1={y} x2={CR} y2={y} stroke="#2a2a2a" strokeWidth="1" />
                            <text x={CL - 8} y={y + 4} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="end" style={{ fontFamily: 'monospace' }}>
                              {val.toLocaleString()}
                            </text>
                          </g>
                        )
                      })}

                      {(() => {
                        const years = new Set()
                        const labels = []
                        for (let i = 0; i < fiveYrData.length; i++) {
                          const y = fiveYrData[i].timestamp.getFullYear()
                          if (!years.has(y)) { years.add(y); labels.push({ index: i, text: String(y) }) }
                        }
                        return labels
                      })().map((label, i) => (
                        <text key={i} x={fiveYrXPos(label.index)} y={TL_CB + 22} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">
                          {label.text}
                        </text>
                      ))}

                      <path
                        d={`M ${CL},${TL_CB} ${fiveYrData.map((d, i) => `L ${fiveYrXPos(i)},${fiveYrYPos(d.rs3)}`).join(' ')} L ${fiveYrXPos(fiveYrData.length - 1)},${TL_CB} Z`}
                        fill="rgba(96, 165, 250, 0.08)"
                      />
                      <path
                        d={`M ${fiveYrData.map((d, i) => `${fiveYrXPos(i)},${fiveYrYPos(d.rs3)}`).join(' L ')}`}
                        fill="none"
                        stroke="rgba(96, 165, 250, 0.25)"
                        strokeWidth="1"
                      />

                      {fiveYrTrendline.movingAvg.length > 1 && (
                        <path
                          d={`M ${fiveYrTrendline.movingAvg.map((d) => `${fiveYrXPos(d.index)},${fiveYrYPos(d.value)}`).join(' L ')}`}
                          fill="none"
                          stroke="#60a5fa"
                          strokeWidth="2.5"
                        />
                      )}

                      {fiveYrTrendline.regression && (
                        <line
                          x1={fiveYrXPos(0)}
                          y1={fiveYrYPos(fiveYrTrendline.regression.startY)}
                          x2={fiveYrXPos(fiveYrData.length - 1)}
                          y2={fiveYrYPos(fiveYrTrendline.regression.endY)}
                          stroke="#ef4444"
                          strokeWidth="2"
                          strokeDasharray="8,4"
                        />
                      )}

                      {fiveYrHoveredIndex >= 0 && (() => {
                        const d = fiveYrData[fiveYrHoveredIndex]
                        const x = fiveYrXPos(fiveYrHoveredIndex)
                        const ma = fiveYrTrendline.movingAvg.find(m => m.index === fiveYrHoveredIndex)
                        return (
                          <>
                            <line x1={x} y1={CT} x2={x} y2={TL_CB} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                            <circle cx={x} cy={fiveYrYPos(d.rs3)} r="5" fill="#60a5fa" stroke="#111" strokeWidth="1.5" />
                            {ma && <circle cx={x} cy={fiveYrYPos(ma.value)} r="5" fill="#fff" stroke="#111" strokeWidth="1.5" />}
                          </>
                        )
                      })()}

                      <g transform={`translate(${VW / 2}, ${TL_CB + 50})`}>
                        <line x1={-140} y1={0} x2={-115} y2={0} stroke="rgba(96, 165, 250, 0.25)" strokeWidth="2" />
                        <text x={-110} y={4} fill="#fff" fontSize="11">Daily</text>
                        <line x1={-50} y1={0} x2={-25} y2={0} stroke="#60a5fa" strokeWidth="2.5" />
                        <text x={-20} y={4} fill="#fff" fontSize="11">90d MA</text>
                        <line x1={55} y1={0} x2={80} y2={0} stroke="#ef4444" strokeWidth="2" strokeDasharray="6,3" />
                        <text x={85} y={4} fill="#fff" fontSize="11">Regression</text>
                      </g>
                    </svg>
                  )}

                  {fiveYrHoveredIndex >= 0 && (() => {
                    const d = fiveYrData[fiveYrHoveredIndex]
                    const ma = fiveYrTrendline.movingAvg.find(m => m.index === fiveYrHoveredIndex)
                    const tooltipWidth = 180
                    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const left = (screenWidth - fiveYrMousePos.x) < tooltipWidth + 30
                      ? fiveYrMousePos.x - tooltipWidth - 15
                      : fiveYrMousePos.x + 15
                    return (
                      <div style={{
                        position: 'fixed', left, top: fiveYrMousePos.y - 60,
                        background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px',
                        padding: '10px 14px', zIndex: 1000, pointerEvents: 'none', minWidth: '160px'
                      }}>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
                          {d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '14px', color: '#60a5fa', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '700' }}>RS3:</span> {d.rs3.toLocaleString()}
                        </div>
                        {ma && (
                          <div style={{ fontSize: '13px', color: '#999' }}>
                            90d MA: {ma.value.toLocaleString()}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* ============ SECTION 5: 1-Year Trendline ============ */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px' : '12px 16px', marginBottom: '12px' }}>
                <div style={{ position: 'relative', marginBottom: '12px', textAlign: 'center', ...(isMobile ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' } : {}) }}>
                  <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: 0 }}>1-Year</h2>
                  {oneYrTrendline.regression && (
                    <div style={{
                      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px',
                      padding: isMobile ? '3px 6px' : '6px 14px', display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '12px',
                      ...(isMobile ? {} : { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' })
                    }}>
                      <span style={{
                        fontSize: isMobile ? '10px' : '14px', fontWeight: '700',
                        color: oneYrTrendline.regression.pctChange > 3 ? '#4ade80'
                          : oneYrTrendline.regression.pctChange < -3 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {Math.round(oneYrTrendline.regression.slope * 365) > 0 ? '+' : ''}{Math.round(oneYrTrendline.regression.slope * 365).toLocaleString()} players/year
                      </span>
                      <span style={{
                        fontSize: isMobile ? '9px' : '12px', fontWeight: '600',
                        padding: isMobile ? '1px 5px' : '2px 8px', borderRadius: '4px',
                        background: oneYrTrendline.regression.pctChange > 3 ? '#052e16'
                          : oneYrTrendline.regression.pctChange < -3 ? '#450a0a'
                          : '#422006',
                        color: oneYrTrendline.regression.pctChange > 3 ? '#4ade80'
                          : oneYrTrendline.regression.pctChange < -3 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {oneYrTrendline.regression.pctChange > 3 ? 'Growing'
                          : oneYrTrendline.regression.pctChange < -3 ? 'Declining'
                          : 'Flat'}
                      </span>
                    </div>
                  )}
                </div>

                <div
                  ref={oneYrChartRef}
                  style={{ height: isMobile ? '300px' : '450px', position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleOneYrHover}
                  onMouseLeave={() => setOneYrHoveredIndex(-1)}
                >
                  {oneYrData.length > 1 && (
                    <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${TL_VH}`} preserveAspectRatio="none">
                      {oneYrTicks.map((val, i) => {
                        const y = oneYrYPos(val)
                        return (
                          <g key={i}>
                            <line x1={CL} y1={y} x2={CR} y2={y} stroke="#2a2a2a" strokeWidth="1" />
                            <text x={CL - 8} y={y + 4} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="end" style={{ fontFamily: 'monospace' }}>
                              {val.toLocaleString()}
                            </text>
                          </g>
                        )
                      })}

                      {(() => {
                        const months = new Set()
                        const labels = []
                        for (let i = 0; i < oneYrData.length; i++) {
                          const d = oneYrData[i].timestamp
                          const key = `${d.getFullYear()}-${d.getMonth()}`
                          if (!months.has(key)) {
                            months.add(key)
                            labels.push({ index: i, month: d.getMonth(), year: d.getFullYear(), text: d.toLocaleDateString('en-US', { month: 'short' }) })
                          }
                        }
                        return labels
                      })().filter((_, i, arr) => i === 0 || i === arr.length - 1 || i % 2 === 0).map((label, i) => (
                        <text key={i} x={oneYrXPos(label.index)} y={TL_CB + 22} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">
                          {label.text}
                        </text>
                      ))}

                      <path
                        d={`M ${CL},${TL_CB} ${oneYrData.map((d, i) => `L ${oneYrXPos(i)},${oneYrYPos(d.rs3)}`).join(' ')} L ${oneYrXPos(oneYrData.length - 1)},${TL_CB} Z`}
                        fill="rgba(96, 165, 250, 0.08)"
                      />
                      <path
                        d={`M ${oneYrData.map((d, i) => `${oneYrXPos(i)},${oneYrYPos(d.rs3)}`).join(' L ')}`}
                        fill="none"
                        stroke="rgba(96, 165, 250, 0.25)"
                        strokeWidth="1"
                      />

                      {oneYrTrendline.movingAvg.length > 1 && (
                        <path
                          d={`M ${oneYrTrendline.movingAvg.map((d) => `${oneYrXPos(d.index)},${oneYrYPos(d.value)}`).join(' L ')}`}
                          fill="none"
                          stroke="#60a5fa"
                          strokeWidth="2.5"
                        />
                      )}

                      {oneYrTrendline.regression && (
                        <line
                          x1={oneYrXPos(0)}
                          y1={oneYrYPos(oneYrTrendline.regression.startY)}
                          x2={oneYrXPos(oneYrData.length - 1)}
                          y2={oneYrYPos(oneYrTrendline.regression.endY)}
                          stroke="#ef4444"
                          strokeWidth="2"
                          strokeDasharray="8,4"
                        />
                      )}

                      {oneYrHoveredIndex >= 0 && (() => {
                        const d = oneYrData[oneYrHoveredIndex]
                        const x = oneYrXPos(oneYrHoveredIndex)
                        const ma = oneYrTrendline.movingAvg.find(m => m.index === oneYrHoveredIndex)
                        return (
                          <>
                            <line x1={x} y1={CT} x2={x} y2={TL_CB} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                            <circle cx={x} cy={oneYrYPos(d.rs3)} r="5" fill="#60a5fa" stroke="#111" strokeWidth="1.5" />
                            {ma && <circle cx={x} cy={oneYrYPos(ma.value)} r="5" fill="#fff" stroke="#111" strokeWidth="1.5" />}
                          </>
                        )
                      })()}

                      <g transform={`translate(${VW / 2}, ${TL_CB + 50})`}>
                        <line x1={-140} y1={0} x2={-115} y2={0} stroke="rgba(96, 165, 250, 0.25)" strokeWidth="2" />
                        <text x={-110} y={4} fill="#fff" fontSize="11">Daily</text>
                        <line x1={-50} y1={0} x2={-25} y2={0} stroke="#60a5fa" strokeWidth="2.5" />
                        <text x={-20} y={4} fill="#fff" fontSize="11">90d MA</text>
                        <line x1={55} y1={0} x2={80} y2={0} stroke="#ef4444" strokeWidth="2" strokeDasharray="6,3" />
                        <text x={85} y={4} fill="#fff" fontSize="11">Regression</text>
                      </g>
                    </svg>
                  )}

                  {oneYrHoveredIndex >= 0 && (() => {
                    const d = oneYrData[oneYrHoveredIndex]
                    const ma = oneYrTrendline.movingAvg.find(m => m.index === oneYrHoveredIndex)
                    const tooltipWidth = 180
                    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const left = (screenWidth - oneYrMousePos.x) < tooltipWidth + 30
                      ? oneYrMousePos.x - tooltipWidth - 15
                      : oneYrMousePos.x + 15
                    return (
                      <div style={{
                        position: 'fixed', left, top: oneYrMousePos.y - 60,
                        background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px',
                        padding: '10px 14px', zIndex: 1000, pointerEvents: 'none', minWidth: '160px'
                      }}>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
                          {d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '14px', color: '#60a5fa', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '700' }}>RS3:</span> {d.rs3.toLocaleString()}
                        </div>
                        {ma && (
                          <div style={{ fontSize: '13px', color: '#999' }}>
                            90d MA: {ma.value.toLocaleString()}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* ============ SECTION 6: 6-Month Trendline ============ */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px' : '12px 16px', marginBottom: '12px' }}>
                <div style={{ position: 'relative', marginBottom: '12px', textAlign: 'center', ...(isMobile ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' } : {}) }}>
                  <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: 0 }}>6-Month</h2>
                  {sixMoTrendline.regression && (
                    <div style={{
                      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px',
                      padding: isMobile ? '3px 6px' : '6px 14px', display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '12px',
                      ...(isMobile ? {} : { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' })
                    }}>
                      <span style={{
                        fontSize: isMobile ? '10px' : '14px', fontWeight: '700',
                        color: sixMoTrendline.regression.pctChange > 5 ? '#4ade80'
                          : sixMoTrendline.regression.pctChange < -5 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {sixMoTrendline.regression.monthlyChange > 0 ? '+' : ''}{sixMoTrendline.regression.monthlyChange.toLocaleString()} players/mo
                      </span>
                      <span style={{
                        fontSize: isMobile ? '9px' : '12px', fontWeight: '600',
                        padding: isMobile ? '1px 5px' : '2px 8px', borderRadius: '4px',
                        background: sixMoTrendline.regression.pctChange > 5 ? '#052e16'
                          : sixMoTrendline.regression.pctChange < -5 ? '#450a0a'
                          : '#422006',
                        color: sixMoTrendline.regression.pctChange > 5 ? '#4ade80'
                          : sixMoTrendline.regression.pctChange < -5 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {sixMoTrendline.regression.pctChange > 5 ? 'Growing'
                          : sixMoTrendline.regression.pctChange < -5 ? 'Declining'
                          : 'Flat'}
                      </span>
                    </div>
                  )}
                </div>

                <div
                  ref={sixMoChartRef}
                  style={{ height: isMobile ? '300px' : '450px', position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleSixMoHover}
                  onMouseLeave={() => setSixMoHoveredIndex(-1)}
                >
                  {sixMoData.length > 1 && (
                    <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${TL_VH}`} preserveAspectRatio="none">
                      {sixMoTicks.map((val, i) => {
                        const y = sixMoYPos(val)
                        return (
                          <g key={i}>
                            <line x1={CL} y1={y} x2={CR} y2={y} stroke="#2a2a2a" strokeWidth="1" />
                            <text x={CL - 8} y={y + 4} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="end" style={{ fontFamily: 'monospace' }}>
                              {val.toLocaleString()}
                            </text>
                          </g>
                        )
                      })}

                      {(() => {
                        const months = new Set()
                        const labels = []
                        for (let i = 0; i < sixMoData.length; i++) {
                          const d = sixMoData[i].timestamp
                          const key = `${d.getFullYear()}-${d.getMonth()}`
                          if (!months.has(key)) {
                            months.add(key)
                            labels.push({ index: i, text: d.toLocaleDateString('en-US', { month: 'short' }) })
                          }
                        }
                        return labels
                      })().map((label, i) => (
                        <text key={i} x={sixMoXPos(label.index)} y={TL_CB + 22} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">
                          {label.text}
                        </text>
                      ))}

                      <path
                        d={`M ${CL},${TL_CB} ${sixMoData.map((d, i) => `L ${sixMoXPos(i)},${sixMoYPos(d.rs3)}`).join(' ')} L ${sixMoXPos(sixMoData.length - 1)},${TL_CB} Z`}
                        fill="rgba(96, 165, 250, 0.08)"
                      />
                      <path
                        d={`M ${sixMoData.map((d, i) => `${sixMoXPos(i)},${sixMoYPos(d.rs3)}`).join(' L ')}`}
                        fill="none"
                        stroke="rgba(96, 165, 250, 0.25)"
                        strokeWidth="1"
                      />

                      {sixMoTrendline.movingAvg.length > 1 && (
                        <path
                          d={`M ${sixMoTrendline.movingAvg.map((d) => `${sixMoXPos(d.index)},${sixMoYPos(d.value)}`).join(' L ')}`}
                          fill="none"
                          stroke="#60a5fa"
                          strokeWidth="2.5"
                        />
                      )}


                      {sixMoTrendline.regression && (
                        <line
                          x1={sixMoXPos(0)}
                          y1={sixMoYPos(sixMoTrendline.regression.startY)}
                          x2={sixMoXPos(sixMoData.length - 1)}
                          y2={sixMoYPos(sixMoTrendline.regression.endY)}
                          stroke="#ef4444"
                          strokeWidth="2"
                          strokeDasharray="8,4"
                        />
                      )}

                      {sixMoHoveredIndex >= 0 && (() => {
                        const d = sixMoData[sixMoHoveredIndex]
                        const x = sixMoXPos(sixMoHoveredIndex)
                        const ma = sixMoTrendline.movingAvg.find(m => m.index === sixMoHoveredIndex)
                        return (
                          <>
                            <line x1={x} y1={CT} x2={x} y2={TL_CB} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                            <circle cx={x} cy={sixMoYPos(d.rs3)} r="5" fill="#60a5fa" stroke="#111" strokeWidth="1.5" />
                            {ma && <circle cx={x} cy={sixMoYPos(ma.value)} r="5" fill="#fff" stroke="#111" strokeWidth="1.5" />}
                          </>
                        )
                      })()}

                      <g transform={`translate(${VW / 2}, ${TL_CB + 50})`}>
                        <line x1={-140} y1={0} x2={-115} y2={0} stroke="rgba(96, 165, 250, 0.25)" strokeWidth="2" />
                        <text x={-110} y={4} fill="#fff" fontSize="11">Daily</text>
                        <line x1={-50} y1={0} x2={-25} y2={0} stroke="#60a5fa" strokeWidth="2.5" />
                        <text x={-20} y={4} fill="#fff" fontSize="11">30d MA</text>
                        <line x1={55} y1={0} x2={80} y2={0} stroke="#ef4444" strokeWidth="2" strokeDasharray="6,3" />
                        <text x={85} y={4} fill="#fff" fontSize="11">Regression</text>
                      </g>
                    </svg>
                  )}

                  {sixMoHoveredIndex >= 0 && (() => {
                    const d = sixMoData[sixMoHoveredIndex]
                    const ma = sixMoTrendline.movingAvg.find(m => m.index === sixMoHoveredIndex)
                    const tooltipWidth = 180
                    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const left = (screenWidth - sixMoMousePos.x) < tooltipWidth + 30
                      ? sixMoMousePos.x - tooltipWidth - 15
                      : sixMoMousePos.x + 15
                    return (
                      <div style={{
                        position: 'fixed', left, top: sixMoMousePos.y - 60,
                        background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px',
                        padding: '10px 14px', zIndex: 1000, pointerEvents: 'none', minWidth: '160px'
                      }}>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
                          {d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '14px', color: '#60a5fa', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '700' }}>RS3:</span> {d.rs3.toLocaleString()}
                        </div>
                        {ma && (
                          <div style={{ fontSize: '13px', color: '#999' }}>
                            30d MA: {ma.value.toLocaleString()}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* ============ SECTION 7: 3-Month Trendline ============ */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px' : '12px 16px', marginBottom: '12px' }}>
                <div style={{ position: 'relative', marginBottom: '12px', textAlign: 'center', ...(isMobile ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' } : {}) }}>
                  <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: 0 }}>3-Month</h2>
                  {threeMoTrendline.regression && (
                    <div style={{
                      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px',
                      padding: isMobile ? '3px 6px' : '6px 14px', display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '12px',
                      ...(isMobile ? {} : { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' })
                    }}>
                      <span style={{
                        fontSize: isMobile ? '10px' : '14px', fontWeight: '700',
                        color: threeMoTrendline.regression.pctChange > 7 ? '#4ade80'
                          : threeMoTrendline.regression.pctChange < -7 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {threeMoTrendline.regression.monthlyChange > 0 ? '+' : ''}{threeMoTrendline.regression.monthlyChange.toLocaleString()} players/mo
                      </span>
                      <span style={{
                        fontSize: isMobile ? '9px' : '12px', fontWeight: '600',
                        padding: isMobile ? '1px 5px' : '2px 8px', borderRadius: '4px',
                        background: threeMoTrendline.regression.pctChange > 7 ? '#052e16'
                          : threeMoTrendline.regression.pctChange < -7 ? '#450a0a'
                          : '#422006',
                        color: threeMoTrendline.regression.pctChange > 7 ? '#4ade80'
                          : threeMoTrendline.regression.pctChange < -7 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {threeMoTrendline.regression.pctChange > 7 ? 'Growing'
                          : threeMoTrendline.regression.pctChange < -7 ? 'Declining'
                          : 'Flat'}
                      </span>
                    </div>
                  )}
                </div>

                <div
                  ref={threeMoChartRef}
                  style={{ height: isMobile ? '300px' : '450px', position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleThreeMoHover}
                  onMouseLeave={() => setThreeMoHoveredIndex(-1)}
                >
                  {threeMoData.length > 1 && (
                    <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${TL_VH}`} preserveAspectRatio="none">
                      {threeMoTicks.map((val, i) => {
                        const y = threeMoYPos(val)
                        return (
                          <g key={i}>
                            <line x1={CL} y1={y} x2={CR} y2={y} stroke="#2a2a2a" strokeWidth="1" />
                            <text x={CL - 8} y={y + 4} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="end" style={{ fontFamily: 'monospace' }}>
                              {val.toLocaleString()}
                            </text>
                          </g>
                        )
                      })}

                      {(() => {
                        const labels = [], step = Math.max(1, Math.floor(threeMoData.length / 8))
                        for (let i = 0; i < threeMoData.length; i += step) {
                          labels.push({ index: i, text: threeMoData[i].timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })
                        }
                        return labels
                      })().map((label, i) => (
                        <text key={i} x={threeMoXPos(label.index)} y={TL_CB + 22} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">
                          {label.text}
                        </text>
                      ))}

                      <path
                        d={`M ${CL},${TL_CB} ${threeMoData.map((d, i) => `L ${threeMoXPos(i)},${threeMoYPos(d.rs3)}`).join(' ')} L ${threeMoXPos(threeMoData.length - 1)},${TL_CB} Z`}
                        fill="rgba(96, 165, 250, 0.08)"
                      />
                      <path
                        d={`M ${threeMoData.map((d, i) => `${threeMoXPos(i)},${threeMoYPos(d.rs3)}`).join(' L ')}`}
                        fill="none"
                        stroke="rgba(96, 165, 250, 0.25)"
                        strokeWidth="1"
                      />

                      {threeMoTrendline.movingAvg.length > 1 && (
                        <path
                          d={`M ${threeMoTrendline.movingAvg.map((d) => `${threeMoXPos(d.index)},${threeMoYPos(d.value)}`).join(' L ')}`}
                          fill="none"
                          stroke="#60a5fa"
                          strokeWidth="2.5"
                        />
                      )}

                      {threeMoTrendline.regression && (
                        <line
                          x1={threeMoXPos(0)}
                          y1={threeMoYPos(threeMoTrendline.regression.startY)}
                          x2={threeMoXPos(threeMoData.length - 1)}
                          y2={threeMoYPos(threeMoTrendline.regression.endY)}
                          stroke="#ef4444"
                          strokeWidth="2"
                          strokeDasharray="8,4"
                        />
                      )}

                      {threeMoHoveredIndex >= 0 && (() => {
                        const d = threeMoData[threeMoHoveredIndex]
                        const x = threeMoXPos(threeMoHoveredIndex)
                        const ma = threeMoTrendline.movingAvg.find(m => m.index === threeMoHoveredIndex)
                        return (
                          <>
                            <line x1={x} y1={CT} x2={x} y2={TL_CB} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                            <circle cx={x} cy={threeMoYPos(d.rs3)} r="5" fill="#60a5fa" stroke="#111" strokeWidth="1.5" />
                            {ma && <circle cx={x} cy={threeMoYPos(ma.value)} r="5" fill="#fff" stroke="#111" strokeWidth="1.5" />}
                          </>
                        )
                      })()}

                      <g transform={`translate(${VW / 2}, ${TL_CB + 50})`}>
                        <line x1={-140} y1={0} x2={-115} y2={0} stroke="rgba(96, 165, 250, 0.25)" strokeWidth="2" />
                        <text x={-110} y={4} fill="#fff" fontSize="11">Daily</text>
                        <line x1={-50} y1={0} x2={-25} y2={0} stroke="#60a5fa" strokeWidth="2.5" />
                        <text x={-20} y={4} fill="#fff" fontSize="11">14d MA</text>
                        <line x1={55} y1={0} x2={80} y2={0} stroke="#ef4444" strokeWidth="2" strokeDasharray="6,3" />
                        <text x={85} y={4} fill="#fff" fontSize="11">Regression</text>
                      </g>
                    </svg>
                  )}

                  {threeMoHoveredIndex >= 0 && (() => {
                    const d = threeMoData[threeMoHoveredIndex]
                    const ma = threeMoTrendline.movingAvg.find(m => m.index === threeMoHoveredIndex)
                    const tooltipWidth = 180
                    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const left = (screenWidth - threeMoMousePos.x) < tooltipWidth + 30
                      ? threeMoMousePos.x - tooltipWidth - 15
                      : threeMoMousePos.x + 15
                    return (
                      <div style={{
                        position: 'fixed', left, top: threeMoMousePos.y - 60,
                        background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px',
                        padding: '10px 14px', zIndex: 1000, pointerEvents: 'none', minWidth: '160px'
                      }}>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
                          {d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '14px', color: '#60a5fa', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '700' }}>RS3:</span> {d.rs3.toLocaleString()}
                        </div>
                        {ma && (
                          <div style={{ fontSize: '13px', color: '#999' }}>
                            14d MA: {ma.value.toLocaleString()}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* ============ SECTION 8: 1-Month Trendline ============ */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px' : '12px 16px', marginBottom: '0' }}>
                <div style={{ position: 'relative', marginBottom: '12px', textAlign: 'center', ...(isMobile ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' } : {}) }}>
                  <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: 0 }}>1-Month</h2>
                  {oneMoTrendline.regression && (
                    <div style={{
                      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px',
                      padding: isMobile ? '3px 6px' : '6px 14px', display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '12px',
                      ...(isMobile ? {} : { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' })
                    }}>
                      <span style={{
                        fontSize: isMobile ? '10px' : '14px', fontWeight: '700',
                        color: oneMoTrendline.regression.pctChange > 10 ? '#4ade80'
                          : oneMoTrendline.regression.pctChange < -10 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {oneMoTrendline.regression.dailyChange > 0 ? '+' : ''}{oneMoTrendline.regression.dailyChange.toLocaleString()} players/day
                      </span>
                      <span style={{
                        fontSize: isMobile ? '9px' : '12px', fontWeight: '600',
                        padding: isMobile ? '1px 5px' : '2px 8px', borderRadius: '4px',
                        background: oneMoTrendline.regression.pctChange > 10 ? '#052e16'
                          : oneMoTrendline.regression.pctChange < -10 ? '#450a0a'
                          : '#422006',
                        color: oneMoTrendline.regression.pctChange > 10 ? '#4ade80'
                          : oneMoTrendline.regression.pctChange < -10 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {oneMoTrendline.regression.pctChange > 10 ? 'Growing'
                          : oneMoTrendline.regression.pctChange < -10 ? 'Declining'
                          : 'Flat'}
                      </span>
                    </div>
                  )}
                </div>

                <div
                  ref={oneMoChartRef}
                  style={{ height: isMobile ? '300px' : '450px', position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleOneMoHover}
                  onMouseLeave={() => setOneMoHoveredIndex(-1)}
                >
                  {oneMoData.length > 1 && (
                    <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${TL_VH}`} preserveAspectRatio="none">
                      {oneMoTicks.map((val, i) => {
                        const y = oneMoYPos(val)
                        return (
                          <g key={i}>
                            <line x1={CL} y1={y} x2={CR} y2={y} stroke="#2a2a2a" strokeWidth="1" />
                            <text x={CL - 8} y={y + 4} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="end" style={{ fontFamily: 'monospace' }}>
                              {val.toLocaleString()}
                            </text>
                          </g>
                        )
                      })}

                      {(() => {
                        const labels = []
                        for (let i = 0; i < oneMoData.length; i++) {
                          const d = oneMoData[i].timestamp
                          if (d.getDay() === 1) {
                            labels.push({ index: i, text: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })
                          }
                        }
                        return labels
                      })().map((label, i) => (
                        <text key={i} x={oneMoXPos(label.index)} y={TL_CB + 22} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">
                          {label.text}
                        </text>
                      ))}

                      <path
                        d={`M ${CL},${TL_CB} ${oneMoData.map((d, i) => `L ${oneMoXPos(i)},${oneMoYPos(d.rs3)}`).join(' ')} L ${oneMoXPos(oneMoData.length - 1)},${TL_CB} Z`}
                        fill="rgba(96, 165, 250, 0.08)"
                      />
                      <path
                        d={`M ${oneMoData.map((d, i) => `${oneMoXPos(i)},${oneMoYPos(d.rs3)}`).join(' L ')}`}
                        fill="none"
                        stroke="rgba(96, 165, 250, 0.25)"
                        strokeWidth="1"
                      />

                      {oneMoTrendline.movingAvg.length > 1 && (
                        <path
                          d={`M ${oneMoTrendline.movingAvg.map((d) => `${oneMoXPos(d.index)},${oneMoYPos(d.value)}`).join(' L ')}`}
                          fill="none"
                          stroke="#60a5fa"
                          strokeWidth="2.5"
                        />
                      )}

                      {oneMoTrendline.regression && (
                        <line
                          x1={oneMoXPos(0)}
                          y1={oneMoYPos(oneMoTrendline.regression.startY)}
                          x2={oneMoXPos(oneMoData.length - 1)}
                          y2={oneMoYPos(oneMoTrendline.regression.endY)}
                          stroke="#ef4444"
                          strokeWidth="2"
                          strokeDasharray="8,4"
                        />
                      )}

                      {oneMoHoveredIndex >= 0 && (() => {
                        const d = oneMoData[oneMoHoveredIndex]
                        const x = oneMoXPos(oneMoHoveredIndex)
                        const ma = oneMoTrendline.movingAvg.find(m => m.index === oneMoHoveredIndex)
                        return (
                          <>
                            <line x1={x} y1={CT} x2={x} y2={TL_CB} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                            <circle cx={x} cy={oneMoYPos(d.rs3)} r="5" fill="#60a5fa" stroke="#111" strokeWidth="1.5" />
                            {ma && <circle cx={x} cy={oneMoYPos(ma.value)} r="5" fill="#fff" stroke="#111" strokeWidth="1.5" />}
                          </>
                        )
                      })()}

                      <g transform={`translate(${VW / 2}, ${TL_CB + 50})`}>
                        <line x1={-140} y1={0} x2={-115} y2={0} stroke="rgba(96, 165, 250, 0.25)" strokeWidth="2" />
                        <text x={-110} y={4} fill="#fff" fontSize="11">Daily</text>
                        <line x1={-50} y1={0} x2={-25} y2={0} stroke="#60a5fa" strokeWidth="2.5" />
                        <text x={-20} y={4} fill="#fff" fontSize="11">7d MA</text>
                        <line x1={55} y1={0} x2={80} y2={0} stroke="#ef4444" strokeWidth="2" strokeDasharray="6,3" />
                        <text x={85} y={4} fill="#fff" fontSize="11">Regression</text>
                      </g>
                    </svg>
                  )}

                  {oneMoHoveredIndex >= 0 && (() => {
                    const d = oneMoData[oneMoHoveredIndex]
                    const ma = oneMoTrendline.movingAvg.find(m => m.index === oneMoHoveredIndex)
                    const tooltipWidth = 180
                    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const left = (screenWidth - oneMoMousePos.x) < tooltipWidth + 30
                      ? oneMoMousePos.x - tooltipWidth - 15
                      : oneMoMousePos.x + 15
                    return (
                      <div style={{
                        position: 'fixed', left, top: oneMoMousePos.y - 60,
                        background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px',
                        padding: '10px 14px', zIndex: 1000, pointerEvents: 'none', minWidth: '160px'
                      }}>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
                          {d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '14px', color: '#60a5fa', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '700' }}>RS3:</span> {d.rs3.toLocaleString()}
                        </div>
                        {ma && (
                          <div style={{ fontSize: '13px', color: '#999' }}>
                            7d MA: {ma.value.toLocaleString()}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>
              </div>

              {/* ============ SECTION 9: Peaks & Troughs ============ */}
              <div style={{ background: '#0a0a0a', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '10px' : '16px', marginBottom: '12px' }}>
                <h2 style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '700', color: '#fff', margin: '0 0 12px 0' }}>RS3 3-Month Peaks & Troughs</h2>

              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px' : '12px 16px', marginBottom: '12px' }}>
                <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: '0 0 12px 0', textAlign: 'center' }}>Peaks</h2>

                <div
                  ref={peaksChartRef}
                  style={{ height: isMobile ? '300px' : '450px', position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handlePeaksHover}
                  onMouseLeave={() => setPeaksHoveredIndex(-1)}
                >
                  {peaksData.length > 1 && (
                    <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${TL_VH}`} preserveAspectRatio="none">
                      {peaksTicks.map((val, i) => {
                        const y = peaksYPos(val)
                        return (
                          <g key={i}>
                            <line x1={CL} y1={y} x2={CR} y2={y} stroke="#2a2a2a" strokeWidth="1" />
                            <text x={CL - 8} y={y + 4} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="end" style={{ fontFamily: 'monospace' }}>
                              {val.toLocaleString()}
                            </text>
                          </g>
                        )
                      })}

                      {(() => {
                        const months = new Set()
                        const labels = []
                        for (let i = 0; i < peaksData.length; i++) {
                          const d = peaksData[i].timestamp
                          const monthKey = `${d.getFullYear()}-${d.getMonth()}`
                          if (!months.has(monthKey)) {
                            months.add(monthKey)
                            labels.push({ index: i, text: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) })
                          }
                        }
                        return labels
                      })().map((label, i) => (
                        <text key={i} x={peaksXPos(label.index)} y={TL_CB + 22} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">
                          {label.text}
                        </text>
                      ))}

                      <path
                        d={`M ${CL},${TL_CB} ${peaksData.map((d, i) => `L ${peaksXPos(i)},${peaksYPos(d.rs3_peak)}`).join(' ')} L ${peaksXPos(peaksData.length - 1)},${TL_CB} Z`}
                        fill="rgba(251, 146, 60, 0.08)"
                      />
                      <path
                        d={`M ${peaksData.map((d, i) => `${peaksXPos(i)},${peaksYPos(d.rs3_peak)}`).join(' L ')}`}
                        fill="none"
                        stroke="rgba(251, 146, 60, 0.3)"
                        strokeWidth="1"
                      />

                      {peaksTrendline.movingAvg.length > 1 && (
                        <path
                          d={`M ${peaksTrendline.movingAvg.map((d) => `${peaksXPos(d.index)},${peaksYPos(d.value)}`).join(' L ')}`}
                          fill="none"
                          stroke="#fb923c"
                          strokeWidth="2.5"
                        />
                      )}

                      {peaksHoveredIndex >= 0 && (() => {
                        const d = peaksData[peaksHoveredIndex]
                        const x = peaksXPos(peaksHoveredIndex)
                        const ma = peaksTrendline.movingAvg.find(m => m.index === peaksHoveredIndex)
                        return (
                          <>
                            <line x1={x} y1={CT} x2={x} y2={TL_CB} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                            <circle cx={x} cy={peaksYPos(d.rs3_peak)} r="5" fill="#fb923c" stroke="#111" strokeWidth="1.5" />
                            {ma && <circle cx={x} cy={peaksYPos(ma.value)} r="5" fill="#fff" stroke="#111" strokeWidth="1.5" />}
                          </>
                        )
                      })()}

                      <g transform={`translate(${VW / 2}, ${TL_CB + 50})`}>
                        <line x1={-80} y1={0} x2={-55} y2={0} stroke="rgba(251, 146, 60, 0.3)" strokeWidth="2" />
                        <text x={-50} y={4} fill="#fff" fontSize="11">Daily Peak</text>
                        <line x1={30} y1={0} x2={55} y2={0} stroke="#fb923c" strokeWidth="2.5" />
                        <text x={60} y={4} fill="#fff" fontSize="11">14d MA</text>
                      </g>
                    </svg>
                  )}

                  {peaksHoveredIndex >= 0 && (() => {
                    const d = peaksData[peaksHoveredIndex]
                    const ma = peaksTrendline.movingAvg.find(m => m.index === peaksHoveredIndex)
                    const tooltipWidth = 180
                    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const left = (screenWidth - peaksMousePos.x) < tooltipWidth + 30
                      ? peaksMousePos.x - tooltipWidth - 15
                      : peaksMousePos.x + 15
                    return (
                      <div style={{
                        position: 'fixed', left, top: peaksMousePos.y - 60,
                        background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px',
                        padding: '10px 14px', zIndex: 1000, pointerEvents: 'none', minWidth: '160px'
                      }}>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
                          {d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '14px', color: '#fb923c', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '700' }}>Peak:</span> {d.rs3_peak.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '13px', color: '#60a5fa', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '600' }}>Avg:</span> {d.rs3.toLocaleString()}
                        </div>
                        {ma && (
                          <div style={{ fontSize: '13px', color: '#999' }}>
                            14d MA: {ma.value.toLocaleString()}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>

              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px' : '12px 16px', marginBottom: '0' }}>
                <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: '0 0 12px 0', textAlign: 'center' }}>Troughs</h2>

                <div
                  ref={troughsChartRef}
                  style={{ height: isMobile ? '300px' : '450px', position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleTroughsHover}
                  onMouseLeave={() => setTroughsHoveredIndex(-1)}
                >
                  {troughsData.length > 1 && (
                    <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${TL_VH}`} preserveAspectRatio="none">
                      {troughsTicks.map((val, i) => {
                        const y = troughsYPos(val)
                        return (
                          <g key={i}>
                            <line x1={CL} y1={y} x2={CR} y2={y} stroke="#2a2a2a" strokeWidth="1" />
                            <text x={CL - 8} y={y + 4} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="end" style={{ fontFamily: 'monospace' }}>
                              {val.toLocaleString()}
                            </text>
                          </g>
                        )
                      })}

                      {(() => {
                        const labels = []
                        let lastLabel = ''
                        for (let i = 0; i < troughsData.length; i++) {
                          const d = troughsData[i].timestamp
                          const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
                          if (label !== lastLabel) { labels.push({ label, index: i }); lastLabel = label }
                        }
                        return labels.map((label, i) => (
                          <text key={i} x={troughsXPos(label.index)} y={TL_CB + 22} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">
                            {label.label}
                          </text>
                        ))
                      })()}

                      <path
                        d={`M ${CL},${TL_CB} ${troughsData.map((d, i) => `L ${troughsXPos(i)},${troughsYPos(d.rs3_min)}`).join(' ')} L ${troughsXPos(troughsData.length - 1)},${TL_CB} Z`}
                        fill="rgba(96, 165, 250, 0.15)"
                        stroke="none"
                      />
                      <path
                        d={`M ${troughsData.map((d, i) => `${troughsXPos(i)},${troughsYPos(d.rs3_min)}`).join(' L ')}`}
                        fill="none"
                        stroke="rgba(96, 165, 250, 0.3)"
                        strokeWidth="1.5"
                      />

                      {troughsTrendline.movingAvg.length > 1 && (
                        <path
                          d={`M ${troughsTrendline.movingAvg.map((d) => `${troughsXPos(d.index)},${troughsYPos(d.value)}`).join(' L ')}`}
                          fill="none"
                          stroke="#60a5fa"
                          strokeWidth="2.5"
                        />
                      )}

                      {troughsHoveredIndex >= 0 && (() => {
                        const d = troughsData[troughsHoveredIndex]
                        const x = troughsXPos(troughsHoveredIndex)
                        const ma = troughsTrendline.movingAvg.find(m => m.index === troughsHoveredIndex)
                        return (
                          <>
                            <line x1={x} y1={CT} x2={x} y2={TL_CB} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                            <circle cx={x} cy={troughsYPos(d.rs3_min)} r="5" fill="#60a5fa" stroke="#111" strokeWidth="1.5" />
                            {ma && <circle cx={x} cy={troughsYPos(ma.value)} r="5" fill="#fff" stroke="#111" strokeWidth="1.5" />}
                          </>
                        )
                      })()}

                      <g transform={`translate(${VW / 2}, ${TL_CB + 50})`}>
                        <line x1={-80} y1={0} x2={-55} y2={0} stroke="rgba(96, 165, 250, 0.3)" strokeWidth="2" />
                        <text x={-50} y={4} fill="#fff" fontSize="11">Daily Trough</text>
                        <line x1={40} y1={0} x2={65} y2={0} stroke="#60a5fa" strokeWidth="2.5" />
                        <text x={70} y={4} fill="#fff" fontSize="11">14d MA</text>
                      </g>
                    </svg>
                  )}

                  {troughsHoveredIndex >= 0 && (() => {
                    const d = troughsData[troughsHoveredIndex]
                    const ma = troughsTrendline.movingAvg.find(m => m.index === troughsHoveredIndex)
                    const tooltipWidth = 180
                    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const left = (screenWidth - troughsMousePos.x) < tooltipWidth + 30
                      ? troughsMousePos.x - tooltipWidth - 15
                      : troughsMousePos.x + 15
                    return (
                      <div style={{
                        position: 'fixed', left, top: troughsMousePos.y - 60,
                        background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px',
                        padding: '10px 14px', zIndex: 1000, pointerEvents: 'none', minWidth: '160px'
                      }}>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
                          {d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '14px', color: '#60a5fa', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '700' }}>Trough:</span> {d.rs3_min.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '13px', color: '#fb923c', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '600' }}>Avg:</span> {d.rs3.toLocaleString()}
                        </div>
                        {ma && (
                          <div style={{ fontSize: '13px', color: '#999' }}>
                            14d MA: {ma.value.toLocaleString()}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>
              </div>
            </>
          )}

          {/* ============ SECTION 10: Hiscores ============ */}
          {hiscoresData.length > 0 && (
            <div style={{ background: '#0a0a0a', borderRadius: '12px', padding: '20px', marginTop: '20px' }}>
              <h2 style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '700', color: '#fff', margin: '0 0 12px 0' }}>RS3 Hiscores</h2>
              <p style={{ fontSize: '13px', color: '#888', margin: '-8px 0 12px 0' }}>Unique accounts gaining XP each week on the RS3 hiscores</p>

              {/* Hiscores YoY Chart */}
              {hsYoyYears.length > 0 && (() => {
                const hsYoyTicks = computeYTicks(hsYoyMaxVal)
                const hsYoyMax = hsYoyTicks[hsYoyTicks.length - 1] || 1
                const hsYoyYPos = (v) => CB - (v / hsYoyMax) * CH
                return (
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px' : '12px 16px', marginBottom: '12px' }}>
                <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: '0 0 12px 0' }}>Year-over-Year Hiscores</h2>

                <div
                  ref={hsYoyChartRef}
                  style={{ height: isMobile ? '350px' : '550px', position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleHsYoyHover}
                  onTouchMove={handleHsYoyHover}
                  onMouseLeave={() => setHsYoyHoveredWeek(-1)}
                  onTouchEnd={() => setHsYoyHoveredWeek(-1)}
                >
                  <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none">
                    {/* Month grid lines */}
                    {hsMonthWeeks.map((week, i) => (
                      <g key={i}>
                        <line x1={hsYoyXPos(week)} y1={CT} x2={hsYoyXPos(week)} y2={CB} stroke="#1a1a1a" strokeWidth="1" />
                        <text x={hsYoyXPos(week + 2)} y={CB + 22} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">
                          {monthLabels[i]}
                        </text>
                      </g>
                    ))}

                    {/* Y-axis ticks */}
                    {hsYoyTicks.map((val, i) => {
                      const y = hsYoyYPos(val)
                      return (
                        <g key={i}>
                          <line x1={CL} y1={y} x2={CR} y2={y} stroke="#2a2a2a" strokeWidth="1" />
                          <text x={CL - 8} y={y + 4} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="end" style={{ fontFamily: 'monospace' }}>
                            {val.toLocaleString()}
                          </text>
                        </g>
                      )
                    })}

                    {/* Year lines */}
                    {hsYoyYears.map(year => {
                      const weeks = hsYoyData[year]
                      const weekEntries = Object.entries(weeks).map(([w, v]) => [parseInt(w), v]).sort((a, b) => a[0] - b[0])
                      if (weekEntries.length < 2) return null
                      const pathD = weekEntries.map(([w, val], i) => {
                        const x = hsYoyXPos(w)
                        const y = hsYoyYPos(val)
                        return `${i === 0 ? 'M' : 'L'} ${x},${y}`
                      }).join(' ')
                      const isCurrent = year === currentYear
                      return (
                        <path
                          key={year}
                          d={pathD}
                          fill="none"
                          stroke={yearColors[year] || '#666'}
                          strokeWidth={isCurrent ? 3 : 2}
                          opacity={isCurrent ? 1 : 0.7}
                        />
                      )
                    })}

                    {/* Hover crosshair */}
                    {hsYoyHoveredWeek >= 1 && (
                      <line x1={hsYoyXPos(hsYoyHoveredWeek)} y1={CT} x2={hsYoyXPos(hsYoyHoveredWeek)} y2={CB} stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="4" />
                    )}

                    {/* Hover dots */}
                    {hsYoyHoveredWeek >= 1 && hsYoyYears.map(year => {
                      const val = hsYoyData[year]?.[hsYoyHoveredWeek]
                      if (val === undefined) return null
                      return (
                        <circle
                          key={year}
                          cx={hsYoyXPos(hsYoyHoveredWeek)}
                          cy={hsYoyYPos(val)}
                          r="5"
                          fill={yearColors[year] || '#666'}
                          stroke="#111"
                          strokeWidth="1.5"
                        />
                      )
                    })}

                    {/* Legend — centered below month labels */}
                    <g transform={`translate(${VW / 2}, ${CB + 75})`}>
                      {hsYoyYears.map((year, i) => {
                        const totalWidth = hsYoyYears.length * 80
                        const startX = -totalWidth / 2
                        const x = startX + i * 80
                        return (
                          <g key={year}>
                            <line x1={x} y1={0} x2={x + 12} y2={0} stroke={yearColors[year] || '#666'} strokeWidth={year === currentYear ? 3 : 2} />
                            <text x={x + 16} y={4} fill="#fff" fontSize="12">{year}</text>
                          </g>
                        )
                      })}
                    </g>
                  </svg>

                  {/* YoY Tooltip */}
                  {hsYoyHoveredWeek >= 1 && (() => {
                    // Compute date range: ISO weeks start Monday
                    // ISO Week 1 contains Jan 4; find its Monday
                    const jan4 = new Date(Date.UTC(currentYear, 0, 4))
                    const daysSinceMon = (jan4.getUTCDay() + 6) % 7
                    const week1Monday = new Date(jan4.getTime() - daysSinceMon * 86400000)
                    const weekStart = new Date(week1Monday.getTime() + (hsYoyHoveredWeek - 1) * 7 * 86400000)
                    const weekEnd = new Date(weekStart.getTime() + 6 * 86400000)
                    const mNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                    const startStr = `${mNames[weekStart.getUTCMonth()]} ${weekStart.getUTCDate()}`
                    const endStr = `${mNames[weekEnd.getUTCMonth()]} ${weekEnd.getUTCDate()}`
                    const weekLabel = weekStart.getUTCMonth() === weekEnd.getUTCMonth()
                      ? `${mNames[weekStart.getUTCMonth()]} ${weekStart.getUTCDate()}\u2013${weekEnd.getUTCDate()}`
                      : `${startStr}\u2013${endStr}`
                    const valuesForWeek = hsYoyYears.map(year => ({
                      year,
                      val: hsYoyData[year]?.[hsYoyHoveredWeek],
                      color: yearColors[year] || '#666',
                    })).filter(v => v.val !== undefined).sort((a, b) => b.val - a.val)
                    if (valuesForWeek.length === 0) return null
                    const tooltipWidth = 190
                    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const left = (screenWidth - hsYoyMousePos.x) < tooltipWidth + 30
                      ? hsYoyMousePos.x - tooltipWidth - 15
                      : hsYoyMousePos.x + 15
                    return (
                      <div style={{
                        position: 'fixed', left, top: hsYoyMousePos.y - 40,
                        background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px',
                        padding: '10px 14px', zIndex: 1000, pointerEvents: 'none', minWidth: '170px'
                      }}>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
                          Week {hsYoyHoveredWeek} ({weekLabel})
                        </div>
                        {valuesForWeek.map(v => (
                          <div key={v.year} style={{ fontSize: '13px', color: '#fff', marginBottom: '2px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                            <span style={{ color: v.color, fontWeight: v.year === currentYear ? '700' : '500' }}>{v.year}</span>
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v.val.toLocaleString()}</span>
                          </div>
                        ))}
                        {valuesForWeek.length >= 2 && (() => {
                          const curr = valuesForWeek.find(v => v.year === currentYear)
                          const prev = valuesForWeek.find(v => v.year === currentYear - 1)
                          if (curr && prev) {
                            const change = ((curr.val - prev.val) / prev.val * 100)
                            return (
                              <div style={{ fontSize: '12px', color: change > 0 ? '#4ade80' : change < 0 ? '#ef4444' : '#eab308', borderTop: '1px solid #333', paddingTop: '4px', marginTop: '4px' }}>
                                YoY: {change > 0 ? '+' : ''}{change.toFixed(1)}%
                              </div>
                            )
                          }
                          return null
                        })()}
                      </div>
                    )
                  })()}
                </div>
              </div>
                )
              })()}

              {/* Hiscores Yearly Summary */}
              {hsYearlySummary.length > 0 && (
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px' : '12px 16px', marginBottom: '12px' }}>
                <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: '0 0 12px 0' }}>Hiscores Yearly Summary</h2>

                {isMobile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[...hsYearlySummary].reverse().map(ys => (
                      <div key={ys.year} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px', padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '16px', fontWeight: '700', color: yearColors[ys.year] || '#fff' }}>{ys.year}</span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {ys.samePeriodChange !== null && (
                              <span style={{ fontSize: '12px', fontWeight: '600', color: ys.samePeriodChange > 0 ? '#4ade80' : ys.samePeriodChange < 0 ? '#ef4444' : '#eab308' }}>
                                Same period: {ys.samePeriodChange > 0 ? '+' : ''}{ys.samePeriodChange.toFixed(1)}%
                              </span>
                            )}
                            {ys.yoyChange !== null && (
                              <span style={{ fontSize: '12px', fontWeight: '600', color: ys.yoyChange > 0 ? '#4ade80' : ys.yoyChange < 0 ? '#ef4444' : '#eab308' }}>
                                Full: {ys.yoyChange > 0 ? '+' : ''}{ys.yoyChange.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '13px' }}>
                          <div><span style={{ color: '#999' }}>Avg: </span><span style={{ color: '#a855f7', fontWeight: '600' }}>{ys.avg.toLocaleString()}</span></div>
                          <div><span style={{ color: '#999' }}>Peak: </span><span style={{ color: '#fff', fontWeight: '600' }}>{ys.peak.toLocaleString()}</span></div>
                          <div><span style={{ color: '#999' }}>Peak: </span><span style={{ color: '#999' }}>{ys.peakMonth}</span></div>
                          <div><span style={{ color: '#999' }}>Months: </span><span style={{ color: '#666' }}>{ys.months}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', whiteSpace: 'nowrap' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #333' }}>
                          {[
                            { label: 'Year', align: 'left', borderRight: true },
                            { label: 'Avg Accounts', align: 'right' },
                            { label: 'Peak Accounts', align: 'right' },
                            { label: 'Peak Month', align: 'right' },
                            { label: 'Full YoY', align: 'right' },
                            { label: 'Months', align: 'right' },
                            { label: 'Same Period', align: 'center', borderLeft: true },
                            { label: 'Period', align: 'center' },
                          ].map((col) => (
                            <th key={col.label} style={{ padding: '8px 16px', color: '#fff', fontWeight: '500', textAlign: col.align, borderRight: col.borderRight ? '1px solid #333' : 'none', borderLeft: col.borderLeft ? '1px solid #333' : 'none' }}>{col.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...hsYearlySummary].reverse().map(ys => (
                          <tr key={ys.year} style={{ borderBottom: '1px solid #1a1a1a' }}>
                            <td style={{ padding: '8px 16px', fontWeight: '700', color: yearColors[ys.year] || '#fff', borderRight: '1px solid #222' }}>{ys.year}</td>
                            <td style={{ padding: '8px 16px', textAlign: 'right', color: '#a855f7', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{ys.avg.toLocaleString()}</td>
                            <td style={{ padding: '8px 16px', textAlign: 'right', color: '#fff', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{ys.peak.toLocaleString()}</td>
                            <td style={{ padding: '8px 16px', textAlign: 'right', color: '#ccc' }}>{ys.peakMonth}</td>
                            <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: '600', fontVariantNumeric: 'tabular-nums', color: ys.yoyChange === null ? '#666' : ys.yoyChange > 0 ? '#4ade80' : ys.yoyChange < 0 ? '#ef4444' : '#eab308' }}>
                              {ys.yoyChange === null ? '-' : `${ys.yoyChange > 0 ? '+' : ''}${ys.yoyChange.toFixed(1)}%`}
                            </td>
                            <td style={{ padding: '8px 16px', textAlign: 'right', color: '#ccc', fontVariantNumeric: 'tabular-nums' }}>{ys.months}</td>
                            <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: '600', fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid #222', color: ys.samePeriodChange === null ? '#666' : ys.samePeriodChange > 0 ? '#4ade80' : ys.samePeriodChange < 0 ? '#ef4444' : '#eab308' }}>
                              {ys.samePeriodChange === null ? '-' : `${ys.samePeriodChange > 0 ? '+' : ''}${ys.samePeriodChange.toFixed(1)}%`}
                            </td>
                            <td style={{ padding: '8px 16px', textAlign: 'center', color: '#ccc' }}>{ys.samePeriodLabel || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              )}

              {/* Hiscores Trendlines */}
              <div style={{ background: '#111', borderRadius: '12px', padding: isMobile ? '12px' : '20px', border: '1px solid #1e1e1e' }}>
                <div style={{ position: 'relative', marginBottom: '8px', ...(isMobile ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' } : {}) }}>
                  <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', textAlign: 'center' }}>Total Ranked Accounts</h2>
                  {hiscoresTrendline.regression && (
                    <div style={{
                      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px',
                      padding: isMobile ? '3px 6px' : '6px 14px', display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '12px',
                      ...(isMobile ? {} : { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' })
                    }}>
                      <span style={{
                        fontSize: isMobile ? '10px' : '14px', fontWeight: '700',
                        color: hiscoresTrendline.regression.pctChange > 1 ? '#4ade80'
                          : hiscoresTrendline.regression.pctChange < -1 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {Math.round(hiscoresTrendline.regression.slope * 52) > 0 ? '+' : ''}{Math.round(hiscoresTrendline.regression.slope * 52).toLocaleString()}/yr
                      </span>
                      <span style={{
                        fontSize: isMobile ? '9px' : '12px', fontWeight: '600',
                        padding: isMobile ? '1px 5px' : '2px 8px', borderRadius: '4px',
                        background: hiscoresTrendline.regression.pctChange > 1 ? '#052e16'
                          : hiscoresTrendline.regression.pctChange < -1 ? '#450a0a'
                          : '#422006',
                        color: hiscoresTrendline.regression.pctChange > 1 ? '#4ade80'
                          : hiscoresTrendline.regression.pctChange < -1 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {hiscoresTrendline.regression.pctChange > 1 ? 'Growing'
                          : hiscoresTrendline.regression.pctChange < -1 ? 'Declining'
                          : 'Flat'}
                      </span>
                    </div>
                  )}
                </div>

                <div
                  ref={hiscoresChartRef}
                  style={{ position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleHiscoresHover}
                  onTouchMove={handleHiscoresHover}
                  onMouseLeave={() => setHiscoresHoveredIndex(-1)}
                  onTouchEnd={() => setHiscoresHoveredIndex(-1)}
                >
                  {hiscoresData.length > 1 && (
                    <svg viewBox={`0 0 ${VW} ${TL_VH}`} style={{ width: '100%', height: 'auto' }}>
                      {/* Y-axis grid */}
                      {(() => {
                        const ticks = computeYTicks(hiscoresMax)
                        return ticks.map((v, i) => {
                          const y = hiscoresYPos(v)
                          return (
                            <g key={i}>
                              <line x1={CL} y1={y} x2={CR} y2={y} stroke="#222" strokeWidth="1" />
                              <text x={CL - 8} y={y + 4} textAnchor="end" fill="#fff" fontSize="12">
                                {v.toLocaleString()}
                              </text>
                            </g>
                          )
                        })
                      })()}

                      {/* X-axis labels */}
                      {(() => {
                        const labels = []
                        const step = Math.max(1, Math.floor(hiscoresData.length / 8))
                        for (let i = 0; i < hiscoresData.length; i += step) {
                          const d = hiscoresData[i].timestamp
                          labels.push(
                            <text key={i} x={hiscoresXPos(i)} y={TL_CB + 20} textAnchor="middle" fill="#fff" fontSize="11">
                              {d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                            </text>
                          )
                        }
                        return labels
                      })()}

                      {/* Area fill */}
                      <path
                        d={`M ${CL},${TL_CB} ${hiscoresData.map((d, i) => `L ${hiscoresXPos(i)},${hiscoresYPos(d.total)}`).join(' ')} L ${hiscoresXPos(hiscoresData.length - 1)},${TL_CB} Z`}
                        fill="rgba(168, 85, 247, 0.15)"
                      />
                      {/* Data line */}
                      <path
                        d={`M ${hiscoresData.map((d, i) => `${hiscoresXPos(i)},${hiscoresYPos(d.total)}`).join(' L ')}`}
                        fill="none" stroke="rgba(168, 85, 247, 0.5)" strokeWidth="1.5"
                      />

                      {/* 90d MA */}
                      {hiscoresTrendline.movingAvg.length > 1 && (
                        <path
                          d={`M ${hiscoresTrendline.movingAvg.map(d => `${hiscoresXPos(d.index)},${hiscoresYPos(d.value)}`).join(' L ')}`}
                          fill="none" stroke="#a855f7" strokeWidth="2.5"
                        />
                      )}

                      {/* Regression line */}
                      {hiscoresTrendline.regression && (
                        <line
                          x1={CL} y1={hiscoresYPos(hiscoresTrendline.regression.startY)}
                          x2={CR} y2={hiscoresYPos(hiscoresTrendline.regression.endY)}
                          stroke="#ef4444" strokeWidth="2" strokeDasharray="8,6" opacity="0.8"
                        />
                      )}

                      {/* Hover line */}
                      {hiscoresHoveredIndex >= 0 && (
                        <g>
                          <line
                            x1={hiscoresXPos(hiscoresHoveredIndex)} y1={CT}
                            x2={hiscoresXPos(hiscoresHoveredIndex)} y2={TL_CB}
                            stroke="#fff" strokeWidth="1" opacity="0.3"
                          />
                          <circle
                            cx={hiscoresXPos(hiscoresHoveredIndex)}
                            cy={hiscoresYPos(hiscoresData[hiscoresHoveredIndex].total)}
                            r="4" fill="#a855f7" stroke="#fff" strokeWidth="2"
                          />
                        </g>
                      )}

                      {/* Legend */}
                      <g transform={`translate(${VW / 2 - 120}, ${TL_VH - 10})`}>
                        <line x1="0" y1="0" x2="20" y2="0" stroke="rgba(168, 85, 247, 0.5)" strokeWidth="1.5" />
                        <text x="25" y="4" fill="#fff" fontSize="11">Weekly</text>
                        <line x1="80" y1="0" x2="100" y2="0" stroke="#a855f7" strokeWidth="2.5" />
                        <text x="105" y="4" fill="#fff" fontSize="11">90d MA</text>
                        <line x1="150" y1="0" x2="170" y2="0" stroke="#ef4444" strokeWidth="2" strokeDasharray="4,3" />
                        <text x="175" y="4" fill="#fff" fontSize="11">Regression</text>
                      </g>
                    </svg>
                  )}

                  {/* Tooltip */}
                  {hiscoresHoveredIndex >= 0 && (() => {
                    const d = hiscoresData[hiscoresHoveredIndex]
                    const ma = hiscoresTrendline.movingAvg.find(m => m.index === hiscoresHoveredIndex)
                    const tooltipWidth = 200
                    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const left = (screenWidth - hiscoresMousePos.x) < tooltipWidth + 30
                      ? hiscoresMousePos.x - tooltipWidth - 15
                      : hiscoresMousePos.x + 15
                    return (
                      <div style={{
                        position: 'fixed', left, top: hiscoresMousePos.y - 60,
                        background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px',
                        padding: '10px 14px', zIndex: 1000, pointerEvents: 'none', minWidth: '180px'
                      }}>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
                          {d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '14px', color: '#a855f7', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '700' }}>Accounts:</span> {d.total.toLocaleString()}
                        </div>
                        {ma && (
                          <div style={{ fontSize: '13px', color: '#999' }}>
                            90d MA: {ma.value.toLocaleString()}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* 1-Year Hiscores */}
              {hs1yrData.length > 1 && (
              <div style={{ background: '#111', borderRadius: '12px', padding: isMobile ? '12px' : '20px', border: '1px solid #1e1e1e', marginTop: '16px' }}>
                <div style={{ position: 'relative', marginBottom: '8px', ...(isMobile ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' } : {}) }}>
                  <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', textAlign: 'center' }}>1-Year</h2>
                  {hs1yrTrendline.regression && (
                    <div style={{
                      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px',
                      padding: isMobile ? '3px 6px' : '6px 14px', display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '12px',
                      ...(isMobile ? {} : { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' })
                    }}>
                      <span style={{
                        fontSize: isMobile ? '10px' : '14px', fontWeight: '700',
                        color: hs1yrTrendline.regression.pctChange > 3 ? '#4ade80'
                          : hs1yrTrendline.regression.pctChange < -3 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {Math.round(hs1yrTrendline.regression.slope * 52) > 0 ? '+' : ''}{Math.round(hs1yrTrendline.regression.slope * 52).toLocaleString()}/yr
                      </span>
                      <span style={{
                        fontSize: isMobile ? '9px' : '12px', fontWeight: '600',
                        padding: isMobile ? '1px 5px' : '2px 8px', borderRadius: '4px',
                        background: hs1yrTrendline.regression.pctChange > 3 ? '#052e16'
                          : hs1yrTrendline.regression.pctChange < -3 ? '#450a0a'
                          : '#422006',
                        color: hs1yrTrendline.regression.pctChange > 3 ? '#4ade80'
                          : hs1yrTrendline.regression.pctChange < -3 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {hs1yrTrendline.regression.pctChange > 3 ? 'Growing'
                          : hs1yrTrendline.regression.pctChange < -3 ? 'Declining'
                          : 'Flat'}
                      </span>
                    </div>
                  )}
                </div>
                <div ref={hs1yrChartRef} style={{ position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleHs1yrHover} onTouchMove={handleHs1yrHover}
                  onMouseLeave={() => setHs1yrHoveredIndex(-1)} onTouchEnd={() => setHs1yrHoveredIndex(-1)}>
                  <svg viewBox={`0 0 ${VW} ${TL_VH}`} style={{ width: '100%', height: 'auto' }}>
                    {computeYTicks(hs1yrMax).map((v, i) => (
                      <g key={i}>
                        <line x1={CL} y1={hs1yrYPos(v)} x2={CR} y2={hs1yrYPos(v)} stroke="#222" strokeWidth="1" />
                        <text x={CL - 8} y={hs1yrYPos(v) + 4} textAnchor="end" fill="#fff" fontSize="12">
                          {v.toLocaleString()}
                        </text>
                      </g>
                    ))}
                    {(() => {
                      const labels = [], step = Math.max(1, Math.floor(hs1yrData.length / 12))
                      for (let i = 0; i < hs1yrData.length; i += step) {
                        labels.push(<text key={i} x={hs1yrXPos(i)} y={TL_CB + 20} textAnchor="middle" fill="#fff" fontSize="11">{hs1yrData[i].timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</text>)
                      }
                      return labels
                    })()}
                    <path d={`M ${CL},${TL_CB} ${hs1yrData.map((d, i) => `L ${hs1yrXPos(i)},${hs1yrYPos(d.total)}`).join(' ')} L ${hs1yrXPos(hs1yrData.length - 1)},${TL_CB} Z`} fill="rgba(168, 85, 247, 0.15)" />
                    <path d={`M ${hs1yrData.map((d, i) => `${hs1yrXPos(i)},${hs1yrYPos(d.total)}`).join(' L ')}`} fill="none" stroke="rgba(168, 85, 247, 0.5)" strokeWidth="1.5" />
                    {hs1yrTrendline.movingAvg.length > 1 && (
                      <path d={`M ${hs1yrTrendline.movingAvg.map(d => `${hs1yrXPos(d.index)},${hs1yrYPos(d.value)}`).join(' L ')}`} fill="none" stroke="#a855f7" strokeWidth="2.5" />
                    )}
                    {hs1yrTrendline.regression && (
                      <line x1={CL} y1={hs1yrYPos(hs1yrTrendline.regression.startY)} x2={CR} y2={hs1yrYPos(hs1yrTrendline.regression.endY)} stroke="#ef4444" strokeWidth="2" strokeDasharray="8,6" opacity="0.8" />
                    )}
                    {hs1yrHoveredIndex >= 0 && (
                      <g>
                        <line x1={hs1yrXPos(hs1yrHoveredIndex)} y1={CT} x2={hs1yrXPos(hs1yrHoveredIndex)} y2={TL_CB} stroke="#fff" strokeWidth="1" opacity="0.3" />
                        <circle cx={hs1yrXPos(hs1yrHoveredIndex)} cy={hs1yrYPos(hs1yrData[hs1yrHoveredIndex].total)} r="4" fill="#a855f7" stroke="#fff" strokeWidth="2" />
                      </g>
                    )}
                    <g transform={`translate(${VW / 2 - 120}, ${TL_VH - 10})`}>
                      <line x1="0" y1="0" x2="20" y2="0" stroke="rgba(168, 85, 247, 0.5)" strokeWidth="1.5" />
                      <text x="25" y="4" fill="#fff" fontSize="11">Weekly</text>
                      <line x1="80" y1="0" x2="100" y2="0" stroke="#a855f7" strokeWidth="2.5" />
                      <text x="105" y="4" fill="#fff" fontSize="11">90d MA</text>
                      <line x1="150" y1="0" x2="170" y2="0" stroke="#ef4444" strokeWidth="2" strokeDasharray="4,3" />
                      <text x="175" y="4" fill="#fff" fontSize="11">Regression</text>
                    </g>
                  </svg>
                  {hs1yrHoveredIndex >= 0 && (() => {
                    const d = hs1yrData[hs1yrHoveredIndex], ma = hs1yrTrendline.movingAvg.find(m => m.index === hs1yrHoveredIndex)
                    const tooltipWidth = 200, screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const left = (screenWidth - hs1yrMousePos.x) < tooltipWidth + 30 ? hs1yrMousePos.x - tooltipWidth - 15 : hs1yrMousePos.x + 15
                    return (
                      <div style={{ position: 'fixed', left, top: hs1yrMousePos.y - 60, background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '10px 14px', zIndex: 1000, pointerEvents: 'none', minWidth: '180px' }}>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>{d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        <div style={{ fontSize: '14px', color: '#a855f7', marginBottom: '2px' }}><span style={{ fontWeight: '700' }}>Accounts:</span> {d.total.toLocaleString()}</div>
                        {ma && <div style={{ fontSize: '13px', color: '#999' }}>90d MA: {ma.value.toLocaleString()}</div>}
                      </div>
                    )
                  })()}
                </div>
              </div>
              )}

              {/* 6-Month Hiscores */}
              {hs6moData.length > 1 && (
              <div style={{ background: '#111', borderRadius: '12px', padding: isMobile ? '12px' : '20px', border: '1px solid #1e1e1e', marginTop: '16px' }}>
                <div style={{ position: 'relative', marginBottom: '8px', ...(isMobile ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' } : {}) }}>
                  <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', textAlign: 'center' }}>6-Month</h2>
                  {hs6moTrendline.regression && (
                    <div style={{
                      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px',
                      padding: isMobile ? '3px 6px' : '6px 14px', display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '12px',
                      ...(isMobile ? {} : { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' })
                    }}>
                      <span style={{
                        fontSize: isMobile ? '10px' : '14px', fontWeight: '700',
                        color: hs6moTrendline.regression.pctChange > 5 ? '#4ade80'
                          : hs6moTrendline.regression.pctChange < -5 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {Math.round(hs6moTrendline.regression.slope * 4.33) > 0 ? '+' : ''}{Math.round(hs6moTrendline.regression.slope * 4.33).toLocaleString()}/mo
                      </span>
                      <span style={{
                        fontSize: isMobile ? '9px' : '12px', fontWeight: '600',
                        padding: isMobile ? '1px 5px' : '2px 8px', borderRadius: '4px',
                        background: hs6moTrendline.regression.pctChange > 5 ? '#052e16'
                          : hs6moTrendline.regression.pctChange < -5 ? '#450a0a'
                          : '#422006',
                        color: hs6moTrendline.regression.pctChange > 5 ? '#4ade80'
                          : hs6moTrendline.regression.pctChange < -5 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {hs6moTrendline.regression.pctChange > 5 ? 'Growing'
                          : hs6moTrendline.regression.pctChange < -5 ? 'Declining'
                          : 'Flat'}
                      </span>
                    </div>
                  )}
                </div>
                <div ref={hs6moChartRef} style={{ position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleHs6moHover} onTouchMove={handleHs6moHover}
                  onMouseLeave={() => setHs6moHoveredIndex(-1)} onTouchEnd={() => setHs6moHoveredIndex(-1)}>
                  <svg viewBox={`0 0 ${VW} ${TL_VH}`} style={{ width: '100%', height: 'auto' }}>
                    {computeYTicks(hs6moMax).map((v, i) => (
                      <g key={i}>
                        <line x1={CL} y1={hs6moYPos(v)} x2={CR} y2={hs6moYPos(v)} stroke="#222" strokeWidth="1" />
                        <text x={CL - 8} y={hs6moYPos(v) + 4} textAnchor="end" fill="#fff" fontSize="12">
                          {v.toLocaleString()}
                        </text>
                      </g>
                    ))}
                    {(() => {
                      const labels = [], step = Math.max(1, Math.floor(hs6moData.length / 10))
                      for (let i = 0; i < hs6moData.length; i += step) {
                        labels.push(<text key={i} x={hs6moXPos(i)} y={TL_CB + 20} textAnchor="middle" fill="#fff" fontSize="11">{hs6moData[i].timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</text>)
                      }
                      return labels
                    })()}
                    <path d={`M ${CL},${TL_CB} ${hs6moData.map((d, i) => `L ${hs6moXPos(i)},${hs6moYPos(d.total)}`).join(' ')} L ${hs6moXPos(hs6moData.length - 1)},${TL_CB} Z`} fill="rgba(168, 85, 247, 0.15)" />
                    <path d={`M ${hs6moData.map((d, i) => `${hs6moXPos(i)},${hs6moYPos(d.total)}`).join(' L ')}`} fill="none" stroke="rgba(168, 85, 247, 0.5)" strokeWidth="1.5" />
                    {hs6moTrendline.movingAvg.length > 1 && (
                      <path d={`M ${hs6moTrendline.movingAvg.map(d => `${hs6moXPos(d.index)},${hs6moYPos(d.value)}`).join(' L ')}`} fill="none" stroke="#a855f7" strokeWidth="2.5" />
                    )}
                    {hs6moTrendline.regression && (
                      <line x1={CL} y1={hs6moYPos(hs6moTrendline.regression.startY)} x2={CR} y2={hs6moYPos(hs6moTrendline.regression.endY)} stroke="#ef4444" strokeWidth="2" strokeDasharray="8,6" opacity="0.8" />
                    )}
                    {hs6moHoveredIndex >= 0 && (
                      <g>
                        <line x1={hs6moXPos(hs6moHoveredIndex)} y1={CT} x2={hs6moXPos(hs6moHoveredIndex)} y2={TL_CB} stroke="#fff" strokeWidth="1" opacity="0.3" />
                        <circle cx={hs6moXPos(hs6moHoveredIndex)} cy={hs6moYPos(hs6moData[hs6moHoveredIndex].total)} r="4" fill="#a855f7" stroke="#fff" strokeWidth="2" />
                      </g>
                    )}
                    <g transform={`translate(${VW / 2 - 120}, ${TL_VH - 10})`}>
                      <line x1="0" y1="0" x2="20" y2="0" stroke="rgba(168, 85, 247, 0.5)" strokeWidth="1.5" />
                      <text x="25" y="4" fill="#fff" fontSize="11">Weekly</text>
                      <line x1="80" y1="0" x2="100" y2="0" stroke="#a855f7" strokeWidth="2.5" />
                      <text x="105" y="4" fill="#fff" fontSize="11">30d MA</text>
                      <line x1="150" y1="0" x2="170" y2="0" stroke="#ef4444" strokeWidth="2" strokeDasharray="4,3" />
                      <text x="175" y="4" fill="#fff" fontSize="11">Regression</text>
                    </g>
                  </svg>
                  {hs6moHoveredIndex >= 0 && (() => {
                    const d = hs6moData[hs6moHoveredIndex], ma = hs6moTrendline.movingAvg.find(m => m.index === hs6moHoveredIndex)
                    const tooltipWidth = 200, screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const left = (screenWidth - hs6moMousePos.x) < tooltipWidth + 30 ? hs6moMousePos.x - tooltipWidth - 15 : hs6moMousePos.x + 15
                    return (
                      <div style={{ position: 'fixed', left, top: hs6moMousePos.y - 60, background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '10px 14px', zIndex: 1000, pointerEvents: 'none', minWidth: '180px' }}>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>{d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        <div style={{ fontSize: '14px', color: '#a855f7', marginBottom: '2px' }}><span style={{ fontWeight: '700' }}>Accounts:</span> {d.total.toLocaleString()}</div>
                        {ma && <div style={{ fontSize: '13px', color: '#999' }}>30d MA: {ma.value.toLocaleString()}</div>}
                      </div>
                    )
                  })()}
                </div>
              </div>
              )}

              {/* 3-Month Hiscores */}
              {hs3moData.length > 1 && (
              <div style={{ background: '#111', borderRadius: '12px', padding: isMobile ? '12px' : '20px', border: '1px solid #1e1e1e', marginTop: '16px' }}>
                <div style={{ position: 'relative', marginBottom: '8px', ...(isMobile ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' } : {}) }}>
                  <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', textAlign: 'center' }}>3-Month</h2>
                  {hs3moTrendline.regression && (
                    <div style={{
                      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px',
                      padding: isMobile ? '3px 6px' : '6px 14px', display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '12px',
                      ...(isMobile ? {} : { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' })
                    }}>
                      <span style={{
                        fontSize: isMobile ? '10px' : '14px', fontWeight: '700',
                        color: hs3moTrendline.regression.pctChange > 7 ? '#4ade80'
                          : hs3moTrendline.regression.pctChange < -7 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {Math.round(hs3moTrendline.regression.slope * 4.33) > 0 ? '+' : ''}{Math.round(hs3moTrendline.regression.slope * 4.33).toLocaleString()}/mo
                      </span>
                      <span style={{
                        fontSize: isMobile ? '9px' : '12px', fontWeight: '600',
                        padding: isMobile ? '1px 5px' : '2px 8px', borderRadius: '4px',
                        background: hs3moTrendline.regression.pctChange > 7 ? '#052e16'
                          : hs3moTrendline.regression.pctChange < -7 ? '#450a0a'
                          : '#422006',
                        color: hs3moTrendline.regression.pctChange > 7 ? '#4ade80'
                          : hs3moTrendline.regression.pctChange < -7 ? '#ef4444'
                          : '#eab308'
                      }}>
                        {hs3moTrendline.regression.pctChange > 7 ? 'Growing'
                          : hs3moTrendline.regression.pctChange < -7 ? 'Declining'
                          : 'Flat'}
                      </span>
                    </div>
                  )}
                </div>
                <div ref={hs3moChartRef} style={{ position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleHs3moHover} onTouchMove={handleHs3moHover}
                  onMouseLeave={() => setHs3moHoveredIndex(-1)} onTouchEnd={() => setHs3moHoveredIndex(-1)}>
                  <svg viewBox={`0 0 ${VW} ${TL_VH}`} style={{ width: '100%', height: 'auto' }}>
                    {computeYTicks(hs3moMax).map((v, i) => (
                      <g key={i}>
                        <line x1={CL} y1={hs3moYPos(v)} x2={CR} y2={hs3moYPos(v)} stroke="#222" strokeWidth="1" />
                        <text x={CL - 8} y={hs3moYPos(v) + 4} textAnchor="end" fill="#fff" fontSize="12">
                          {v.toLocaleString()}
                        </text>
                      </g>
                    ))}
                    {(() => {
                      const labels = [], step = Math.max(1, Math.floor(hs3moData.length / 6))
                      for (let i = 0; i < hs3moData.length; i += step) {
                        labels.push(<text key={i} x={hs3moXPos(i)} y={TL_CB + 20} textAnchor="middle" fill="#fff" fontSize="11">{hs3moData[i].timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</text>)
                      }
                      return labels
                    })()}
                    <path d={`M ${CL},${TL_CB} ${hs3moData.map((d, i) => `L ${hs3moXPos(i)},${hs3moYPos(d.total)}`).join(' ')} L ${hs3moXPos(hs3moData.length - 1)},${TL_CB} Z`} fill="rgba(168, 85, 247, 0.15)" />
                    <path d={`M ${hs3moData.map((d, i) => `${hs3moXPos(i)},${hs3moYPos(d.total)}`).join(' L ')}`} fill="none" stroke="rgba(168, 85, 247, 0.5)" strokeWidth="1.5" />
                    {hs3moTrendline.movingAvg.length > 1 && (
                      <path d={`M ${hs3moTrendline.movingAvg.map(d => `${hs3moXPos(d.index)},${hs3moYPos(d.value)}`).join(' L ')}`} fill="none" stroke="#a855f7" strokeWidth="2.5" />
                    )}
                    {hs3moTrendline.regression && (
                      <line x1={CL} y1={hs3moYPos(hs3moTrendline.regression.startY)} x2={CR} y2={hs3moYPos(hs3moTrendline.regression.endY)} stroke="#ef4444" strokeWidth="2" strokeDasharray="8,6" opacity="0.8" />
                    )}
                    {hs3moHoveredIndex >= 0 && (
                      <g>
                        <line x1={hs3moXPos(hs3moHoveredIndex)} y1={CT} x2={hs3moXPos(hs3moHoveredIndex)} y2={TL_CB} stroke="#fff" strokeWidth="1" opacity="0.3" />
                        <circle cx={hs3moXPos(hs3moHoveredIndex)} cy={hs3moYPos(hs3moData[hs3moHoveredIndex].total)} r="4" fill="#a855f7" stroke="#fff" strokeWidth="2" />
                      </g>
                    )}
                    <g transform={`translate(${VW / 2 - 120}, ${TL_VH - 10})`}>
                      <line x1="0" y1="0" x2="20" y2="0" stroke="rgba(168, 85, 247, 0.5)" strokeWidth="1.5" />
                      <text x="25" y="4" fill="#fff" fontSize="11">Weekly</text>
                      <line x1="80" y1="0" x2="100" y2="0" stroke="#a855f7" strokeWidth="2.5" />
                      <text x="105" y="4" fill="#fff" fontSize="11">14d MA</text>
                      <line x1="150" y1="0" x2="170" y2="0" stroke="#ef4444" strokeWidth="2" strokeDasharray="4,3" />
                      <text x="175" y="4" fill="#fff" fontSize="11">Regression</text>
                    </g>
                  </svg>
                  {hs3moHoveredIndex >= 0 && (() => {
                    const d = hs3moData[hs3moHoveredIndex], ma = hs3moTrendline.movingAvg.find(m => m.index === hs3moHoveredIndex)
                    const tooltipWidth = 200, screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const left = (screenWidth - hs3moMousePos.x) < tooltipWidth + 30 ? hs3moMousePos.x - tooltipWidth - 15 : hs3moMousePos.x + 15
                    return (
                      <div style={{ position: 'fixed', left, top: hs3moMousePos.y - 60, background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '10px 14px', zIndex: 1000, pointerEvents: 'none', minWidth: '180px' }}>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>{d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        <div style={{ fontSize: '14px', color: '#a855f7', marginBottom: '2px' }}><span style={{ fontWeight: '700' }}>Accounts:</span> {d.total.toLocaleString()}</div>
                        {ma && <div style={{ fontSize: '13px', color: '#999' }}>14d MA: {ma.value.toLocaleString()}</div>}
                      </div>
                    )
                  })()}
                </div>
              </div>
              )}

              {/* 1-Month Hiscores */}
              {hs1moData.length > 1 && (
              <div style={{ background: '#111', borderRadius: '12px', padding: isMobile ? '12px' : '20px', border: '1px solid #1e1e1e', marginTop: '16px' }}>
                <div style={{ position: 'relative', marginBottom: '8px', ...(isMobile ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' } : {}) }}>
                  <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', textAlign: 'center' }}>1-Month</h2>
                  {hs1moTrendline.regression && (() => {
                    const moPct = hs1moTrendline.regression.startY ? (hs1moTrendline.regression.slope * 4.33 / hs1moTrendline.regression.startY) * 100 : 0
                    return (
                    <div style={{
                      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px',
                      padding: isMobile ? '3px 6px' : '6px 14px', display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '12px',
                      ...(isMobile ? {} : { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' })
                    }}>
                      <span style={{
                        fontSize: isMobile ? '10px' : '14px', fontWeight: '700',
                        color: moPct > 10 ? '#4ade80' : moPct < -10 ? '#ef4444' : '#eab308'
                      }}>
                        {Math.round(hs1moTrendline.regression.slope * 4.33) > 0 ? '+' : ''}{Math.round(hs1moTrendline.regression.slope * 4.33).toLocaleString()}/mo
                      </span>
                      <span style={{
                        fontSize: isMobile ? '9px' : '12px', fontWeight: '600',
                        padding: isMobile ? '1px 5px' : '2px 8px', borderRadius: '4px',
                        background: moPct > 10 ? '#052e16' : moPct < -10 ? '#450a0a' : '#422006',
                        color: moPct > 10 ? '#4ade80' : moPct < -10 ? '#ef4444' : '#eab308'
                      }}>
                        {moPct > 10 ? 'Growing' : moPct < -10 ? 'Declining' : 'Flat'}
                      </span>
                    </div>
                    )
                  })()}
                </div>
                <div ref={hs1moChartRef} style={{ position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseMove={handleHs1moHover} onTouchMove={handleHs1moHover}
                  onMouseLeave={() => setHs1moHoveredIndex(-1)} onTouchEnd={() => setHs1moHoveredIndex(-1)}>
                  <svg viewBox={`0 0 ${VW} ${TL_VH}`} style={{ width: '100%', height: 'auto' }}>
                    {computeYTicks(hs1moMax).map((v, i) => (
                      <g key={i}>
                        <line x1={CL} y1={hs1moYPos(v)} x2={CR} y2={hs1moYPos(v)} stroke="#222" strokeWidth="1" />
                        <text x={CL - 8} y={hs1moYPos(v) + 4} textAnchor="end" fill="#fff" fontSize="12">
                          {v.toLocaleString()}
                        </text>
                      </g>
                    ))}
                    {(() => {
                      const labels = [], step = Math.max(1, Math.floor(hs1moData.length / 5))
                      for (let i = 0; i < hs1moData.length; i += step) {
                        labels.push(<text key={i} x={hs1moXPos(i)} y={TL_CB + 20} textAnchor="middle" fill="#fff" fontSize="11">{hs1moData[i].timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</text>)
                      }
                      return labels
                    })()}
                    <path d={`M ${CL},${TL_CB} ${hs1moData.map((d, i) => `L ${hs1moXPos(i)},${hs1moYPos(d.total)}`).join(' ')} L ${hs1moXPos(hs1moData.length - 1)},${TL_CB} Z`} fill="rgba(168, 85, 247, 0.15)" />
                    <path d={`M ${hs1moData.map((d, i) => `${hs1moXPos(i)},${hs1moYPos(d.total)}`).join(' L ')}`} fill="none" stroke="rgba(168, 85, 247, 0.5)" strokeWidth="1.5" />
                    {hs1moTrendline.movingAvg.length > 1 && (
                      <path d={`M ${hs1moTrendline.movingAvg.map(d => `${hs1moXPos(d.index)},${hs1moYPos(d.value)}`).join(' L ')}`} fill="none" stroke="#a855f7" strokeWidth="2.5" />
                    )}
                    {hs1moTrendline.regression && (
                      <line x1={CL} y1={hs1moYPos(hs1moTrendline.regression.startY)} x2={CR} y2={hs1moYPos(hs1moTrendline.regression.endY)} stroke="#ef4444" strokeWidth="2" strokeDasharray="8,6" opacity="0.8" />
                    )}
                    {hs1moHoveredIndex >= 0 && (
                      <g>
                        <line x1={hs1moXPos(hs1moHoveredIndex)} y1={CT} x2={hs1moXPos(hs1moHoveredIndex)} y2={TL_CB} stroke="#fff" strokeWidth="1" opacity="0.3" />
                        <circle cx={hs1moXPos(hs1moHoveredIndex)} cy={hs1moYPos(hs1moData[hs1moHoveredIndex].total)} r="4" fill="#a855f7" stroke="#fff" strokeWidth="2" />
                      </g>
                    )}
                    <g transform={`translate(${VW / 2 - 120}, ${TL_VH - 10})`}>
                      <line x1="0" y1="0" x2="20" y2="0" stroke="rgba(168, 85, 247, 0.5)" strokeWidth="1.5" />
                      <text x="25" y="4" fill="#fff" fontSize="11">Weekly</text>
                      <line x1="80" y1="0" x2="100" y2="0" stroke="#a855f7" strokeWidth="2.5" />
                      <text x="105" y="4" fill="#fff" fontSize="11">7d MA</text>
                      <line x1="150" y1="0" x2="170" y2="0" stroke="#ef4444" strokeWidth="2" strokeDasharray="4,3" />
                      <text x="175" y="4" fill="#fff" fontSize="11">Regression</text>
                    </g>
                  </svg>
                  {hs1moHoveredIndex >= 0 && (() => {
                    const d = hs1moData[hs1moHoveredIndex], ma = hs1moTrendline.movingAvg.find(m => m.index === hs1moHoveredIndex)
                    const tooltipWidth = 200, screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
                    const left = (screenWidth - hs1moMousePos.x) < tooltipWidth + 30 ? hs1moMousePos.x - tooltipWidth - 15 : hs1moMousePos.x + 15
                    return (
                      <div style={{ position: 'fixed', left, top: hs1moMousePos.y - 60, background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '10px 14px', zIndex: 1000, pointerEvents: 'none', minWidth: '180px' }}>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>{d.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        <div style={{ fontSize: '14px', color: '#a855f7', marginBottom: '2px' }}><span style={{ fontWeight: '700' }}>Accounts:</span> {d.total.toLocaleString()}</div>
                        {ma && <div style={{ fontSize: '13px', color: '#999' }}>7d MA: {ma.value.toLocaleString()}</div>}
                      </div>
                    )
                  })()}
                </div>
              </div>
              )}

            </div>
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
