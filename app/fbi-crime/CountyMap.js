'use client'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { geoMercator, geoAlbers, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'

// State FIPS codes for TopoJSON URLs
const STATE_FIPS = {
  'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06',
  'CO': '08', 'CT': '09', 'DE': '10', 'DC': '11', 'FL': '12',
  'GA': '13', 'HI': '15', 'ID': '16', 'IL': '17', 'IN': '18',
  'IA': '19', 'KS': '20', 'KY': '21', 'LA': '22', 'ME': '23',
  'MD': '24', 'MA': '25', 'MI': '26', 'MN': '27', 'MS': '28',
  'MO': '29', 'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33',
  'NJ': '34', 'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38',
  'OH': '39', 'OK': '40', 'OR': '41', 'PA': '42', 'RI': '44',
  'SC': '45', 'SD': '46', 'TN': '47', 'TX': '48', 'UT': '49',
  'VT': '50', 'VA': '51', 'WA': '53', 'WV': '54', 'WI': '55',
  'WY': '56', 'PR': '72'
}

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

// What each state calls its county-equivalents
const STATE_SUBDIVISION_NAME = {
  'LA': 'Parishes',      // Louisiana uses parishes
  'AK': 'Boroughs',      // Alaska uses boroughs and census areas
  'PR': 'Municipios',    // Puerto Rico uses municipios
  // All others use 'Counties'
}

// Get the subdivision term for a state
const getSubdivisionTerm = (stateAbbr) => STATE_SUBDIVISION_NAME[stateAbbr] || 'Counties'

export default function CountyMap({ stateAbbr, data, selectedOffenses = [], year, onClose }) {
  const containerRef = useRef(null)
  const [containerSize, setContainerSize] = useState({ width: 400, height: 300 })
  const [hoveredCounty, setHoveredCounty] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [geoError, setGeoError] = useState(null)
  const [stateGeojson, setStateGeojson] = useState(null)
  const [loading, setLoading] = useState(true)

  // Measure container size for dynamic scaling
  useEffect(() => {
    if (!containerRef.current) return

    const updateSize = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height })
      }
    }

    updateSize()
    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(containerRef.current)

    return () => resizeObserver.disconnect()
  }, [])

  // Load and filter TopoJSON for this state
  useEffect(() => {
    if (!stateAbbr) return
    const fips = STATE_FIPS[stateAbbr]
    if (!fips) {
      setGeoError(`Unknown state: ${stateAbbr}`)
      return
    }

    setLoading(true)
    setGeoError(null)

    const url = `https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json`

    fetch(url)
      .then(res => res.json())
      .then(topology => {
        const countiesGeo = feature(topology, topology.objects.counties)

        const stateCounties = {
          type: 'FeatureCollection',
          features: countiesGeo.features.filter(f => {
            const countyFips = String(f.id).padStart(5, '0')
            return countyFips.startsWith(fips)
          })
        }

        setStateGeojson(stateCounties)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading TopoJSON:', err)
        setGeoError('Failed to load map data')
        setLoading(false)
      })
  }, [stateAbbr])

  // Create projection fitted to container - this is the key!
  const { projection, pathGenerator } = useMemo(() => {
    if (!stateGeojson || containerSize.width === 0 || containerSize.height === 0) {
      return { projection: null, pathGenerator: null }
    }

    const padding = 10
    let proj

    // Alaska needs special handling due to its extreme longitude range (crosses antimeridian)
    if (stateAbbr === 'AK') {
      // Use Albers projection centered on Alaska
      proj = geoAlbers()
        .rotate([154, 0])  // Center on Alaska longitude
        .center([0, 64])   // Center on Alaska latitude
        .parallels([55, 65])
        .fitExtent(
          [[padding, padding], [containerSize.width - padding, containerSize.height - padding]],
          stateGeojson
        )
    } else {
      proj = geoMercator().fitExtent(
        [[padding, padding], [containerSize.width - padding, containerSize.height - padding]],
        stateGeojson
      )
    }

    return {
      projection: proj,
      pathGenerator: geoPath().projection(proj)
    }
  }, [stateGeojson, containerSize, stateAbbr])

  // Helper to sum selected offenses for a data row
  const sumOffenses = useCallback((row) => {
    if (!row || !selectedOffenses || selectedOffenses.length === 0) return 0
    return selectedOffenses.reduce((sum, id) => sum + (row[id] || 0), 0)
  }, [selectedOffenses])

  // Normalize county name for matching: lowercase, no periods, trim
  const normalizeCountyName = useCallback((name) => {
    return (name || '').toLowerCase().replace(/\./g, '').trim()
  }, [])

  // Build county data map - key is normalized county name for matching
  const countyDataMap = useMemo(() => {
    const map = {}
    if (data && Array.isArray(data)) {
      for (const row of data) {
        if (row.year === year && row.state === stateAbbr) {
          // Key by normalized county name for fuzzy matching
          const key = normalizeCountyName(row.county)
          if (key) {
            map[key] = {
              ...row,
              offenseTotal: sumOffenses(row)
            }
          }
        }
      }
    }
    return map
  }, [data, year, stateAbbr, sumOffenses, normalizeCountyName])

  // Also index by FIPS code if available
  const countyFipsMap = useMemo(() => {
    const map = {}
    if (data && Array.isArray(data)) {
      for (const row of data) {
        if (row.year === year && row.state === stateAbbr && row.county_fips) {
          map[row.county_fips] = {
            ...row,
            offenseTotal: sumOffenses(row)
          }
        }
      }
    }
    return map
  }, [data, year, stateAbbr, sumOffenses])

  // Calculate color scale
  const { minVal, maxVal } = useMemo(() => {
    const values = Object.values(countyDataMap).map(d => {
      if (!d || !d.pop || d.pop === 0) return 0
      return (d.offenseTotal || 0) / d.pop * 100000
    }).filter(v => v > 0).sort((a, b) => a - b)

    if (values.length === 0) return { minVal: 0, maxVal: 1 }

    const p5 = values[Math.floor(values.length * 0.05)] || values[0]
    const p95 = values[Math.floor(values.length * 0.95)] || values[values.length - 1]

    return { minVal: p5, maxVal: p95 }
  }, [countyDataMap])

  // Get county data by trying to match geo properties
  const getCountyData = useCallback((geo) => {
    // Try FIPS code first
    const fips = geo.id || geo.properties?.GEOID
    if (fips && countyFipsMap[fips]) {
      return countyFipsMap[fips]
    }

    // Try county name (normalized: lowercase, no periods)
    const name = normalizeCountyName(geo.properties?.NAME || geo.properties?.name || '')
    if (name && countyDataMap[name]) {
      return countyDataMap[name]
    }

    // Try with "county" suffix removed
    const nameNoSuffix = name.replace(/ county$/, '').replace(/ parish$/, '').replace(/ borough$/, '')
    if (nameNoSuffix && countyDataMap[nameNoSuffix]) {
      return countyDataMap[nameNoSuffix]
    }

    return null
  }, [countyDataMap, countyFipsMap, normalizeCountyName])

  // Color function
  const getCountyColor = useCallback((geo) => {
    const d = getCountyData(geo)
    if (!d || !d.pop || d.pop === 0) {
      return '#1a1a1a'
    }
    const rate = (d.offenseTotal || 0) / d.pop * 100000
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
  }, [getCountyData, minVal, maxVal])

  const formatRate = useCallback((num) => typeof num === 'number' ? num.toFixed(1) : '0', [])

  const handleMouseMove = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }, [])

  if (!stateAbbr) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
        Click a state to view county data
      </div>
    )
  }

  if (geoError) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#ff4444' }}>
        {geoError}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }} onMouseMove={handleMouseMove}>
      {/* Header with state name, legend, and close button */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: '1px solid #333',
        flexShrink: 0,
        gap: '12px'
      }}>
        <span style={{ fontSize: '14px', fontWeight: '600', color: '#fff' }}>
          {STATE_NAMES[stateAbbr] || stateAbbr} {getSubdivisionTerm(stateAbbr)}
        </span>
        {/* Legend inline in header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#888' }}>
          <span>{formatRate(minVal)}</span>
          <div style={{ width: '50px', height: '6px', background: 'linear-gradient(to right, rgb(60,20,90), rgb(140,30,60), rgb(220,60,30), rgb(255,220,60))', borderRadius: '2px' }}></div>
          <span>{formatRate(maxVal)}</span>
          <span style={{ marginLeft: '4px' }}>per 100K</span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: '1px solid #444',
            color: '#888',
            padding: '2px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Close
        </button>
      </div>

      <div ref={containerRef} style={{ flex: 1, minHeight: '280px', position: 'relative', background: '#0a0a0a' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
            Loading...
          </div>
        ) : pathGenerator && stateGeojson ? (
          <svg
            width={containerSize.width}
            height={containerSize.height}
            style={{ display: 'block' }}
          >
            {stateGeojson.features.map((feature, i) => {
              const countyName = feature.properties?.NAME || feature.properties?.name || 'Unknown'
              const isHovered = hoveredCounty?.fips === feature.id
              const path = pathGenerator(feature)

              return (
                <path
                  key={feature.id || i}
                  d={path}
                  fill={getCountyColor(feature)}
                  stroke={isHovered ? '#888' : '#333'}
                  strokeWidth={isHovered ? 1 : 0.3}
                  style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
                  onMouseEnter={() => setHoveredCounty({ name: countyName, fips: feature.id })}
                  onMouseLeave={() => setHoveredCounty(null)}
                />
              )
            })}
          </svg>
        ) : null}

      </div>

      {/* Tooltip - responsive positioning to stay on screen */}
      {hoveredCounty && (
        <div style={{
          position: 'fixed',
          // Position tooltip to left of cursor if near right edge, above if near bottom
          left: mousePos.x > window.innerWidth - 180 ? mousePos.x - 145 : mousePos.x + 15,
          top: mousePos.y > window.innerHeight - 120 ? mousePos.y - 100 : mousePos.y + 10,
          background: '#1a1a1a',
          border: '1px solid #444',
          borderRadius: '6px',
          padding: '8px 12px',
          zIndex: 1000,
          pointerEvents: 'none',
          minWidth: '120px',
          maxWidth: '200px'
        }}>
          {(() => {
            // hoveredCounty is an object with {name, fips}
            const { name: geoName, fips } = hoveredCounty
            // Try to find matching data by county name (normalized)
            const nameKey = normalizeCountyName(geoName)
            const countyData = countyDataMap[nameKey] || countyDataMap[nameKey.replace(/ county$/, '').replace(/ parish$/, '').replace(/ borough$/, '')]
            const pop = countyData?.pop || 0
            const total = countyData?.offenseTotal || 0
            const rate = pop > 0 ? (total / pop) * 100000 : 0

            // Display name with proper subdivision term
            const subdivisionTerm = STATE_SUBDIVISION_NAME[stateAbbr] === 'Parishes' ? 'Parish' :
                                   STATE_SUBDIVISION_NAME[stateAbbr] === 'Boroughs' ? 'Borough' :
                                   STATE_SUBDIVISION_NAME[stateAbbr] === 'Municipios' ? 'Municipio' : 'County'
            const displayName = geoName || 'Unknown'

            return (
              <>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginBottom: '4px' }}>
                  {displayName} {subdivisionTerm}
                </div>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
                  Pop: {pop.toLocaleString()}
                </div>
                <div style={{ fontSize: '12px', color: '#ef4444' }}>
                  Offenses: {total.toLocaleString()}
                </div>
                <div style={{ fontSize: '11px', color: '#888' }}>
                  Rate: {formatRate(rate)}/100K
                </div>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
