'use client'
import { useState, useEffect } from 'react'
import USMap from './USMap'

export default function FBICrime() {
  const [stateData, setStateData] = useState([])
  const [metadata, setMetadata] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedYear, setSelectedYear] = useState(null)
  const [selectedMetric, setSelectedMetric] = useState('off_murder')
  const [isMobile, setIsMobile] = useState(false)

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
      const [metaRes, stateRes] = await Promise.all([
        fetch('/api/fbi-crime?level=metadata'),
        fetch('/api/fbi-crime?level=state')
      ])
      const [metaJson, stateJson] = await Promise.all([
        metaRes.json(),
        stateRes.json()
      ])
      setMetadata(metaJson)
      setStateData(stateJson.rows || [])
      if (metaJson.years && metaJson.years.length > 0) {
        setSelectedYear(Math.max(...metaJson.years))
      }
      setLoading(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const getYears = () => {
    return metadata?.years?.sort((a, b) => b - a) || []
  }

  const metrics = [
    { id: 'off_murder', label: 'Murder' },
    { id: 'off_rape', label: 'Rape' },
    { id: 'off_robbery', label: 'Robbery' },
    { id: 'off_agg_assault', label: 'Aggravated Assault' },
    { id: 'off_burglary', label: 'Burglary' },
    { id: 'off_motor_vehicle_theft', label: 'Vehicle Theft' },
    { id: 'off_drug_violations', label: 'Drug Violations' },
    { id: 'off_weapon_violations', label: 'Weapon Violations' }
  ]

  const selectedMetricInfo = metrics.find(m => m.id === selectedMetric)

  // Get state rankings for selected year
  const getStateRankings = () => {
    return stateData
      .filter(d => d.year === selectedYear)
      .map(d => ({
        ...d,
        rate: d.pop > 0 ? (d[selectedMetric] / d.pop) * 100000 : 0
      }))
      .sort((a, b) => b.rate - a.rate)
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
          {/* Year selector */}
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

          {/* Crime Type */}
          <div style={{ marginBottom: isMobile ? '12px' : '16px' }}>
            {!isMobile && <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Offense Type</div>}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '4px', flexWrap: 'wrap' }}>
              {metrics.map(metric => (
                <button
                  key={metric.id}
                  onClick={() => setSelectedMetric(metric.id)}
                  style={{
                    background: selectedMetric === metric.id ? '#1a1a1a' : 'transparent',
                    border: selectedMetric === metric.id ? '1px solid #333' : '1px solid transparent',
                    color: selectedMetric === metric.id ? '#ef4444' : '#888',
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

          {!isMobile && <div style={{ fontSize: '11px', color: '#666', marginTop: '24px' }}>Source: FBI NIBRS</div>}
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: isMobile ? '16px' : '24px 20px' }}>
          <h1 style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '600', letterSpacing: '-1px', color: '#fff', margin: '0 0 8px 0' }}>FBI Crime Statistics</h1>
          <p style={{ fontSize: isMobile ? '14px' : '16px', color: '#666', margin: isMobile ? '0 0 16px 0' : '0 0 32px 0' }}>
            {selectedMetricInfo?.label} by state ({selectedYear}) - per 100K population
          </p>

          {loading ? (
            <div style={{ color: '#fff', padding: '40px', textAlign: 'center' }}>Loading...</div>
          ) : error ? (
            <div style={{ color: '#ff4444', padding: '40px', textAlign: 'center' }}>Error: {error}</div>
          ) : (
            <>
              {/* US Map */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
                <USMap
                  data={stateData}
                  metric={selectedMetric}
                  year={selectedYear}
                />
              </div>

              {/* State Rankings Table */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '12px' : '20px', overflowX: 'auto' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#fff', margin: '0 0 16px 0' }}>
                  State Rankings - {selectedMetricInfo?.label} ({selectedYear})
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #333' }}>
                      <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>Rank</th>
                      <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>State</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: '#888' }}>Population</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: '#ef4444' }}>{selectedMetricInfo?.label}</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: '#888' }}>Per 100K</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getStateRankings().map((row, i) => (
                      <tr key={row.state} style={{ borderBottom: '1px solid #222' }}>
                        <td style={{ padding: '8px', color: '#888' }}>{i + 1}</td>
                        <td style={{ padding: '8px', color: '#fff', fontWeight: '500' }}>{row.state}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#888' }}>{formatNumber(row.pop)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#ef4444', fontWeight: '600' }}>
                          {row[selectedMetric]?.toLocaleString()}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#888' }}>{formatRate(row.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
