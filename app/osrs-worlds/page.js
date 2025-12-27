'use client'
import { useState, useEffect } from 'react'

export default function OSRSWorlds() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortBy, setSortBy] = useState('players')
  const [sortDir, setSortDir] = useState('desc')
  const [filterRegion, setFilterRegion] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [selectedWorld, setSelectedWorld] = useState(null)
  const [worldHistory, setWorldHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const fetchData = async () => {
    try {
      const res = await fetch('/api/osrs-worlds')
      const json = await res.json()
      if (json.error) {
        setError(json.error)
      } else {
        setData(json)
      }
      setLoading(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const fetchWorldHistory = async (world) => {
    setSelectedWorld(world)
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/osrs-worlds?world=${world.world_id}`)
      const json = await res.json()
      if (json.history) {
        setWorldHistory(json.history)
      }
    } catch (err) {
      console.error('Failed to fetch world history:', err)
    }
    setHistoryLoading(false)
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

  // Calculate filtered stats based on current filters
  const getFilteredStats = () => {
    if (!data?.worlds) return { activities: [], regions: {}, freeTotal: 0, membersTotal: 0 }

    let worlds = [...data.worlds]

    // Apply filters
    if (filterRegion !== 'all') {
      worlds = worlds.filter(w => w.location === filterRegion)
    }
    if (filterType !== 'all') {
      worlds = worlds.filter(w => w.world_type === filterType)
    }

    // Calculate activities from filtered worlds
    const activityMap = {}
    const regionMap = {}
    let freeTotal = 0
    let membersTotal = 0

    for (const w of worlds) {
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

    return { activities, regions: regionMap, freeTotal, membersTotal }
  }

  const filteredStats = getFilteredStats()
  const allActivities = filteredStats.activities
  const freeTotal = filteredStats.freeTotal
  const membersTotal = filteredStats.membersTotal
  const filteredRegions = filteredStats.regions

  // KPI totals based on filtered data
  const filteredTotalPlayers = sortedWorlds.reduce((sum, w) => sum + w.players, 0)
  const filteredWorldCount = sortedWorlds.length
  const filteredAvgPerWorld = filteredWorldCount > 0 ? Math.round(filteredTotalPlayers / filteredWorldCount) : 0

  // Format timestamp for display
  const formatTimestamp = (ts) => {
    if (!ts) return '-'
    // BigQuery returns timestamp as seconds with decimals
    const date = new Date(parseFloat(ts) * 1000)
    if (isNaN(date.getTime())) return '-'
    return date.toLocaleTimeString()
  }

  // Render mini chart for world history
  const renderHistoryChart = () => {
    if (!worldHistory || worldHistory.length === 0) return null

    const maxPlayers = Math.max(...worldHistory.map(h => h.players))
    const minPlayers = Math.min(...worldHistory.map(h => h.players))
    const range = maxPlayers - minPlayers || 1

    const points = worldHistory.map((h, i) => {
      const x = 50 + (i / (worldHistory.length - 1 || 1)) * 700
      const y = 180 - ((h.players - minPlayers) / range) * 150
      return `${x},${y}`
    }).join(' ')

    return (
      <svg width="100%" height="200" viewBox="0 0 800 200" preserveAspectRatio="none">
        {/* Y-axis labels */}
        <text x="45" y="35" fill="#888" fontSize="11" textAnchor="end">{maxPlayers}</text>
        <text x="45" y="180" fill="#888" fontSize="11" textAnchor="end">{minPlayers}</text>

        {/* Grid lines */}
        <line x1="50" y1="30" x2="750" y2="30" stroke="#333" strokeWidth="1" />
        <line x1="50" y1="105" x2="750" y2="105" stroke="#333" strokeWidth="1" />
        <line x1="50" y1="180" x2="750" y2="180" stroke="#333" strokeWidth="1" />

        {/* Area fill */}
        <path
          d={`M 50,180 L ${points} L 750,180 Z`}
          fill="rgba(74, 222, 128, 0.2)"
        />

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke="#4ade80"
          strokeWidth="2"
        />

        {/* X-axis labels */}
        {worldHistory.length > 0 && (
          <>
            <text x="50" y="195" fill="#888" fontSize="10" textAnchor="middle">
              {new Date(parseFloat(worldHistory[0].timestamp) * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </text>
            <text x="750" y="195" fill="#888" fontSize="10" textAnchor="middle">
              {new Date(parseFloat(worldHistory[worldHistory.length - 1].timestamp) * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </text>
          </>
        )}
      </svg>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid #222', padding: '16px 32px', display: 'flex', justifyContent: 'space-between' }}>
        <a href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: '600', fontSize: '18px' }}>aggrgtr</a>
        <div style={{ display: 'flex', gap: '24px' }}>
          <a href="/" style={{ color: '#fff', textDecoration: 'none' }}>Datasets</a>
          <a href="/rs-population" style={{ color: '#fff', textDecoration: 'none' }}>RS Population</a>
        </div>
      </nav>

      <div style={{ display: 'flex', maxWidth: '1400px', margin: '0' }}>
        {/* Sidebar */}
        <aside style={{ width: '180px', padding: '12px 24px 12px 32px', borderRight: '1px solid #222' }}>
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Dashboards</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <a href="/rs-population" style={{ background: 'transparent', border: 'none', color: '#fff', padding: '6px 8px', borderRadius: '4px', fontSize: '16px', textDecoration: 'none', fontWeight: '400' }}>Population</a>
              <a href="/osrs-worlds" style={{ background: '#222', border: 'none', color: '#fff', padding: '6px 8px', borderRadius: '4px', fontSize: '16px', textDecoration: 'none', fontWeight: '600' }}>OSRS Worlds</a>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Region</div>
            <select
              value={filterRegion}
              onChange={(e) => setFilterRegion(e.target.value)}
              style={{ width: '100%', background: '#111', border: '1px solid #333', color: '#fff', padding: '6px', borderRadius: '4px', fontSize: '14px' }}
            >
              <option value="all">All Regions</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Type</div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{ width: '100%', background: '#111', border: '1px solid #333', color: '#fff', padding: '6px', borderRadius: '4px', fontSize: '14px' }}
            >
              <option value="all">All Types</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '24px' }}>Data scraped from official RuneScape pages every 15 minutes.</div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: '24px 20px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: '700', color: '#fff', margin: '0 0 8px 0' }}>OSRS World Population</h1>
          <p style={{ fontSize: '16px', color: '#fff', margin: '0 0 32px 0' }}>Live player counts by world for Old School RuneScape</p>

          {loading ? (
            <div style={{ color: '#fff', padding: '40px', textAlign: 'center' }}>Loading...</div>
          ) : error ? (
            <div style={{ color: '#ff4444', padding: '40px', textAlign: 'center' }}>Error: {error}</div>
          ) : (
            <>
              {/* KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Total Players</div>
                  <div style={{ fontSize: '40px', fontWeight: '700', color: '#4ade80' }}>{filteredTotalPlayers.toLocaleString()}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Active Worlds</div>
                  <div style={{ fontSize: '40px', fontWeight: '700', color: '#60a5fa' }}>{filteredWorldCount}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Avg Per World</div>
                  <div style={{ fontSize: '40px', fontWeight: '700', color: '#fff' }}>{filteredAvgPerWorld.toLocaleString()}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Last Updated</div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#4ade80' }}>
                    {formatTimestamp(data?.timestamp)}
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
                    <button
                      onClick={() => { setSelectedWorld(null); setWorldHistory(null); }}
                      style={{ background: '#222', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Close
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '14px', color: '#888' }}>
                    <span>Region: {selectedWorld.location}</span>
                    <span>Type: {selectedWorld.world_type}</span>
                    <span>Activity: {selectedWorld.activity}</span>
                    <span>Current: <span style={{ color: '#4ade80', fontWeight: '600' }}>{selectedWorld.players.toLocaleString()}</span></span>
                  </div>
                  {historyLoading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading history...</div>
                  ) : worldHistory && worldHistory.length > 0 ? (
                    <div style={{ height: '200px' }}>
                      {renderHistoryChart()}
                    </div>
                  ) : (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>No history available</div>
                  )}
                  {worldHistory && worldHistory.length > 0 && (
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                      {worldHistory.length} data points from past {Math.round((parseFloat(worldHistory[worldHistory.length-1].timestamp) - parseFloat(worldHistory[0].timestamp)) / 3600)} hours
                    </div>
                  )}
                </div>
              )}

              {/* Three column layout: Activities + Region + Type */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '32px' }}>
                {/* All Activities - scrollable */}
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '20px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', margin: '0 0 16px 0' }}>Activities</h3>
                  <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                    {allActivities.map(([activity, stats]) => (
                      <div key={activity} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #222' }}>
                        <span style={{ color: '#fff', fontSize: '14px' }}>{activity}</span>
                        <span style={{ color: '#4ade80', fontWeight: '600', fontSize: '14px' }}>{stats.players.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* By Region */}
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '20px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', margin: '0 0 16px 0' }}>By Region</h3>
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
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '20px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', margin: '0 0 16px 0' }}>Free vs Members</h3>
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
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #222' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', margin: 0 }}>
                    All Worlds {filterRegion !== 'all' || filterType !== 'all' ? `(${sortedWorlds.length} shown)` : ''}
                    <span style={{ fontWeight: '400', color: '#888', fontSize: '14px', marginLeft: '12px' }}>Click a world to see history</span>
                  </h3>
                </div>
                <div style={{ maxHeight: '500px', overflow: 'auto' }}>
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
                          style={{
                            background: selectedWorld?.world_id === world.world_id ? 'rgba(74, 222, 128, 0.1)' : (i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'),
                            cursor: 'pointer'
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

      <footer style={{ borderTop: '1px solid #222', padding: '24px 32px', fontSize: '12px', color: '#666', textAlign: 'right' }}>
        aggrgtr 2025
      </footer>
    </div>
  )
}
