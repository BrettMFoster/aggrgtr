'use client'
import { useState, useMemo, useCallback } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'

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

// FIPS to abbreviation mapping
const FIPS_TO_ABBR = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY', '72': 'PR'
}

// Map data abbreviations to standard USPS codes
const ABBR_FIXES = {
  'NB': 'NE',
}

export default function USMap({ data, metric, year, onStateClick, selectedState }) {
  const [hoveredState, setHoveredState] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  // Memoize state data lookup
  const stateDataMap = useMemo(() => {
    const map = {}
    if (data && Array.isArray(data)) {
      for (const row of data) {
        if (row.year === year) {
          const abbr = ABBR_FIXES[row.state] || row.state
          map[abbr] = row
        }
      }
    }
    return map
  }, [data, year])

  // Memoize color scale using percentiles
  const { minVal, maxVal } = useMemo(() => {
    const values = Object.values(stateDataMap).map(d => {
      if (!d || !d.pop || d.pop === 0) return 0
      return (d[metric] || 0) / d.pop * 100000
    }).filter(v => v > 0).sort((a, b) => a - b)

    if (values.length === 0) return { minVal: 0, maxVal: 1 }

    const p5 = values[Math.floor(values.length * 0.05)] || values[0]
    const p95 = values[Math.floor(values.length * 0.95)] || values[values.length - 1]

    return { minVal: p5, maxVal: p95 }
  }, [stateDataMap, metric])

  // Get color for a state
  const getStateColor = useCallback((abbr) => {
    const d = stateDataMap[abbr]
    if (!d || !d.pop || d.pop === 0) {
      return '#1a1a1a'
    }
    const rate = (d[metric] || 0) / d.pop * 100000
    const pct = Math.max(0, Math.min(1, maxVal > minVal ? (rate - minVal) / (maxVal - minVal) : 0))

    if (pct < 0.25) {
      const t = pct / 0.25
      return `rgb(${Math.round(60 + t * 80)}, ${Math.round(20 + t * 10)}, ${Math.round(90 - t * 30)})`
    } else if (pct < 0.5) {
      const t = (pct - 0.25) / 0.25
      return `rgb(${Math.round(140 + t * 80)}, ${Math.round(30 + t * 30)}, ${Math.round(60 - t * 30)})`
    } else if (pct < 0.75) {
      const t = (pct - 0.5) / 0.25
      return `rgb(${Math.round(220 + t * 35)}, ${Math.round(60 + t * 80)}, ${Math.round(30 - t * 10)})`
    } else {
      const t = (pct - 0.75) / 0.25
      return `rgb(255, ${Math.round(140 + t * 80)}, ${Math.round(20 + t * 40)})`
    }
  }, [stateDataMap, metric, minVal, maxVal])

  const formatRate = useCallback((num) => typeof num === 'number' ? num.toFixed(1) : '0', [])

  const handleMouseMove = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }, [])

  return (
    <div style={{ position: 'relative' }} onMouseMove={handleMouseMove}>
      <ComposableMap
        projection="geoAlbersUsa"
        style={{ width: '100%', height: 'auto', maxHeight: '500px' }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const fips = String(geo.id).padStart(2, '0')
              const abbr = FIPS_TO_ABBR[fips]
              const isHovered = hoveredState === abbr
              const isSelected = selectedState === abbr

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={getStateColor(abbr)}
                  stroke={isSelected ? '#fff' : isHovered ? '#888' : '#333'}
                  strokeWidth={isSelected ? 2 : isHovered ? 1.5 : 0.5}
                  style={{
                    default: { outline: 'none', cursor: 'pointer', transition: 'fill 0.2s' },
                    hover: { outline: 'none', cursor: 'pointer' },
                    pressed: { outline: 'none' }
                  }}
                  onMouseEnter={() => setHoveredState(abbr)}
                  onMouseLeave={() => setHoveredState(null)}
                  onClick={() => onStateClick && onStateClick(abbr)}
                />
              )
            })
          }
        </Geographies>
      </ComposableMap>

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
            {STATE_NAMES[hoveredState] || hoveredState}
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
