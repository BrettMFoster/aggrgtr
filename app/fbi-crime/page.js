'use client'
import { useState, useEffect, useRef } from 'react'

export default function FBICrime() {
  const [nationalData, setNationalData] = useState([])
  const [stateData, setStateData] = useState([])
  const [countyData, setCountyData] = useState([])
  const [metadata, setMetadata] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [viewLevel, setViewLevel] = useState('national')
  const [selectedState, setSelectedState] = useState(null)
  const [selectedYear, setSelectedYear] = useState(null)
  const [selectedMetric, setSelectedMetric] = useState('violent')
  const [showPerCapita, setShowPerCapita] = useState(false)
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const [hoveredIndex, setHoveredIndex] = useState(-1)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [isMobile, setIsMobile] = useState(false)
  const chartRef = useRef(null)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [metaRes, nationalRes, stateRes, countyRes] = await Promise.all([
        fetch('/api/fbi-crime?level=metadata'),
        fetch('/api/fbi-crime?level=national'),
        fetch('/api/fbi-crime?level=state'),
        fetch('/api/fbi-crime?level=county')
      ])
      const [metaJson, nationalJson, stateJson, countyJson] = await Promise.all([
        metaRes.json(),
        nationalRes.json(),
        stateRes.json(),
        countyRes.json()
      ])
      setMetadata(metaJson)
      setNationalData(nationalJson.rows || [])
      setStateData(stateJson.rows || [])
      setCountyData(countyJson.rows || [])
      // Set default year to latest
      const years = (nationalJson.rows || []).map(r => r.year)
      if (years.length > 0) setSelectedYear(Math.max(...years))
      setLoading(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const getStates = () => {
    const states = new Set()
    for (const row of stateData) {
      if (row.state) states.add(row.state)
    }
    return Array.from(states).sort()
  }

  const getYears = () => {
    return nationalData.map(r => r.year).sort((a, b) => b - a)
  }

  // Get data for chart based on view level
  const getChartData = () => {
    if (viewLevel === 'national') {
      return nationalData.sort((a, b) => a.year - b.year)
    } else if (viewLevel === 'state' && selectedState) {
      return stateData
        .filter(d => d.state === selectedState)
        .sort((a, b) => a.year - b.year)
    }
    return []
  }

  // Get value with optional per capita calculation
  const getValue = (row, metric) => {
    const raw = row[metric] || 0
    if (showPerCapita && row.pop > 0) {
      return (raw / row.pop) * 100000
    }
    return raw
  }

  const chartData = getChartData()
  const latestYear = chartData.length > 0 ? chartData[chartData.length - 1] : null

  // For national view, get latest year summary
  const latestNational = nationalData.find(d => d.year === selectedYear) || nationalData[nationalData.length - 1]

  // Get max value for Y-axis
  const getMaxValue = () => {
    if (chartData.length === 0) return 1
    return Math.max(...chartData.map(d => getValue(d, selectedMetric)), 1)
  }

  const maxValue = getMaxValue()

  const metrics = [
    { id: 'violent', label: 'Violent Crime', color: '#ef4444' },
    { id: 'property', label: 'Property Crime', color: '#f59e0b' },
    { id: 'homicide', label: 'Homicide', color: '#dc2626' },
    { id: 'assault', label: 'Assault', color: '#f97316' },
    { id: 'robbery', label: 'Robbery', color: '#eab308' },
    { id: 'burglary', label: 'Burglary', color: '#84cc16' },
    { id: 'theft', label: 'Theft', color: '#22c55e' },
    { id: 'drug', label: 'Drug Offenses', color: '#8b5cf6' }
  ]

  const selectedMetricInfo = metrics.find(m => m.id === selectedMetric)

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

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(0) + 'K'
    return typeof num === 'number' ? num.toLocaleString() : num
  }

  const formatRate = (num) => {
    if (typeof num !== 'number') return '0'
    return num.toFixed(1)
  }

  // Get counties for selected state and year
  const getCounties = () => {
    if (!selectedState || !selectedYear) return []
    return countyData
      .filter(d => d.state === selectedState && d.year === selectedYear)
      .map(d => ({
        ...d,
        rate: d.pop > 0 ? (d[selectedMetric] / d.pop) * 100000 : 0
      }))
      .sort((a, b) => b[selectedMetric] - a[selectedMetric])
      .slice(0, 20)
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
          {/* View Level */}
          <div style={{ marginBottom: isMobile ? '12px' : '24px' }}>
            {!isMobile && <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>View</div>}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: isMobile ? '8px' : '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'national', label: 'National Trend' },
                { id: 'state', label: 'Single State' }
              ].map(v => (
                <button
                  key={v.id}
                  onClick={() => { setViewLevel(v.id); if (v.id !== 'state') setSelectedState(null); }}
                  style={{
                    background: viewLevel === v.id ? '#222' : 'transparent',
                    border: viewLevel === v.id ? 'none' : '1px solid #333',
                    color: '#fff',
                    padding: isMobile ? '8px 12px' : '6px 8px',
                    borderRadius: '4px',
                    fontSize: isMobile ? '13px' : '14px',
                    cursor: 'pointer',
                    fontWeight: viewLevel === v.id ? '600' : '400'
                  }}
                >{v.label}</button>
              ))}
            </div>
          </div>

          {/* Year selector for state view */}
          {viewLevel === 'state' && (
            <div style={{ marginBottom: isMobile ? '12px' : '24px' }}>
              {!isMobile && <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Year</div>}
              <select
                value={selectedYear || ''}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  color: '#fff',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                {getYears().map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          )}

          {/* State selector */}
          {viewLevel === 'state' && (
            <div style={{ marginBottom: isMobile ? '12px' : '24px' }}>
              {!isMobile && <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>State</div>}
              <select
                value={selectedState || ''}
                onChange={(e) => setSelectedState(e.target.value)}
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  color: '#fff',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                <option value="">Select a state...</option>
                {getStates().map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>
          )}

          {/* Crime Type */}
          <div style={{ marginBottom: isMobile ? '12px' : '16px' }}>
            {!isMobile && <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Crime Type</div>}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '4px', flexWrap: 'wrap' }}>
              {metrics.map(metric => (
                <button
                  key={metric.id}
                  onClick={() => setSelectedMetric(metric.id)}
                  style={{
                    background: selectedMetric === metric.id ? '#1a1a1a' : 'transparent',
                    border: selectedMetric === metric.id ? '1px solid #333' : '1px solid transparent',
                    color: selectedMetric === metric.id ? metric.color : '#888',
                    padding: isMobile ? '8px 12px' : '8px 10px',
                    borderRadius: '6px',
                    fontSize: isMobile ? '13px' : '14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontWeight: selectedMetric === metric.id ? '500' : '400'
                  }}
                >
                  {metric.label}
                </button>
              ))}
            </div>
          </div>

          {/* Per Capita Toggle */}
          <div style={{ marginBottom: isMobile ? '0' : '16px' }}>
            <button
              onClick={() => setShowPerCapita(!showPerCapita)}
              style={{
                background: showPerCapita ? '#1a1a1a' : 'transparent',
                border: '1px solid #333',
                color: showPerCapita ? '#4ade80' : '#888',
                padding: '8px 10px',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: 'pointer',
                width: isMobile ? 'auto' : '100%',
                textAlign: 'left'
              }}
            >
              {showPerCapita ? '✓ ' : ''}Per 100K Pop
            </button>
          </div>

          {!isMobile && <div style={{ fontSize: '11px', color: '#666', marginTop: '24px' }}>Source: FBI NIBRS</div>}
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: isMobile ? '16px' : '24px 20px' }}>
          <h1 style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '600', letterSpacing: '-1px', color: '#fff', margin: '0 0 8px 0' }}>FBI Crime Statistics</h1>
          <p style={{ fontSize: isMobile ? '14px' : '16px', color: '#666', margin: isMobile ? '0 0 16px 0' : '0 0 32px 0' }}>
            {viewLevel === 'national' && 'National crime trends over time'}
            {viewLevel === 'state' && (selectedState ? `${selectedState} crime data` : 'Select a state to view data')}
          </p>

          {loading ? (
            <div style={{ color: '#fff', padding: '40px', textAlign: 'center' }}>Loading...</div>
          ) : error ? (
            <div style={{ color: '#ff4444', padding: '40px', textAlign: 'center' }}>Error: {error}</div>
          ) : (
            <>
              {/* KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: isMobile ? '12px' : '16px', marginBottom: isMobile ? '16px' : '40px' }}>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '16px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: '600', color: '#fff', marginBottom: '8px' }}>Violent Crime</div>
                  <div style={{ fontSize: isMobile ? '24px' : '32px', fontWeight: '700', color: '#ef4444' }}>
                    {showPerCapita ? formatRate(getValue(latestNational, 'violent')) : formatNumber(latestNational?.violent || 0)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>{showPerCapita ? 'per 100K' : selectedYear || latestNational?.year}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '16px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: '600', color: '#fff', marginBottom: '8px' }}>Property Crime</div>
                  <div style={{ fontSize: isMobile ? '24px' : '32px', fontWeight: '700', color: '#f59e0b' }}>
                    {showPerCapita ? formatRate(getValue(latestNational, 'property')) : formatNumber(latestNational?.property || 0)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>{showPerCapita ? 'per 100K' : selectedYear || latestNational?.year}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '16px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: '600', color: '#fff', marginBottom: '8px' }}>Total Offenses</div>
                  <div style={{ fontSize: isMobile ? '24px' : '32px', fontWeight: '700', color: '#fff' }}>{formatNumber(latestNational?.total || 0)}</div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>{selectedYear || latestNational?.year}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '16px' : '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: '600', color: '#fff', marginBottom: '8px' }}>Agencies Reporting</div>
                  <div style={{ fontSize: isMobile ? '24px' : '32px', fontWeight: '700', color: '#4ade80' }}>{formatNumber(latestNational?.agencies || 0)}</div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>{selectedYear || latestNational?.year}</div>
                </div>
              </div>

              {/* Chart - only show for national and single state views */}
              {(viewLevel === 'national' || (viewLevel === 'state' && selectedState)) && chartData.length > 0 && (
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '28px', marginBottom: isMobile ? '16px' : '40px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '12px' : '20px', flexWrap: 'wrap', gap: '12px' }}>
                    <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: 0 }}>
                      {selectedMetricInfo?.label} {showPerCapita ? '(per 100K)' : ''} - {viewLevel === 'national' ? 'National' : selectedState}
                    </h2>
                    <div style={{ fontSize: isMobile ? '12px' : '14px', color: selectedMetricInfo?.color }}>
                      {selectedMetricInfo?.label}
                    </div>
                  </div>

                  <div
                    ref={chartRef}
                    style={{ height: isMobile ? '280px' : '350px', position: 'relative', cursor: 'crosshair', touchAction: 'none' }}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => { setHoveredPoint(null); setHoveredIndex(-1); }}
                    onTouchMove={handleTouchMove}
                    onTouchStart={(e) => { if (e.touches && e.touches[0]) handleInteraction(e.touches[0].clientX, e.touches[0].clientY); }}
                    onTouchEnd={() => { setHoveredPoint(null); setHoveredIndex(-1); }}
                  >
                    <svg width="100%" height="100%" viewBox="0 0 900 300" preserveAspectRatio="none">
                      {/* Y-axis grid and labels */}
                      {[0, 0.25, 0.5, 0.75, 1].map(pct => (
                        <g key={pct}>
                          <line x1="60" y1={260 - pct * 220} x2="880" y2={260 - pct * 220} stroke="#333" strokeWidth="1" />
                          <text x="55" y={265 - pct * 220} fill="#ffffff" fontSize="12" textAnchor="end">
                            {showPerCapita ? formatRate(maxValue * pct) : formatNumber(Math.round(maxValue * pct))}
                          </text>
                        </g>
                      ))}

                      {/* X-axis labels (years) */}
                      {chartData.map((d, i) => (
                        <text
                          key={i}
                          x={60 + (i / (chartData.length - 1 || 1)) * 820}
                          y={285}
                          fill="#ffffff"
                          fontSize="12"
                          textAnchor="middle"
                        >
                          {d.year}
                        </text>
                      ))}

                      {/* Bar chart */}
                      {chartData.map((d, i) => {
                        const barWidth = Math.max(20, 820 / chartData.length - 10)
                        const x = 60 + (i / (chartData.length - 1 || 1)) * 820 - barWidth / 2
                        const value = getValue(d, selectedMetric)
                        const height = (value / maxValue) * 220
                        return (
                          <rect
                            key={i}
                            x={x}
                            y={260 - height}
                            width={barWidth}
                            height={height}
                            fill={hoveredIndex === i ? selectedMetricInfo?.color : `${selectedMetricInfo?.color}99`}
                            rx="2"
                          />
                        )
                      })}

                      {/* Hover indicator line */}
                      {hoveredPoint && hoveredIndex >= 0 && (
                        <line
                          x1={60 + (hoveredIndex / (chartData.length - 1 || 1)) * 820}
                          y1={40}
                          x2={60 + (hoveredIndex / (chartData.length - 1 || 1)) * 820}
                          y2={260}
                          stroke="#fff"
                          strokeWidth="1"
                          strokeDasharray="4"
                        />
                      )}
                    </svg>

                    {/* Tooltip */}
                    {hoveredPoint && (() => {
                      const tooltipWidth = 200
                      const tooltipHeight = 200
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
                          minWidth: '180px'
                        }}>
                          <div style={{ fontSize: '14px', color: '#fff', marginBottom: '8px', fontWeight: '600', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
                            {hoveredPoint.year}
                          </div>
                          <div style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>
                            Population: {formatNumber(hoveredPoint.pop)}
                          </div>
                          <div style={{ fontSize: '13px', color: '#888', marginBottom: '8px' }}>
                            Agencies: {hoveredPoint.agencies?.toLocaleString()}
                          </div>
                          {metrics.slice(0, 4).map(m => (
                            <div key={m.id} style={{ fontSize: '13px', color: m.id === selectedMetric ? m.color : '#666', marginBottom: '4px' }}>
                              {m.label}: {showPerCapita ? formatRate(getValue(hoveredPoint, m.id)) : (hoveredPoint[m.id] || 0).toLocaleString()}
                              {showPerCapita && <span style={{ color: '#555' }}> /100K</span>}
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* County breakdown - for single state view */}
              {viewLevel === 'state' && selectedState && (
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '20px', marginBottom: '24px', overflowX: 'auto' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#fff', margin: '0 0 16px 0' }}>
                    Top Counties in {selectedState} - {selectedMetricInfo?.label} ({selectedYear})
                  </h3>
                  {getCounties().length === 0 ? (
                    <div style={{ color: '#888', padding: '20px', textAlign: 'center' }}>No county data available</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #333' }}>
                          <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>County</th>
                          <th style={{ padding: '8px', textAlign: 'right', color: '#888' }}>Agencies</th>
                          <th style={{ padding: '8px', textAlign: 'right', color: '#888' }}>Population</th>
                          <th style={{ padding: '8px', textAlign: 'right', color: selectedMetricInfo?.color }}>{selectedMetricInfo?.label}</th>
                          <th style={{ padding: '8px', textAlign: 'right', color: '#888' }}>Per 100K</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getCounties().map((row, i) => (
                          <tr key={row.county} style={{ borderBottom: '1px solid #222' }}>
                            <td style={{ padding: '8px', color: '#fff' }}>{row.county || 'Unknown'}</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#888' }}>{row.agencies}</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#888' }}>{formatNumber(row.pop)}</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: selectedMetricInfo?.color, fontWeight: '600' }}>
                              {row[selectedMetric]?.toLocaleString()}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#888' }}>{formatRate(row.rate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* National data table - for national view */}
              {viewLevel === 'national' && (
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '20px', overflowX: 'auto' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#fff', margin: '0 0 16px 0' }}>National Yearly Data</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #333' }}>
                        <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>Year</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: '#888' }}>States</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: '#888' }}>Agencies</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: '#888' }}>Population</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: '#ef4444' }}>Violent</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: '#f59e0b' }}>Property</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: '#8b5cf6' }}>Drug</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #222' }}>
                          <td style={{ padding: '8px', color: '#fff', fontWeight: '500' }}>{row.year}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#888' }}>{row.states}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#888' }}>{row.agencies?.toLocaleString()}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#888' }}>{formatNumber(row.pop)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#ef4444' }}>
                            {showPerCapita ? formatRate(getValue(row, 'violent')) : row.violent?.toLocaleString()}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#f59e0b' }}>
                            {showPerCapita ? formatRate(getValue(row, 'property')) : row.property?.toLocaleString()}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#8b5cf6' }}>
                            {showPerCapita ? formatRate(getValue(row, 'drug')) : row.drug?.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <footer style={{ borderTop: '1px solid #222', padding: '24px 32px', fontSize: '12px', color: '#666', textAlign: 'right' }}>
        aggrgtr 2025 | Data: FBI NIBRS {metadata?.min_year}-{metadata?.max_year}
      </footer>
    </div>
  )
}
