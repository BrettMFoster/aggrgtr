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

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60 * 1000) // Refresh every minute
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

    // Filter
    if (filterRegion !== 'all') {
      worlds = worlds.filter(w => w.location === filterRegion)
    }
    if (filterType !== 'all') {
      worlds = worlds.filter(w => w.world_type === filterType)
    }

    // Sort
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

  // Top activities by player count
  const topActivities = data?.summary?.byActivity
    ? Object.entries(data.summary.byActivity)
        .sort((a, b) => b[1].players - a[1].players)
        .slice(0, 10)
    : []

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
        <aside style={{ width: '150px', padding: '12px 24px 12px 32px', borderRight: '1px solid #222' }}>
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
                  <div style={{ fontSize: '40px', fontWeight: '700', color: '#4ade80' }}>{data?.totalPlayers?.toLocaleString() || '-'}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Active Worlds</div>
                  <div style={{ fontSize: '40px', fontWeight: '700', color: '#60a5fa' }}>{data?.count || '-'}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Avg Per World</div>
                  <div style={{ fontSize: '40px', fontWeight: '700', color: '#fff' }}>{data?.count ? Math.round(data.totalPlayers / data.count).toLocaleString() : '-'}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase' }}>Last Updated</div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#4ade80' }}>
                    {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '-'}
                  </div>
                </div>
              </div>

              {/* Two column layout: Top Activities + Region breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px' }}>
                {/* Top Activities */}
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '20px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', margin: '0 0 16px 0' }}>Top Activities</h3>
                  {topActivities.map(([activity, stats]) => (
                    <div key={activity} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #222' }}>
                      <span style={{ color: '#fff', fontSize: '14px' }}>{activity}</span>
                      <span style={{ color: '#4ade80', fontWeight: '600', fontSize: '14px' }}>{stats.players.toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                {/* By Region */}
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '20px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', margin: '0 0 16px 0' }}>By Region</h3>
                  {data?.summary?.byRegion && Object.entries(data.summary.byRegion)
                    .sort((a, b) => b[1].players - a[1].players)
                    .map(([region, stats]) => (
                      <div key={region} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #222' }}>
                        <span style={{ color: '#fff', fontSize: '14px' }}>{region} ({stats.count} worlds)</span>
                        <span style={{ color: '#60a5fa', fontWeight: '600', fontSize: '14px' }}>{stats.players.toLocaleString()}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* World Table */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #222' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', margin: 0 }}>
                    All Worlds {filterRegion !== 'all' || filterType !== 'all' ? `(${sortedWorlds.length} shown)` : ''}
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
                        <tr key={world.world_id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
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
