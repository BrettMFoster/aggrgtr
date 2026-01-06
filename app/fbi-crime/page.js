'use client'
import { useState, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import USMap from './USMap'
import CountyMap from './CountyMap'

// Hierarchical offense categories
const OFFENSE_CATEGORIES = [
  {
    id: 'homicide',
    label: 'Homicide',
    offenses: [
      { id: 'off_murder', label: 'Murder & Non-negligent Manslaughter' },
      { id: 'off_manslaughter', label: 'Negligent Manslaughter' },
      { id: 'off_justifiable_homicide', label: 'Justifiable Homicide' }
    ]
  },
  {
    id: 'sex_crimes',
    label: 'Sex Crimes',
    offenses: [
      { id: 'off_rape', label: 'Rape' },
      { id: 'off_sodomy', label: 'Sodomy' },
      { id: 'off_sexual_assault', label: 'Sexual Assault' },
      { id: 'off_fondling', label: 'Fondling' }
    ]
  },
  {
    id: 'assault',
    label: 'Assault',
    offenses: [
      { id: 'off_agg_assault', label: 'Aggravated Assault' },
      { id: 'off_simple_assault', label: 'Simple Assault' },
      { id: 'off_intimidation', label: 'Intimidation' }
    ]
  },
  {
    id: 'other_violent',
    label: 'Other Violent',
    offenses: [
      { id: 'off_robbery', label: 'Robbery' },
      { id: 'off_kidnapping', label: 'Kidnapping' }
    ]
  },
  {
    id: 'property',
    label: 'Property',
    offenses: [
      { id: 'off_burglary', label: 'Burglary' },
      { id: 'off_motor_vehicle_theft', label: 'Vehicle Theft' },
      { id: 'off_arson', label: 'Arson' }
    ]
  },
  {
    id: 'other',
    label: 'Other',
    offenses: [
      { id: 'off_drug_violations', label: 'Drug Violations' },
      { id: 'off_weapon_violations', label: 'Weapon Violations' }
    ]
  }
]

// Get all offense IDs for Select All
const ALL_OFFENSE_IDS = OFFENSE_CATEGORIES.flatMap(cat => cat.offenses.map(o => o.id))

// Offender race options - 'value' is passed to API, 'id' is used for UI state
const OFFENDER_RACES = [
  { id: 'o_white', value: 'white', label: 'White' },
  { id: 'o_black', value: 'black', label: 'Black' },
  { id: 'o_asian', value: 'asian', label: 'Asian' },
  { id: 'o_native', value: 'native', label: 'Native American' },
  { id: 'o_pacific', value: 'pacific', label: 'Pacific Islander' },
  { id: 'o_race_other', value: 'other', label: 'Other' },
  { id: 'o_race_unknown', value: 'unknown', label: 'Unknown' }
  // Note: Hispanic is ethnicity not race in FBI data, so removed from race filter
]

// What each state calls its county-equivalents
const SUBDIVISION_TERMS = {
  'LA': { plural: 'Parishes', singular: 'Parish' },
  'AK': { plural: 'Boroughs', singular: 'Borough' },
  'PR': { plural: 'Municipios', singular: 'Municipio' },
}
const getSubdivisionTerm = (stateAbbr, plural = true) => {
  const terms = SUBDIVISION_TERMS[stateAbbr]
  if (terms) return plural ? terms.plural : terms.singular
  return plural ? 'Counties' : 'County'
}

export default function FBICrime() {
  const [countyData, setCountyData] = useState([])           // County data for selected state
  const [selectedYear, setSelectedYear] = useState(2024)     // Default to 2024 for faster initial load
  const [selectedState, setSelectedState] = useState(null)
  const [countyLoading, setCountyLoading] = useState(false)
  // Multi-select: set of selected offense IDs
  const [selectedOffenses, setSelectedOffenses] = useState(new Set())
  // Track which categories are expanded
  const [expandedCategories, setExpandedCategories] = useState(new Set())
  const [isMobile, setIsMobile] = useState(false)
  // Sorting state for each table: { column: string, direction: 'asc' | 'desc' }
  const [stateSort, setStateSort] = useState({ column: 'rate', direction: 'desc' })
  const [countySort, setCountySort] = useState({ column: 'rate', direction: 'desc' })
  const [citySort, setCitySort] = useState({ column: 'rate', direction: 'desc' })
  // Offender race filter (multi-select, empty = all races)
  const [selectedRaces, setSelectedRaces] = useState(new Set())
  // Track if race section is expanded
  const [raceExpanded, setRaceExpanded] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Build race query param from selected races
  // Returns empty string if no races selected OR all races selected (equivalent to no filter)
  const getRaceParam = (races) => {
    if (races.size === 0) return ''
    // If all 7 races selected, treat same as no filter (avoids double-counting multi-race incidents)
    if (races.size === OFFENDER_RACES.length) return ''
    const raceValues = OFFENDER_RACES
      .filter(r => races.has(r.id))
      .map(r => r.value)
    return raceValues.length > 0 ? `&race=${raceValues.join(',')}` : ''
  }

  // Check if race filter is actually active (not empty AND not all selected)
  const isRaceFilterActive = (races) => {
    return races.size > 0 && races.size < OFFENDER_RACES.length
  }

  // Build race param string for SWR keys
  const raceParam = getRaceParam(selectedRaces)
  const hasRaceFilter = isRaceFilterActive(selectedRaces)

  // Build year param - only fetch selected year's data for faster loading
  const yearParam = selectedYear ? `&year=${selectedYear}` : ''

  // SWR hooks for main data fetching with caching
  // Fetches only selected year's data to reduce payload size
  const { data: metaJson } = useSWR('/api/fbi-crime?level=metadata')
  const { data: stateJson, error: stateError } = useSWR(`/api/fbi-crime?level=state${yearParam}${raceParam}`)
  const { data: countyJson } = useSWR(`/api/fbi-crime?level=county${yearParam}${raceParam}`)
  const { data: cityJson } = useSWR(`/api/fbi-crime?level=city${yearParam}${raceParam}`)

  // Fetch totals (unfiltered by race) when race filter is active - still filter by year
  const { data: totalStateJson } = useSWR(hasRaceFilter ? `/api/fbi-crime?level=state${yearParam}` : null)
  const { data: totalCountyJson } = useSWR(hasRaceFilter ? `/api/fbi-crime?level=county${yearParam}` : null)
  const { data: totalCityJson } = useSWR(hasRaceFilter ? `/api/fbi-crime?level=city${yearParam}` : null)

  // Derive data from SWR responses
  const metadata = metaJson || null
  const stateData = stateJson?.rows || []
  const allCountyData = countyJson?.rows || []
  const allCityData = cityJson?.rows || []
  const totalStateData = hasRaceFilter ? (totalStateJson?.rows || []) : stateData
  const totalCountyData = hasRaceFilter ? (totalCountyJson?.rows || []) : allCountyData
  const totalCityData = hasRaceFilter ? (totalCityJson?.rows || []) : allCityData

  // Show loading until all main data is ready (state, county, city)
  const loading = !stateJson || !countyJson || !cityJson
  const error = stateError?.message || null

  // Update year to latest available if metadata shows 2024 isn't available
  // (fallback in case data doesn't have 2024 yet)
  useEffect(() => {
    if (metadata?.years && metadata.years.length > 0) {
      const maxYear = Math.max(...metadata.years)
      if (!metadata.years.includes(selectedYear)) {
        setSelectedYear(maxYear)
      }
    }
  }, [metadata])

  // Fetch county data when state is selected
  const fetchCountyData = async (stateAbbr, races, year) => {
    if (!stateAbbr) {
      setCountyData([])
      return
    }
    setCountyLoading(true)
    try {
      const raceParam = getRaceParam(races)
      const yearParam = year ? `&year=${year}` : ''
      const res = await fetch(`/api/fbi-crime?level=county&state=${stateAbbr}${yearParam}${raceParam}`)
      const json = await res.json()
      setCountyData(json.rows || [])
    } catch (err) {
      console.error('Error fetching county data:', err)
      setCountyData([])
    }
    setCountyLoading(false)
  }

  // Re-fetch county data when race or year changes and a state is selected
  useEffect(() => {
    if (selectedState) {
      fetchCountyData(selectedState, selectedRaces, selectedYear)
    }
  }, [selectedRaces, selectedYear])

  // Handle state click
  const handleStateClick = (stateAbbr) => {
    if (selectedState === stateAbbr) {
      // Clicking same state deselects it
      setSelectedState(null)
      setCountyData([])
    } else {
      setSelectedState(stateAbbr)
      fetchCountyData(stateAbbr, selectedRaces, selectedYear)
    }
  }

  // Memoize sorted years to avoid re-sorting on every render
  const years = useMemo(() => {
    return metadata?.years?.slice().sort((a, b) => b - a) || []
  }, [metadata?.years])

  // Get display label for selected offenses
  const selectedOffensesLabel = useMemo(() => {
    if (selectedOffenses.size === 0) return 'No offenses selected'
    if (selectedOffenses.size === 1) {
      const id = Array.from(selectedOffenses)[0]
      for (const cat of OFFENSE_CATEGORIES) {
        const offense = cat.offenses.find(o => o.id === id)
        if (offense) return offense.label
      }
    }
    if (selectedOffenses.size === ALL_OFFENSE_IDS.length) return 'All Offenses'
    return `${selectedOffenses.size} offenses selected`
  }, [selectedOffenses])

  // Generic sort function for rankings
  const sortData = (data, sort, nameField = 'state') => {
    return [...data].sort((a, b) => {
      let aVal, bVal
      switch (sort.column) {
        case 'name':
          aVal = a[nameField] || ''
          bVal = b[nameField] || ''
          return sort.direction === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        case 'pop':
          aVal = a.pop || 0
          bVal = b.pop || 0
          break
        case 'offenses':
          aVal = a.offenseTotal || 0
          bVal = b.offenseTotal || 0
          break
        case 'rate':
          aVal = a.rate || 0
          bVal = b.rate || 0
          break
        case 'cleared':
          aVal = a.clearanceRate ?? -1
          bVal = b.clearanceRate ?? -1
          break
        default:
          aVal = a.rate || 0
          bVal = b.rate || 0
      }
      return sort.direction === 'asc' ? aVal - bVal : bVal - aVal
    })
  }

  // Handle column header click for sorting
  const handleSort = (table, column) => {
    const setSort = table === 'state' ? setStateSort : table === 'county' ? setCountySort : setCitySort
    const currentSort = table === 'state' ? stateSort : table === 'county' ? countySort : citySort

    if (currentSort.column === column) {
      // Toggle direction
      setSort({ column, direction: currentSort.direction === 'asc' ? 'desc' : 'asc' })
    } else {
      // New column, default to desc (highest first)
      setSort({ column, direction: 'desc' })
    }
  }

  // Calculate sum of selected offenses for each state
  const stateRankings = useMemo(() => {
    const offenseIds = Array.from(selectedOffenses)
    const hasRaceFilter = isRaceFilterActive(selectedRaces)

    // Build lookup for totals when race filter active
    const totalLookup = {}
    if (hasRaceFilter && totalStateData.length > 0) {
      totalStateData.filter(d => d.year === selectedYear).forEach(d => {
        const totalSum = offenseIds.reduce((sum, id) => sum + (d[id] || 0), 0)
        totalLookup[d.state] = totalSum
      })
    }

    const mapped = stateData
      .filter(d => d.year === selectedYear)
      .map(d => {
        // Sum all selected offenses
        const total = offenseIds.reduce((sum, id) => sum + (d[id] || 0), 0)
        const clearanceRate = d.incidents > 0 ? (d.incidents_cleared / d.incidents) * 100 : null
        return {
          ...d,
          offenseTotal: total,
          totalOffenseTotal: hasRaceFilter ? totalLookup[d.state] : null,
          rate: d.pop > 0 ? (total / d.pop) * 100000 : 0,
          clearanceRate
        }
      })
    return sortData(mapped, stateSort, 'state')
  }, [stateData, totalStateData, selectedYear, selectedOffenses, selectedRaces, stateSort])

  // Calculate county rankings for selected state (when state selected)
  const countyRankings = useMemo(() => {
    if (!selectedState || !countyData.length) return []
    const offenseIds = Array.from(selectedOffenses)
    const hasRaceFilter = isRaceFilterActive(selectedRaces)

    // Build lookup for totals when race filter active (from totalCountyData for selected state)
    const totalLookup = {}
    if (hasRaceFilter && totalCountyData.length > 0) {
      totalCountyData.filter(d => d.year === selectedYear && d.state === selectedState).forEach(d => {
        const totalSum = offenseIds.reduce((sum, id) => sum + (d[id] || 0), 0)
        totalLookup[d.county] = totalSum
      })
    }

    const mapped = countyData
      .filter(d => d.year === selectedYear)
      .map(d => {
        const total = offenseIds.reduce((sum, id) => sum + (d[id] || 0), 0)
        const clearanceRate = d.incidents > 0 ? (d.incidents_cleared / d.incidents) * 100 : null
        return {
          ...d,
          offenseTotal: total,
          totalOffenseTotal: hasRaceFilter ? totalLookup[d.county] : null,
          rate: d.pop > 0 ? (total / d.pop) * 100000 : 0,
          clearanceRate
        }
      })
    return sortData(mapped, countySort, 'county').slice(0, 51)
  }, [countyData, totalCountyData, selectedYear, selectedOffenses, selectedState, selectedRaces, countySort])

  // National county rankings (top 51 counties nationwide by rate)
  const nationalCountyRankings = useMemo(() => {
    if (!allCountyData.length) return []
    const offenseIds = Array.from(selectedOffenses)
    const hasRaceFilter = isRaceFilterActive(selectedRaces)

    // Build lookup for totals when race filter active
    const totalLookup = {}
    if (hasRaceFilter && totalCountyData.length > 0) {
      totalCountyData.filter(d => d.year === selectedYear).forEach(d => {
        const key = `${d.state}-${d.county}`
        const totalSum = offenseIds.reduce((sum, id) => sum + (d[id] || 0), 0)
        totalLookup[key] = totalSum
      })
    }

    const mapped = allCountyData
      .filter(d => d.year === selectedYear && d.county && d.pop >= 100000) // Only counties with pop >= 100K
      .map(d => {
        const total = offenseIds.reduce((sum, id) => sum + (d[id] || 0), 0)
        const clearanceRate = d.incidents > 0 ? (d.incidents_cleared / d.incidents) * 100 : null
        const key = `${d.state}-${d.county}`
        return {
          ...d,
          offenseTotal: total,
          totalOffenseTotal: hasRaceFilter ? totalLookup[key] : null,
          rate: d.pop > 0 ? (total / d.pop) * 100000 : 0,
          clearanceRate
        }
      })
    return sortData(mapped, countySort, 'county').slice(0, 51)
  }, [allCountyData, totalCountyData, selectedYear, selectedOffenses, selectedRaces, countySort])

  // National city rankings (top 51 cities nationwide by rate)
  const nationalCityRankings = useMemo(() => {
    if (!allCityData.length) return []
    const offenseIds = Array.from(selectedOffenses)
    const hasRaceFilter = isRaceFilterActive(selectedRaces)

    // Build lookup for totals when race filter active
    const totalLookup = {}
    if (hasRaceFilter && totalCityData.length > 0) {
      totalCityData.filter(d => d.year === selectedYear).forEach(d => {
        const key = `${d.state}-${d.city}`
        const totalSum = offenseIds.reduce((sum, id) => sum + (d[id] || 0), 0)
        totalLookup[key] = totalSum
      })
    }

    const mapped = allCityData
      .filter(d => d.year === selectedYear && d.city && d.pop >= 100000) // Only cities with pop >= 100K
      .map(d => {
        const total = offenseIds.reduce((sum, id) => sum + (d[id] || 0), 0)
        // Clearance rate: proportion of incidents cleared, scaled by selected offenses
        const clearanceRate = d.incidents > 0 ? (d.incidents_cleared / d.incidents) * 100 : null
        const key = `${d.state}-${d.city}`
        return {
          ...d,
          offenseTotal: total,
          totalOffenseTotal: hasRaceFilter ? totalLookup[key] : null,
          rate: d.pop > 0 ? (total / d.pop) * 100000 : 0,
          clearanceRate
        }
      })
    return sortData(mapped, citySort, 'city').slice(0, 51)
  }, [allCityData, totalCityData, selectedYear, selectedOffenses, selectedRaces, citySort])

  // State-specific city rankings (when state is selected)
  const stateCityRankings = useMemo(() => {
    if (!selectedState || !allCityData.length) return []
    const offenseIds = Array.from(selectedOffenses)
    const hasRaceFilter = isRaceFilterActive(selectedRaces)

    // Build lookup for totals when race filter active (for selected state)
    const totalLookup = {}
    if (hasRaceFilter && totalCityData.length > 0) {
      totalCityData.filter(d => d.year === selectedYear && d.state === selectedState).forEach(d => {
        const key = `${d.state}-${d.city}`
        const totalSum = offenseIds.reduce((sum, id) => sum + (d[id] || 0), 0)
        totalLookup[key] = totalSum
      })
    }

    const mapped = allCityData
      .filter(d => d.year === selectedYear && d.city && d.state === selectedState)
      .map(d => {
        const total = offenseIds.reduce((sum, id) => sum + (d[id] || 0), 0)
        // Clearance rate: proportion of incidents cleared
        const clearanceRate = d.incidents > 0 ? (d.incidents_cleared / d.incidents) * 100 : null
        const key = `${d.state}-${d.city}`
        return {
          ...d,
          offenseTotal: total,
          totalOffenseTotal: hasRaceFilter ? totalLookup[key] : null,
          rate: d.pop > 0 ? (total / d.pop) * 100000 : 0,
          clearanceRate
        }
      })
    return sortData(mapped, citySort, 'city').slice(0, 51)
  }, [allCityData, totalCityData, selectedYear, selectedOffenses, selectedState, selectedRaces, citySort])

  // Toggle a single offense
  const toggleOffense = (offenseId) => {
    setSelectedOffenses(prev => {
      const next = new Set(prev)
      if (next.has(offenseId)) {
        next.delete(offenseId)
      } else {
        next.add(offenseId)
      }
      return next
    })
  }

  // Toggle a race filter
  const toggleRace = (raceId) => {
    setSelectedRaces(prev => {
      const next = new Set(prev)
      if (next.has(raceId)) {
        next.delete(raceId)
      } else {
        next.add(raceId)
      }
      return next
    })
  }

  // Toggle all offenses in a category
  const toggleCategory = (category) => {
    const categoryOffenseIds = category.offenses.map(o => o.id)
    const allSelected = categoryOffenseIds.every(id => selectedOffenses.has(id))

    setSelectedOffenses(prev => {
      const next = new Set(prev)
      if (allSelected) {
        // Deselect all in category
        categoryOffenseIds.forEach(id => next.delete(id))
      } else {
        // Select all in category
        categoryOffenseIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  // Expand/collapse category
  const toggleExpanded = (categoryId) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  // Select all / deselect all
  const selectAll = () => setSelectedOffenses(new Set(ALL_OFFENSE_IDS))
  const deselectAll = () => setSelectedOffenses(new Set())

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(0) + 'K'
    return typeof num === 'number' ? num.toLocaleString() : num
  }

  const formatRate = (num) => {
    if (typeof num !== 'number') return '0'
    return num.toFixed(1)
  }

  // Format offense count with X/Total when race filter is active
  const formatOffenseWithTotal = (filtered, total) => {
    if (total != null) {
      return `${filtered?.toLocaleString() || 0}/${total?.toLocaleString() || 0}`
    }
    return filtered?.toLocaleString() || '0'
  }

  // Convert UPPERCASE to Title Case (for county names from FBI data)
  const toTitleCase = (str) => {
    if (!str) return str
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  }

  // Sort indicator arrow
  const sortArrow = (table, column) => {
    const sort = table === 'state' ? stateSort : table === 'county' ? countySort : citySort
    if (sort.column !== column) return ''
    return sort.direction === 'asc' ? ' ↑' : ' ↓'
  }

  // Sortable header style
  const headerStyle = (base = {}) => ({
    ...base,
    cursor: 'pointer',
    userSelect: 'none'
  })

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

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}>
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
              {years.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          {/* Offense Type - Hierarchical Checkboxes */}
          <div style={{ marginBottom: isMobile ? '12px' : '16px' }}>
            {!isMobile && <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Offense Type</div>}

            {/* Select All / Deselect All buttons */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button
                onClick={selectAll}
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  color: '#4ade80',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                Select All
              </button>
              <button
                onClick={deselectAll}
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  color: '#888',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                Clear
              </button>
            </div>

            {/* Category accordions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {OFFENSE_CATEGORIES.map(category => {
                const isExpanded = expandedCategories.has(category.id)
                const categoryOffenseIds = category.offenses.map(o => o.id)
                const selectedCount = categoryOffenseIds.filter(id => selectedOffenses.has(id)).length
                const allSelected = selectedCount === category.offenses.length
                const someSelected = selectedCount > 0 && !allSelected

                return (
                  <div key={category.id}>
                    {/* Category header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        background: isExpanded ? '#1a1a1a' : 'transparent',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      {/* Expand/collapse arrow */}
                      <span
                        onClick={() => toggleExpanded(category.id)}
                        style={{ color: '#666', fontSize: '10px', width: '12px' }}
                      >
                        {isExpanded ? '▼' : '▶'}
                      </span>

                      {/* Category checkbox */}
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected }}
                        onChange={() => toggleCategory(category)}
                        style={{ accentColor: '#ef4444', cursor: 'pointer' }}
                      />

                      {/* Category label */}
                      <span
                        onClick={() => toggleExpanded(category.id)}
                        style={{
                          color: selectedCount > 0 ? '#fff' : '#888',
                          fontSize: '13px',
                          fontWeight: selectedCount > 0 ? '500' : '400',
                          flex: 1
                        }}
                      >
                        {category.label}
                      </span>

                      {/* Count badge */}
                      {selectedCount > 0 && (
                        <span style={{
                          background: '#ef4444',
                          color: '#fff',
                          fontSize: '10px',
                          padding: '1px 5px',
                          borderRadius: '8px'
                        }}>
                          {selectedCount}
                        </span>
                      )}
                    </div>

                    {/* Offense checkboxes (when expanded) */}
                    {isExpanded && (
                      <div style={{ paddingLeft: '28px', paddingTop: '4px', paddingBottom: '4px' }}>
                        {category.offenses.map(offense => (
                          <label
                            key={offense.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '4px 0',
                              cursor: 'pointer'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedOffenses.has(offense.id)}
                              onChange={() => toggleOffense(offense.id)}
                              style={{ accentColor: '#ef4444', cursor: 'pointer' }}
                            />
                            <span style={{
                              color: selectedOffenses.has(offense.id) ? '#fff' : '#666',
                              fontSize: '12px'
                            }}>
                              {offense.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Offender Race Filter */}
          {!isMobile && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Race</div>

              {/* Select All / Clear buttons */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                  onClick={() => setSelectedRaces(new Set(OFFENDER_RACES.map(r => r.id)))}
                  style={{
                    background: '#1a1a1a',
                    border: '1px solid #333',
                    color: '#4ade80',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelectedRaces(new Set())}
                  style={{
                    background: '#1a1a1a',
                    border: '1px solid #333',
                    color: '#888',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  Clear
                </button>
              </div>

              {/* Race dropdown accordion */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div>
                  {/* Race header - click to expand */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      background: raceExpanded ? '#1a1a1a' : 'transparent',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    {/* Expand/collapse arrow */}
                    <span
                      onClick={() => setRaceExpanded(!raceExpanded)}
                      style={{ color: '#666', fontSize: '10px', width: '12px' }}
                    >
                      {raceExpanded ? '▼' : '▶'}
                    </span>

                    {/* Category checkbox */}
                    <input
                      type="checkbox"
                      checked={selectedRaces.size === OFFENDER_RACES.length}
                      ref={el => { if (el) el.indeterminate = selectedRaces.size > 0 && selectedRaces.size < OFFENDER_RACES.length }}
                      onChange={() => {
                        if (selectedRaces.size === OFFENDER_RACES.length) {
                          setSelectedRaces(new Set())
                        } else {
                          setSelectedRaces(new Set(OFFENDER_RACES.map(r => r.id)))
                        }
                      }}
                      style={{ accentColor: '#ef4444', cursor: 'pointer' }}
                    />

                    {/* Category label */}
                    <span
                      onClick={() => setRaceExpanded(!raceExpanded)}
                      style={{
                        color: isRaceFilterActive(selectedRaces) ? '#fff' : '#888',
                        fontSize: '13px',
                        fontWeight: isRaceFilterActive(selectedRaces) ? '500' : '400',
                        flex: 1
                      }}
                    >
                      Offender Race
                    </span>

                    {/* Count badge - only show when filter is actually active (not all selected) */}
                    {isRaceFilterActive(selectedRaces) && (
                      <span style={{
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: '8px'
                      }}>
                        {selectedRaces.size}
                      </span>
                    )}
                  </div>

                  {/* Race checkboxes (when expanded) */}
                  {raceExpanded && (
                    <div style={{ paddingLeft: '28px', paddingTop: '4px', paddingBottom: '4px' }}>
                      {OFFENDER_RACES.map(race => (
                        <label
                          key={race.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '4px 0',
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedRaces.has(race.id)}
                            onChange={() => {
                              setSelectedRaces(prev => {
                                const next = new Set(prev)
                                if (next.has(race.id)) {
                                  next.delete(race.id)
                                } else {
                                  next.add(race.id)
                                }
                                return next
                              })
                            }}
                            style={{ accentColor: '#ef4444', cursor: 'pointer' }}
                          />
                          <span style={{
                            color: selectedRaces.has(race.id) ? '#fff' : '#666',
                            fontSize: '12px'
                          }}>
                            {race.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!isMobile && <div style={{ fontSize: '11px', color: '#666', marginTop: '24px' }}>Source: FBI NIBRS</div>}
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: isMobile ? '16px' : '24px 20px' }}>
          <h1 style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '600', letterSpacing: '-1px', color: '#fff', margin: '0 0 8px 0' }}>FBI Crime Statistics</h1>
          <p style={{ fontSize: isMobile ? '14px' : '16px', color: '#666', margin: isMobile ? '0 0 16px 0' : '0 0 32px 0' }}>
            {selectedOffensesLabel} by state ({selectedYear}) - per 100K population
          </p>

          {loading ? (
            <div style={{ color: '#fff', padding: '40px', textAlign: 'center' }}>Loading...</div>
          ) : error ? (
            <div style={{ color: '#ff4444', padding: '40px', textAlign: 'center' }}>Error: {error}</div>
          ) : (
            <>
              {/* Dual Map Layout */}
              <div style={{
                display: 'flex',
                gap: '16px',
                marginBottom: '24px',
                flexDirection: isMobile ? 'column' : 'row'
              }}>
                {/* US Map (larger, primary) */}
                <div style={{
                  flex: selectedState ? '1.5' : '1',
                  background: '#111',
                  border: '1px solid #222',
                  borderRadius: '8px',
                  padding: '20px',
                  transition: 'flex 0.3s ease'
                }}>
                  <USMap
                    data={stateData}
                    selectedOffenses={Array.from(selectedOffenses)}
                    year={selectedYear}
                    onStateClick={handleStateClick}
                    selectedState={selectedState}
                  />
                </div>

                {/* County Map (appears when state is selected) */}
                {selectedState && (
                  <div style={{
                    flex: '1',
                    background: '#111',
                    border: '1px solid #222',
                    borderRadius: '8px',
                    minWidth: isMobile ? 'auto' : '350px',
                    maxWidth: isMobile ? 'none' : '500px',
                    minHeight: '350px'
                  }}>
                    {countyLoading ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
                        Loading {selectedState} {getSubdivisionTerm(selectedState, false).toLowerCase()} data...
                      </div>
                    ) : (
                      <CountyMap
                        stateAbbr={selectedState}
                        data={countyData}
                        selectedOffenses={Array.from(selectedOffenses)}
                        year={selectedYear}
                        onClose={() => {
                          setSelectedState(null)
                          setCountyData([])
                        }}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Rankings Tables - Side by Side */}
              <div style={{
                display: 'flex',
                gap: '16px',
                flexDirection: isMobile ? 'column' : 'row'
              }}>
                {/* State Rankings Table */}
                <div style={{
                  flex: '0 0 auto',
                  minWidth: 0,
                  background: '#111',
                  border: '1px solid #222',
                  borderRadius: '8px',
                  padding: isMobile ? '12px' : '12px',
                  overflowX: 'auto'
                }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#fff', margin: '0 0 8px 0' }}>
                    State Rankings ({selectedYear})
                  </h3>
                  <table style={{ borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #333' }}>
                        <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>#</th>
                        <th style={headerStyle({ padding: '8px', textAlign: 'left', color: '#888' })} onClick={() => handleSort('state', 'name')}>State{sortArrow('state', 'name')}</th>
                        <th style={headerStyle({ padding: '8px', textAlign: 'right', color: '#888' })} onClick={() => handleSort('state', 'pop')}>Pop.{sortArrow('state', 'pop')}</th>
                        <th style={headerStyle({ padding: '8px', textAlign: 'right', color: '#ef4444' })} onClick={() => handleSort('state', 'offenses')}>Offenses{sortArrow('state', 'offenses')}</th>
                        <th style={headerStyle({ padding: '8px', textAlign: 'right', color: '#888' })} onClick={() => handleSort('state', 'rate')}>Per 100K{sortArrow('state', 'rate')}</th>
                        <th style={headerStyle({ padding: '8px', textAlign: 'right', color: '#22c55e' })} onClick={() => handleSort('state', 'cleared')}>Cleared{sortArrow('state', 'cleared')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stateRankings.map((row, i) => (
                        <tr
                          key={row.state}
                          style={{
                            borderBottom: '1px solid #222',
                            background: row.state === selectedState ? '#1a1a2e' : 'transparent',
                            cursor: 'pointer'
                          }}
                          onClick={() => handleStateClick(row.state)}
                        >
                          <td style={{ padding: '8px', color: '#888' }}>{i + 1}</td>
                          <td style={{ padding: '8px', color: '#fff', fontWeight: '500' }}>{row.state}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#888' }}>{(row.pop / 1000000).toFixed(1)}M</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#ef4444', fontWeight: '600' }}>
                            {formatOffenseWithTotal(row.offenseTotal, row.totalOffenseTotal)}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#888' }}>{formatRate(row.rate)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#22c55e' }}>
                            {row.clearanceRate != null ? `${row.clearanceRate.toFixed(1)}%` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* County Rankings Table - State-specific when state selected, National otherwise */}
                <div style={{
                  flex: '1 1 0',
                  minWidth: 0,
                  background: '#111',
                  border: '1px solid #222',
                  borderRadius: '8px',
                  padding: isMobile ? '12px' : '20px',
                  overflowX: 'auto'
                }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#fff', margin: '0 0 16px 0' }}>
                    {selectedState
                      ? `${selectedState} ${getSubdivisionTerm(selectedState, false)} Rankings (${selectedYear})`
                      : `Top Counties Nationwide (${selectedYear})`
                    }
                  </h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '280px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #333' }}>
                        <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>#</th>
                        <th style={headerStyle({ padding: '8px', textAlign: 'left', color: '#888' })} onClick={() => handleSort('county', 'name')}>
                          {selectedState ? getSubdivisionTerm(selectedState, false) : 'County'}{sortArrow('county', 'name')}
                        </th>
                        {!selectedState && <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>State</th>}
                        <th style={headerStyle({ padding: '8px', textAlign: 'right', color: '#888' })} onClick={() => handleSort('county', 'pop')}>Pop.{sortArrow('county', 'pop')}</th>
                        <th style={headerStyle({ padding: '8px', textAlign: 'right', color: '#ef4444' })} onClick={() => handleSort('county', 'offenses')}>Offenses{sortArrow('county', 'offenses')}</th>
                        <th style={headerStyle({ padding: '8px', textAlign: 'right', color: '#888' })} onClick={() => handleSort('county', 'rate')}>Per 100K{sortArrow('county', 'rate')}</th>
                        <th style={headerStyle({ padding: '8px', textAlign: 'right', color: '#22c55e' })} onClick={() => handleSort('county', 'cleared')}>Cleared{sortArrow('county', 'cleared')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedState ? countyRankings : nationalCountyRankings).map((row, i) => (
                        <tr
                          key={`${row.state}-${row.county}-${i}`}
                          style={{ borderBottom: '1px solid #222', cursor: !selectedState ? 'pointer' : 'default' }}
                          onClick={() => !selectedState && handleStateClick(row.state)}
                        >
                          <td style={{ padding: '8px', color: '#888' }}>{i + 1}</td>
                          <td style={{ padding: '8px', color: '#fff', fontWeight: '500' }}>{toTitleCase(row.county)}</td>
                          {!selectedState && <td style={{ padding: '8px', color: '#888' }}>{row.state}</td>}
                          <td style={{ padding: '8px', textAlign: 'right', color: '#888' }}>{formatNumber(row.pop)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#ef4444', fontWeight: '600' }}>
                            {formatOffenseWithTotal(row.offenseTotal, row.totalOffenseTotal)}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#888' }}>{formatRate(row.rate)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#22c55e' }}>
                            {row.clearanceRate != null ? `${row.clearanceRate.toFixed(1)}%` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* City Rankings Table - State-specific when state selected, National otherwise */}
                <div style={{
                  flex: '1 1 0',
                  minWidth: 0,
                  background: '#111',
                  border: '1px solid #222',
                  borderRadius: '8px',
                  padding: isMobile ? '12px' : '20px',
                  overflowX: 'auto'
                }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#fff', margin: '0 0 16px 0' }}>
                    {selectedState
                      ? `${selectedState} City Rankings (${selectedYear})`
                      : `Top Cities Nationwide (${selectedYear})`
                    }
                  </h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '280px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #333' }}>
                        <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>#</th>
                        <th style={headerStyle({ padding: '8px', textAlign: 'left', color: '#888' })} onClick={() => handleSort('city', 'name')}>City{sortArrow('city', 'name')}</th>
                        {!selectedState && <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>State</th>}
                        <th style={headerStyle({ padding: '8px', textAlign: 'right', color: '#888' })} onClick={() => handleSort('city', 'pop')}>Pop.{sortArrow('city', 'pop')}</th>
                        <th style={headerStyle({ padding: '8px', textAlign: 'right', color: '#ef4444' })} onClick={() => handleSort('city', 'offenses')}>Offenses{sortArrow('city', 'offenses')}</th>
                        <th style={headerStyle({ padding: '8px', textAlign: 'right', color: '#888' })} onClick={() => handleSort('city', 'rate')}>Per 100K{sortArrow('city', 'rate')}</th>
                        <th style={headerStyle({ padding: '8px', textAlign: 'right', color: '#22c55e' })} onClick={() => handleSort('city', 'cleared')}>Cleared{sortArrow('city', 'cleared')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedState ? stateCityRankings : nationalCityRankings).map((row, i) => (
                        <tr
                          key={`${row.state}-${row.city}-${row.pop}-${i}`}
                          style={{ borderBottom: '1px solid #222', cursor: !selectedState ? 'pointer' : 'default' }}
                          onClick={() => !selectedState && handleStateClick(row.state)}
                        >
                          <td style={{ padding: '8px', color: '#888' }}>{i + 1}</td>
                          <td style={{ padding: '8px', color: '#fff', fontWeight: '500' }}>{row.city}</td>
                          {!selectedState && <td style={{ padding: '8px', color: '#888' }}>{row.state}</td>}
                          <td style={{ padding: '8px', textAlign: 'right', color: '#888' }}>{formatNumber(row.pop)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#ef4444', fontWeight: '600' }}>
                            {formatOffenseWithTotal(row.offenseTotal, row.totalOffenseTotal)}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#888' }}>{formatRate(row.rate)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#22c55e' }}>
                            {row.clearanceRate != null ? `${row.clearanceRate.toFixed(1)}%` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
