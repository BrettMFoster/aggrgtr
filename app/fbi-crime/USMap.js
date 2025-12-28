'use client'
import { useState, useMemo, useCallback, useEffect } from 'react'

const STATE_NAMES = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'DC': 'District of Columbia', 'FL': 'Florida',
  'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana',
  'IA': 'Iowa', 'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine',
  'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire',
  'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota',
  'OH': 'Ohio', 'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island',
  'SC': 'South Carolina', 'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
  'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin',
  'WY': 'Wyoming', 'PR': 'Puerto Rico'
}

// Map data abbreviations to standard USPS codes
const ABBR_FIXES = {
  'NB': 'NE',  // Nebraska sometimes coded as NB
}

export default function USMap({ data, metric, year, onStateClick, selectedState }) {
  const [hoveredState, setHoveredState] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [statePaths, setStatePaths] = useState({})
  const [loading, setLoading] = useState(true)
  const [viewBox, setViewBox] = useState("0 0 1000 600")

  // Fetch SVG map from @svg-maps/usa
  useEffect(() => {
    fetch('https://unpkg.com/@svg-maps/usa/usa.svg')
      .then(res => res.text())
      .then(svgText => {
        // Parse SVG to extract paths
        const parser = new DOMParser()
        const doc = parser.parseFromString(svgText, 'image/svg+xml')
        const svg = doc.querySelector('svg')
        const paths = doc.querySelectorAll('path')

        // Get viewBox
        if (svg && svg.getAttribute('viewBox')) {
          setViewBox(svg.getAttribute('viewBox'))
        }

        const pathData = {}
        paths.forEach(path => {
          const id = path.getAttribute('id')
          const d = path.getAttribute('d')
          if (id && d) {
            const abbr = id.toUpperCase()
            pathData[abbr] = {
              path: d,
              name: STATE_NAMES[abbr] || abbr,
              abbr
            }
          }
        })

        setStatePaths(pathData)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load US map:', err)
        setLoading(false)
      })
  }, [])

  // Memoize state data lookup - only recalculate when data/year changes
  const stateDataMap = useMemo(() => {
    const map = {}
    if (data && Array.isArray(data)) {
      for (const row of data) {
        if (row.year === year) {
          // Fix any abbreviation mismatches
          const abbr = ABBR_FIXES[row.state] || row.state
          map[abbr] = row
        }
      }
    }
    return map
  }, [data, year])

  // Memoize color scale calculations using percentiles to handle outliers
  const { minVal, maxVal } = useMemo(() => {
    const values = Object.values(stateDataMap).map(d => {
      if (!d || !d.pop || d.pop === 0) return 0
      return (d[metric] || 0) / d.pop * 100000
    }).filter(v => v > 0).sort((a, b) => a - b)

    if (values.length === 0) return { minVal: 0, maxVal: 1 }

    // Use 5th and 95th percentile to avoid outlier skewing
    const p5 = values[Math.floor(values.length * 0.05)] || values[0]
    const p95 = values[Math.floor(values.length * 0.95)] || values[values.length - 1]

    return { minVal: p5, maxVal: p95 }
  }, [stateDataMap, metric])

  // Memoize color map for all states
  const stateColors = useMemo(() => {
    const colors = {}
    for (const abbr in statePaths) {
      const d = stateDataMap[abbr]
      if (!d || !d.pop || d.pop === 0) {
        colors[abbr] = '#1a1a1a'
      } else {
        const rate = (d[metric] || 0) / d.pop * 100000
        // Clamp to 0-1 range (outliers beyond percentiles get capped)
        const pct = Math.max(0, Math.min(1, maxVal > minVal ? (rate - minVal) / (maxVal - minVal) : 0))
        if (pct < 0.25) {
          const t = pct / 0.25
          colors[abbr] = `rgb(${Math.round(60 + t * 80)}, ${Math.round(20 + t * 10)}, ${Math.round(90 - t * 30)})`
        } else if (pct < 0.5) {
          const t = (pct - 0.25) / 0.25
          colors[abbr] = `rgb(${Math.round(140 + t * 80)}, ${Math.round(30 + t * 30)}, ${Math.round(60 - t * 30)})`
        } else if (pct < 0.75) {
          const t = (pct - 0.5) / 0.25
          colors[abbr] = `rgb(${Math.round(220 + t * 35)}, ${Math.round(60 + t * 80)}, ${Math.round(30 - t * 10)})`
        } else {
          const t = (pct - 0.75) / 0.25
          colors[abbr] = `rgb(255, ${Math.round(140 + t * 80)}, ${Math.round(20 + t * 40)})`
        }
      }
    }
    return colors
  }, [statePaths, stateDataMap, metric, minVal, maxVal])

  const formatRate = useCallback((num) => typeof num === 'number' ? num.toFixed(1) : '0', [])

  const handleMouseMove = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }, [])

  if (loading) {
    return (
      <div style={{ width: '100%', height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
        Loading map...
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }} onMouseMove={handleMouseMove}>
      <svg
        viewBox={viewBox}
        style={{ width: '100%', height: 'auto', maxHeight: '500px' }}
      >
        {/* Draw each state */}
        {Object.entries(statePaths).map(([abbr, state]) => {
          const isHovered = hoveredState === abbr
          const isSelected = selectedState === abbr

          return (
            <path
              key={abbr}
              d={state.path}
              fill={stateColors[abbr] || '#1a1a1a'}
              stroke={isSelected ? '#fff' : isHovered ? '#888' : '#333'}
              strokeWidth={isSelected ? 2 : isHovered ? 1.5 : 0.5}
              style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
              onMouseEnter={() => setHoveredState(abbr)}
              onMouseLeave={() => setHoveredState(null)}
              onClick={() => onStateClick && onStateClick(abbr)}
            />
          )
        })}
      </svg>

      {/* Legend */}
      <div style={{
        position: 'absolute',
        bottom: '10px',
        right: '10px',
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '4px',
        padding: '8px 12px',
        fontSize: '11px'
      }}>
        <div style={{ color: '#888', marginBottom: '4px' }}>Per 100K Pop</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '60px', height: '8px', background: 'linear-gradient(to right, rgb(60,20,90), rgb(140,30,60), rgb(220,60,30), rgb(255,220,60))', borderRadius: '2px' }}></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
          <span style={{ color: '#666' }}>{formatRate(minVal)}</span>
          <span style={{ color: '#666' }}>{formatRate(maxVal)}</span>
        </div>
      </div>

      {/* Tooltip */}
      {hoveredState && stateDataMap[hoveredState] && (
        <div style={{
          position: 'fixed',
          left: mousePos.x + 15,
          top: mousePos.y - 60,
          background: '#1a1a1a',
          border: '1px solid #444',
          borderRadius: '6px',
          padding: '10px 14px',
          zIndex: 1000,
          pointerEvents: 'none',
          minWidth: '140px'
        }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '6px' }}>
            {statePaths[hoveredState]?.name}
          </div>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
            Pop: {(stateDataMap[hoveredState].pop || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '13px', color: '#ef4444' }}>
            {metric}: {(stateDataMap[hoveredState][metric] || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: '#888' }}>
            Rate: {formatRate((stateDataMap[hoveredState][metric] || 0) / (stateDataMap[hoveredState].pop || 1) * 100000)}/100K
          </div>
        </div>
      )}
    </div>
  )
}
