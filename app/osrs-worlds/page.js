'use client'
import { useState, useEffect } from 'react'
import useSWR from 'swr'

const scrollbarStyles = `
  .dark-scrollbar::-webkit-scrollbar {
    width: 8px;
  }
  .dark-scrollbar::-webkit-scrollbar-track {
    background: #1a1a1a;
    border-radius: 4px;
  }
  .dark-scrollbar::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 4px;
  }
  .dark-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #444;
  }
`

export default function OSRSWorlds() {
  const [sortBy, setSortBy] = useState('players')
  const [sortDir, setSortDir] = useState('desc')
  const [filterRegion, setFilterRegion] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [selectedWorld, setSelectedWorld] = useState(null)
  const [worldHistory, setWorldHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRange, setHistoryRange] = useState('day')  // day, week, month, quarter, year
  const [hoveredWorld, setHoveredWorld] = useState(null)
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const [isMobile, setIsMobile] = useState(false)
  const [, setTick] = useState(0) // Force re-render for cache age display

  // SWR for main data fetching with caching
  const { data, error: swrError } = useSWR('/api/osrs-worlds', {
    refreshInterval: 15 * 60 * 1000  // Auto-refresh every 15 minutes
  })
  const loading = !data && !swrError
  const error = swrError?.message || data?.error

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Update cache age display every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  const fetchWorldHistory = async (world, range = 'day') => {
    setSelectedWorld(world)
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/osrs-worlds?world=${world.world_id}&range=${range}`)
      const json = await res.json()
      if (json.history) {
        setWorldHistory(json.history)
      }
    } catch (err) {
      console.error('Failed to fetch world history:', err)
    }
    setHistoryLoading(false)
  }

  // Refetch history when range changes
  const handleRangeChange = (newRange) => {
    setHistoryRange(newRange)
    if (selectedWorld) {
      fetchWorldHistory(selectedWorld, newRange)
    }
  }

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortDir(column === 'players' ? 'desc' : 'asc')
    }
  }

  const getSortedWorlds = () => {
    if (!data?.worlds) return []
    let worlds = [...data.worlds]

    if (filterRegion !== 'all') {
      worlds = worlds.filter(w => w.location === filterRegion)
    }
    if (filterType !== 'all') {
      worlds = worlds.filter(w => w.world_type === filterType)
    }

    worlds.sort((a, b) => {
      let aVal = a[sortBy]
      let bVal = b[sortBy]
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()
      if (sortDir === 'asc') {
        return aVal > bVal ? 1 : -1
      } else {
        return aVal < bVal ? 1 : -1
      }
    })

    return worlds
  }

  const regions = data?.summary?.byRegion ? Object.keys(data.summary.byRegion).sort() : []
  const types = data?.summary?.byType ? Object.keys(data.summary.byType).sort() : []
  const sortedWorlds = getSortedWorlds()

  // Calculate filtered stats based on current filters AND selected world
  const getFilteredStats = () => {
    if (!data?.worlds) return { activities: [], regions: {}, freeTotal: 0, membersTotal: 0, totalPlayers: 0, worldCount: 0 }

    let worlds = [...data.worlds]

    // Apply filters
    if (filterRegion !== 'all') {
      worlds = worlds.filter(w => w.location === filterRegion)
    }
    if (filterType !== 'all') {
      worlds = worlds.filter(w => w.world_type === filterType)
    }

    // If a world is selected, show only that world's stats
    if (selectedWorld) {
      worlds = worlds.filter(w => w.world_id === selectedWorld.world_id)
    }

    // Calculate activities from filtered worlds
    const activityMap = {}
    const regionMap = {}
    let freeTotal = 0
    let membersTotal = 0
    let totalPlayers = 0

    for (const w of worlds) {
      totalPlayers += w.players

      // Activities
      const activity = w.activity && w.activity !== '-' ? w.activity : 'General'
      if (!activityMap[activity]) activityMap[activity] = { count: 0, players: 0 }
      activityMap[activity].count++
      activityMap[activity].players += w.players

      // Regions
      if (!regionMap[w.location]) regionMap[w.location] = { count: 0, players: 0 }
      regionMap[w.location].count++
      regionMap[w.location].players += w.players

      // Free vs Members
      if (w.world_type === 'Free') {
        freeTotal += w.players
      } else if (w.world_type === 'Members') {
        membersTotal += w.players
      }
    }

    const activities = Object.entries(activityMap).sort((a, b) => b[1].players - a[1].players)

    return { activities, regions: regionMap, freeTotal, membersTotal, totalPlayers, worldCount: worlds.length }
  }

  const filteredStats = getFilteredStats()
  const allActivities = filteredStats.activities
  const freeTotal = filteredStats.freeTotal
  const membersTotal = filteredStats.membersTotal
  const filteredRegions = filteredStats.regions

  // KPI totals - use filteredStats when world is selected, otherwise use sortedWorlds
  const filteredTotalPlayers = selectedWorld ? filteredStats.totalPlayers : sortedWorlds.reduce((sum, w) => sum + w.players, 0)
  const filteredWorldCount = selectedWorld ? filteredStats.worldCount : sortedWorlds.length
  const filteredAvgPerWorld = filteredWorldCount > 0 ? Math.round(filteredTotalPlayers / filteredWorldCount) : 0

  // Format timestamp for display
  const formatTimestamp = (ts) => {
    if (!ts) return '-'
    // BigQuery returns timestamp as seconds with decimals
    const date = new Date(parseFloat(ts) * 1000)
    if (isNaN(date.getTime())) return '-'
    return date.toLocaleTimeString()
  }

  // Calculate data age from scrape timestamp
  const getDataAge = () => {
    if (!data?.timestamp) return '-'
    const dataTime = parseFloat(data.timestamp) * 1000
    const ageMs = Date.now() - dataTime
    const ageMinutes = Math.floor(ageMs / 60000)
    if (ageMinutes < 1) return 'just now'
    return `${ageMinutes}m ago`
  }

  // Render mini chart for world history
  const renderHistoryChart = () => {
    if (!worldHistory || worldHistory.length === 0) return null

    const maxPlayers = Math.max(...worldHistory.map(h => h.players))
    const minPlayers = Math.min(...worldHistory.map(h => h.players))
    const range = maxPlayers - minPlayers || 1

    const pointsData = worldHistory.map((h, i) => {
      const x = 50 + (i / (worldHistory.length - 1 || 1)) * 700
      const y = 180 - ((h.players - minPlayers) / range) * 150
      return { x, y, players: h.players, timestamp: h.timestamp, index: i }
    })

    const pointsStr = pointsData.map(p => `${p.x},${p.y}`).join(' ')

    return (
      <svg width="100%" height="220" viewBox="0 0 800 220" preserveAspectRatio="none" onMouseLeave={() => setHoveredPoint(null)}>
        {/* Y-axis labels */}
        <text x="45" y="35" fill="#888" fontSize="11" textAnchor="end">{maxPlayers.toLocaleString()}</text>
        <text x="45" y="180" fill="#888" fontSize="11" textAnchor="end">{minPlayers.toLocaleString()}</text>

        {/* Grid lines */}
        <line x1="50" y1="30" x2="750" y2="30" stroke="#333" strokeWidth="1" />
        <line x1="50" y1="105" x2="750" y2="105" stroke="#333" strokeWidth="1" />
        <line x1="50" y1="180" x2="750" y2="180" stroke="#333" strokeWidth="1" />

        {/* Area fill */}
        <path
          d={`M 50,180 L ${pointsStr} L 750,180 Z`}
          fill="rgba(74, 222, 128, 0.2)"
        />

        {/* Line */}
        <polyline
          points={pointsStr}
          fill="none"
          stroke="#4ade80"
          strokeWidth="2"
        />

        {/* Interactive data points */}
        {pointsData.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hoveredPoint === i ? 6 : 4}
            fill={hoveredPoint === i ? '#fff' : '#4ade80'}
            stroke={hoveredPoint === i ? '#4ade80' : 'none'}
            strokeWidth="2"
            style={{ cursor: 'pointer', transition: 'r 0.1s ease' }}
            onMouseEnter={() => setHoveredPoint(i)}
          />
        ))}

        {/* Tooltip */}
        {hoveredPoint !== null && pointsData[hoveredPoint] && (
          <>
            <rect
              x={Math.min(Math.max(pointsData[hoveredPoint].x - 60, 5), 680)}
              y={Math.max(pointsData[hoveredPoint].y - 50, 5)}
              width="120"
              height="40"
              rx="4"
              fill="#222"
              stroke="#444"
            />
            <text
              x={Math.min(Math.max(pointsData[hoveredPoint].x, 65), 740)}
              y={Math.max(pointsData[hoveredPoint].y - 32, 23)}
              fill="#4ade80"
              fontSize="14"
              fontWeight="600"
              textAnchor="middle"
            >
              {pointsData[hoveredPoint].players.toLocaleString()} players
            </text>
            <text
              x={Math.min(Math.max(pointsData[hoveredPoint].x, 65), 740)}
              y={Math.max(pointsData[hoveredPoint].y - 16, 39)}
              fill="#888"
              fontSize="11"
              textAnchor="middle"
            >
              {new Date(parseFloat(pointsData[hoveredPoint].timestamp) * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </text>
          </>
        )}

        {/* X-axis labels - show 6 evenly spaced timestamps with date for longer ranges */}
        {worldHistory.length > 0 && (
          <>
            {[0, 0.2, 0.4, 0.6, 0.8, 1].map((pct, i) => {
              const idx = Math.floor(pct * (worldHistory.length - 1))
              const x = 50 + pct * 700
              const date = new Date(parseFloat(worldHistory[idx].timestamp) * 1000)
              // Show date for ranges longer than a day
              const showDate = historyRange !== 'day'
              const label = showDate
                ? `${date.getMonth()+1}/${date.getDate()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
                : date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
              return (
                <text key={i} x={x} y="200" fill="#888" fontSize="10" textAnchor="middle">
                  {label}
                </text>
              )
            })}
          </>
        )}
      </svg>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <style>{scrollbarStyles}</style>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid #222', padding: isMobile ? '12px 16px' : '16px 32px', display: 'flex', justifyContent: 'space-between' }}>
        <a href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: '600', fontSize: isMobile ? '16px' : '18px' }}>aggrgtr</a>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <a href="https://paypal.me/aggrgtr" target="_blank" rel="noopener" style={{ color: '#4ade80', textDecoration: 'none', fontWeight: '500' }}>Donate</a>
          <a href="/subscribe" style={{ color: '#fff', textDecoration: 'none' }}>Subscribe</a>
          <a href="/" style={{ color: '#fff', textDecoration: 'none' }}>Datasets</a>
          <a href="#" style={{ color: '#fff', textDecoration: 'none' }}>GitHub</a>
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
            {!isMobile && <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Dashboards</div>}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: isMobile ? '8px' : '6px' }}>
              <a href="/rs-population" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '8px 12px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '13px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Population</a>
              <a href="/osrs-worlds" style={{ background: '#222', border: 'none', color: '#fff', padding: isMobile ? '8px 12px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '13px' : '16px', textDecoration: 'none', fontWeight: '600' }}>OSRS Worlds</a>
              <a href="/hiscores" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '8px 12px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '13px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Hiscores</a>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: isMobile ? '12px' : '16px', marginBottom: isMobile ? '0' : '16px' }}>
            <div style={{ flex: isMobile ? 1 : 'auto' }}>
              {!isMobile && <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Region</div>}
              <select
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
                style={{ width: '100%', background: '#111', border: '1px solid #333', color: '#fff', padding: '6px', borderRadius: '4px', fontSize: '14px' }}
              >
                <option value="all">All Regions</option>
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div style={{ flex: isMobile ? 1 : 'auto' }}>
              {!isMobile && <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Type</div>}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                style={{ width: '100%', background: '#111', border: '1px solid #333', color: '#fff', padding: '6px', borderRadius: '4px', fontSize: '14px' }}
              >
                <option value="all">All Types</option>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          {!isMobile && <div style={{ fontSize: '11px', color: '#666', marginTop: '24px' }}>Data scraped from official RuneScape pages every 3 minutes.</div>}
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: isMobile ? '16px' : '24px 20px' }}>
          <h1 style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '700', color: '#fff', margin: '0 0 8px 0' }}>OSRS World Population</h1>
          <p style={{ fontSize: isMobile ? '14px' : '16px', color: '#fff', margin: isMobile ? '0 0 16px 0' : '0 0 32px 0' }}>Live player counts by world for Old School RuneScape</p>

          {loading ? (
            <div style={{ color: '#fff', padding: '40px', textAlign: 'center' }}>Loading...</div>
          ) : error ? (
            <div style={{ color: '#ff4444', padding: '40px', textAlign: 'center' }}>Error: {error}</div>
          ) : (
            <>
              {/* KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? '12px' : '20px', marginBottom: isMobile ? '16px' : '32px' }}>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '16px' : '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '11px' : '14px', fontWeight: '700', color: '#fff', marginBottom: isMobile ? '4px' : '8px', textTransform: 'uppercase' }}>Total Players</div>
                  <div style={{ fontSize: isMobile ? '24px' : '40px', fontWeight: '700', color: '#4ade80' }}>{filteredTotalPlayers.toLocaleString()}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '16px' : '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '11px' : '14px', fontWeight: '700', color: '#fff', marginBottom: isMobile ? '4px' : '8px', textTransform: 'uppercase' }}>Active Worlds</div>
                  <div style={{ fontSize: isMobile ? '24px' : '40px', fontWeight: '700', color: '#60a5fa' }}>{filteredWorldCount}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '16px' : '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '11px' : '14px', fontWeight: '700', color: '#fff', marginBottom: isMobile ? '4px' : '8px', textTransform: 'uppercase' }}>Avg Per World</div>
                  <div style={{ fontSize: isMobile ? '24px' : '40px', fontWeight: '700', color: '#fff' }}>{filteredAvgPerWorld.toLocaleString()}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '16px' : '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '11px' : '14px', fontWeight: '700', color: '#fff', marginBottom: isMobile ? '4px' : '8px', textTransform: 'uppercase' }}>Data Age</div>
                  <div style={{ fontSize: isMobile ? '14px' : '18px', fontWeight: '700', color: '#4ade80' }}>
                    {getDataAge()}
                  </div>
                </div>
              </div>

              {/* World History Modal/Panel */}
              {selectedWorld && (
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '20px', marginBottom: '32px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', margin: 0 }}>
                      {selectedWorld.world_name} - Population History
                    </h3>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <select
                        value={historyRange}
                        onChange={(e) => handleRangeChange(e.target.value)}
                        style={{ background: '#222', border: '1px solid #333', color: '#fff', padding: '6px 10px', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}
                      >
                        <option value="day">Last 24 Hours</option>
                        <option value="week">Last Week</option>
                        <option value="month">Last Month</option>
                        <option value="quarter">Last Quarter</option>
                        <option value="year">Last Year</option>
                      </select>
                      <button
                        onClick={() => { setSelectedWorld(null); setWorldHistory(null); setHistoryRange('day'); }}
                        style={{ background: '#222', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '14px', color: '#888', flexWrap: 'wrap' }}>
                    <span>Region: {selectedWorld.location}</span>
                    <span>Type: {selectedWorld.world_type}</span>
                    <span>Activity: {selectedWorld.activity}</span>
                    <span>Current: <span style={{ color: '#4ade80', fontWeight: '600' }}>{selectedWorld.players.toLocaleString()}</span></span>
                  </div>
                  {historyLoading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading history...</div>
                  ) : worldHistory && worldHistory.length > 0 ? (
                    <div style={{ height: '220px' }}>
                      {renderHistoryChart()}
                    </div>
                  ) : (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>No history available</div>
                  )}
                  {worldHistory && worldHistory.length > 0 && (
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                      {worldHistory.length} data points from past {
                        historyRange === 'day' ? '24 hours' :
                        historyRange === 'week' ? 'week' :
                        historyRange === 'month' ? 'month' :
                        historyRange === 'quarter' ? 'quarter' :
                        'year'
                      }
                    </div>
                  )}
                </div>
              )}

              {/* Three column layout: Activities + Region + Type */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: isMobile ? '12px' : '20px', marginBottom: isMobile ? '16px' : '32px' }}>
                {/* All Activities - scrollable */}
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '16px' : '20px' }}>
                  <h3 style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '700', color: '#fff', margin: '0 0 12px 0' }}>Activities</h3>
                  <div className="dark-scrollbar" style={{ maxHeight: '300px', overflow: 'auto', paddingRight: '12px' }}>
                    {allActivities.map(([activity, stats]) => (
                      <div key={activity} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #222' }}>
                        <span style={{ color: '#fff', fontSize: '14px' }}>{activity}</span>
                        <span style={{ color: '#4ade80', fontWeight: '600', fontSize: '14px' }}>{stats.players.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* By Region */}
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '16px' : '20px' }}>
                  <h3 style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '700', color: '#fff', margin: '0 0 12px 0' }}>By Region</h3>
                  {Object.entries(filteredRegions)
                    .sort((a, b) => b[1].players - a[1].players)
                    .map(([region, stats]) => (
                      <div key={region} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #222' }}>
                        <span style={{ color: '#fff', fontSize: '14px' }}>{region} ({stats.count} worlds)</span>
                        <span style={{ color: '#60a5fa', fontWeight: '600', fontSize: '14px' }}>{stats.players.toLocaleString()}</span>
                      </div>
                    ))}
                </div>

                {/* Free vs Members */}
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '16px' : '20px' }}>
                  <h3 style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '700', color: '#fff', margin: '0 0 12px 0' }}>Free vs Members</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ color: '#60a5fa', fontSize: '14px', fontWeight: '600' }}>Free</span>
                        <span style={{ color: '#60a5fa', fontWeight: '700', fontSize: '18px' }}>{freeTotal.toLocaleString()}</span>
                      </div>
                      <div style={{ background: '#222', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                        <div style={{ background: '#60a5fa', height: '100%', width: `${(freeTotal / (freeTotal + membersTotal) * 100) || 0}%` }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ color: '#4ade80', fontSize: '14px', fontWeight: '600' }}>Members</span>
                        <span style={{ color: '#4ade80', fontWeight: '700', fontSize: '18px' }}>{membersTotal.toLocaleString()}</span>
                      </div>
                      <div style={{ background: '#222', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                        <div style={{ background: '#4ade80', height: '100%', width: `${(membersTotal / (freeTotal + membersTotal) * 100) || 0}%` }} />
                      </div>
                    </div>
                    <div style={{ borderTop: '1px solid #333', paddingTop: '16px', marginTop: '8px' }}>
                      <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Members %</div>
                      <div style={{ fontSize: '32px', fontWeight: '700', color: '#fff' }}>
                        {((membersTotal / (freeTotal + membersTotal) * 100) || 0).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* World Table */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ padding: isMobile ? '12px 16px' : '16px 20px', borderBottom: '1px solid #222' }}>
                  <h3 style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '700', color: '#fff', margin: 0 }}>
                    All Worlds {filterRegion !== 'all' || filterType !== 'all' ? `(${sortedWorlds.length} shown)` : ''}
                    {!isMobile && <span style={{ fontWeight: '400', color: '#888', fontSize: '14px', marginLeft: '12px' }}>Click a world to see history</span>}
                  </h3>
                </div>
                <div className="dark-scrollbar" style={{ maxHeight: isMobile ? '400px' : '500px', overflow: 'auto', overflowX: isMobile ? 'auto' : 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#111' }}>
                      <tr>
                        <th onClick={() => handleSort('world_id')} style={{ padding: '12px 16px', textAlign: 'left', color: '#888', fontSize: '12px', fontWeight: '600', cursor: 'pointer', borderBottom: '1px solid #222' }}>
                          WORLD {sortBy === 'world_id' && (sortDir === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort('players')} style={{ padding: '12px 16px', textAlign: 'right', color: '#888', fontSize: '12px', fontWeight: '600', cursor: 'pointer', borderBottom: '1px solid #222' }}>
                          PLAYERS {sortBy === 'players' && (sortDir === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort('location')} style={{ padding: '12px 16px', textAlign: 'left', color: '#888', fontSize: '12px', fontWeight: '600', cursor: 'pointer', borderBottom: '1px solid #222' }}>
                          REGION {sortBy === 'location' && (sortDir === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort('world_type')} style={{ padding: '12px 16px', textAlign: 'left', color: '#888', fontSize: '12px', fontWeight: '600', cursor: 'pointer', borderBottom: '1px solid #222' }}>
                          TYPE {sortBy === 'world_type' && (sortDir === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort('activity')} style={{ padding: '12px 16px', textAlign: 'left', color: '#888', fontSize: '12px', fontWeight: '600', cursor: 'pointer', borderBottom: '1px solid #222' }}>
                          ACTIVITY {sortBy === 'activity' && (sortDir === 'asc' ? '↑' : '↓')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedWorlds.map((world, i) => (
                        <tr
                          key={world.world_id}
                          onClick={() => fetchWorldHistory(world)}
                          onMouseEnter={() => setHoveredWorld(world.world_id)}
                          onMouseLeave={() => setHoveredWorld(null)}
                          style={{
                            background: selectedWorld?.world_id === world.world_id
                              ? 'rgba(74, 222, 128, 0.15)'
                              : hoveredWorld === world.world_id
                                ? 'rgba(255, 255, 255, 0.08)'
                                : (i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'),
                            cursor: 'pointer',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          <td style={{ padding: '10px 16px', color: '#fff', fontSize: '14px' }}>{world.world_name}</td>
                          <td style={{ padding: '10px 16px', color: '#4ade80', fontSize: '14px', textAlign: 'right', fontWeight: '600' }}>{world.players.toLocaleString()}</td>
                          <td style={{ padding: '10px 16px', color: '#888', fontSize: '14px' }}>{world.location}</td>
                          <td style={{ padding: '10px 16px', fontSize: '14px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              background: world.world_type === 'Members' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(96, 165, 250, 0.2)',
                              color: world.world_type === 'Members' ? '#4ade80' : '#60a5fa'
                            }}>
                              {world.world_type}
                            </span>
                          </td>
                          <td style={{ padding: '10px 16px', color: '#888', fontSize: '14px' }}>{world.activity}</td>
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

      <footer style={{ borderTop: '1px solid #222', padding: '24px 32px', fontSize: '12px', color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <a href="/about" style={{ color: '#666', textDecoration: 'none' }}>About</a>
          <a href="/privacy" style={{ color: '#666', textDecoration: 'none' }}>Privacy Policy</a>
        </div>
        <span>aggrgtr 2026 — Not affiliated with Jagex Ltd.</span>
      </footer>
    </div>
  )
}
